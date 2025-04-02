import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import EventSource from 'eventsource';

dotenv.config();

// 自定义StdioClientTransport类，以支持ES模块
class CustomStdioClientTransport {
  constructor(options) {
    this.process = options.process;
    this.onStderrData = (data) => {
      console.error(`[Server stderr]: ${data}`);
    };
    
    // 如果没有提供process，创建一个
    if (!this.process) {
      this.process = spawn(options.command, options.args || []);
      console.log(`创建了新进程: ${options.command} ${(options.args || []).join(' ')}`);
    } else {
      console.log('使用提供的进程');
    }
    
    // 设置错误处理
    this.process.stderr.on('data', this.onStderrData);
    this.process.on('error', (err) => {
      console.error('服务器进程错误:', err);
    });
    this.process.on('exit', (code) => {
      console.log(`服务器进程退出，退出码: ${code}`);
    });
    
    // 添加超时保护机制
    this.requestTimeoutMs = 60000; // 60秒超时
    this.pendingRequests = new Map(); // 请求ID -> {resolve, reject, timer}
    
    // 处理标准输出数据
    this.process.stdout.on('data', (data) => {
      console.log(`[服务器stdout原始数据]: ${data.toString().trim()}`);
      // 尝试解析JSON响应
      try {
        const response = data.toString().trim();
        console.log('[天气服务器响应]:', response);
        
        // 解析JSON响应
        try {
          const jsonResponse = JSON.parse(response);
          console.log('[解析后的JSON响应]:', jsonResponse);
          
          // 如果有ID，则清除对应的超时并解决Promise
          if (jsonResponse.id && this.pendingRequests.has(jsonResponse.id)) {
            const { resolve, timer } = this.pendingRequests.get(jsonResponse.id);
            clearTimeout(timer);
            this.pendingRequests.delete(jsonResponse.id);
            resolve(response);
          }
        } catch (jsonError) {
          console.error('[JSON解析失败]:', jsonError);
        }
      } catch (err) {
        console.error('[处理服务器响应错误]:', err);
      }
    });
  }
  
  // 添加start方法以兼容ModelContextProtocol SDK
  async start() {
    // 进程已在构造函数中启动，这里不需要做额外的事情
    // 但必须提供这个方法以满足Client.connect的调用要求
    console.log('CustomStdioClientTransport.start() 被调用');
    return;
  }
  
  async send(message) {
    // 生成唯一请求ID用于超时跟踪
    const requestObj = typeof message === 'string' ? JSON.parse(message) : message;
    const requestId = requestObj.id || Math.floor(Math.random() * 10000);
    
    console.log(`[发送请求 ID:${requestId}]:`, message);
    
    return new Promise((resolve, reject) => {
      // 确保进程仍在运行
      if (!this.process || this.process.killed) {
        return reject(new Error('服务器进程已关闭'));
      }
      
      // 确保消息是字符串
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      
      console.log('[发送到MCP服务器的消息]:', messageStr);
      
      // 设置请求超时
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`请求 ${requestId} 超时`));
        }
      }, this.requestTimeoutMs);
      
      // 保存请求
      this.pendingRequests.set(requestId, { resolve, reject, timer });
      
      // 发送消息
      this.process.stdin.write(messageStr + '\n', (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(requestId);
          reject(err);
        }
      });
    });
  }
  
  async close() {
    // 清理所有挂起的请求
    for (const [id, { reject, timer }] of this.pendingRequests.entries()) {
      clearTimeout(timer);
      reject(new Error('传输关闭'));
    }
    this.pendingRequests.clear();
    
    if (this.process && !this.process.killed) {
      this.process.stderr.removeListener('data', this.onStderrData);
      this.process.kill();
    }
  }
}

// 添加SSE传输层实现
class SSEClientTransport {
  constructor(url) {
    this.url = url;
    this.eventSource = null;
    this.messageQueue = [];
    this.resolvers = [];
  }
  
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.eventSource = new EventSource(this.url);
        
        this.eventSource.onopen = () => {
          console.log('SSE连接已打开');
          resolve();
        };
        
        this.eventSource.onerror = (error) => {
          console.error('SSE连接错误:', error);
          if (!this.eventSource || this.eventSource.readyState === EventSource.CLOSED) {
            reject(new Error('无法建立SSE连接'));
          }
        };
        
        this.eventSource.onmessage = (event) => {
          const message = event.data;
          if (this.resolvers.length > 0) {
            // 如果有等待的Promise，立即解决它
            const resolve = this.resolvers.shift();
            resolve(message);
          } else {
            // 否则将消息加入队列
            this.messageQueue.push(message);
          }
        };
        
        // 设置超时
        const timeout = setTimeout(() => {
          if (this.eventSource.readyState !== EventSource.OPEN) {
            reject(new Error('SSE连接超时'));
            this.close();
          }
        }, 10000);
        
        // 如果连接成功，清除超时
        this.eventSource.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
      } catch (error) {
        reject(error);
      }
    });
  }
  
  async send(message) {
    // 对于SSE，我们需要通过POST请求发送消息
    // 因为SSE是单向的，从服务器到客户端
    // 我们将使用fetch API发送消息到服务器
    try {
      const response = await fetch(`${this.url}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: message
      });
      
      if (!response.ok) {
        throw new Error(`HTTP错误: ${response.status}`);
      }
      
      // 等待从SSE接收响应
      if (this.messageQueue.length > 0) {
        // 如果队列中有消息，返回第一个
        return this.messageQueue.shift();
      } else {
        // 否则等待新消息
        return new Promise((resolve) => {
          this.resolvers.push(resolve);
        });
      }
    } catch (error) {
      console.error('发送消息失败:', error);
      throw error;
    }
  }
  
  async close() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}

class MCPClient {
   mcp;
   openai; // 替换 anthropic 为 openai
   transport = null;
   tools = [];

  constructor() {
    // 使用 OpenAI 客户端替换 Anthropic
    this.openai = new OpenAI({
      apiKey: "sk-fastgpt",
      baseURL: "http://localhost:3001/v1",
    });
    // 增加超时设置，将默认的60秒增加到300秒
    this.mcp = new Client({ 
      name: "mcp-client-cli", 
      version: "1.0.0",
      timeoutMs: 300000 // 增加到300秒
    });
  }
  
  // methods will go here
  async connectToServer(serverScriptPath) {
    try {
      // 检查是否是URL（用于SSE连接）
      if (serverScriptPath.startsWith('http')) {
        console.log(`【e-mcp-client.js】使用SSE连接到服务器: ${serverScriptPath}`);
        this.transport = new SSEClientTransport(serverScriptPath);
        await this.transport.start();
        this.mcp.connect(this.transport);
        
        const toolsResult = await this.mcp.listTools();
        this.tools = toolsResult.tools.map((tool) => {
          return {
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema,
          };
        });
        
        console.log(
          "已通过SSE连接到服务器，可用工具:",
          this.tools.map(({ name }) => name)
        );
        
        return;
      }
      
      const isJs = serverScriptPath.endsWith(".js");
      const isMjs = serverScriptPath.endsWith(".mjs"); // 添加对 .mjs 文件的检测
      const isPy = serverScriptPath.endsWith(".py");
      const isNpxCommand = serverScriptPath.includes("npx "); // 检查是否为npx命令
      
      if (isNpxCommand) {
        // 处理npx命令
        console.log(`【e-mcp-client.js】使用npx命令启动服务器: ${serverScriptPath}`);
        
        // 将命令拆分为命令和参数
        const parts = serverScriptPath.split(' ');
        const command = parts[0]; // 应该是 "npx"
        const args = parts.slice(1);
        
        // 为npx命令添加--no-install选项，避免每次都检查更新
        if (!args.includes('--no-install') && !args.includes('-n')) {
          args.unshift('--no-install');
        }
        
        console.log(`【e-mcp-client.js】执行命令: ${command} ${args.join(' ')}`);
        
        // 创建子进程
        const childProcess = spawn(command, args, {
          // 设置环境变量，确保子进程能正常运行
          env: { ...process.env, FORCE_COLOR: '1' }
        });
        
        // 记录子进程输出，帮助调试
        childProcess.stdout.on('data', (data) => {
          console.log(`【npx stdout】: ${data.toString().trim()}`);
        });
        
        childProcess.stderr.on('data', (data) => {
          console.log(`【npx stderr】: ${data.toString().trim()}`);
        });
        
        // 设置传输层
        this.transport = new CustomStdioClientTransport({
          process: childProcess
        });
        
        // 连接前等待一段时间，确保服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 启动传输层
        await this.transport.start();
        console.log("NPX命令传输层启动完成，准备连接到MCP服务器");
        
        // 连接到MCP服务器
        this.mcp.connect(this.transport);
        console.log("已连接到NPX命令服务器，正在获取工具列表");
        
        // 获取工具列表（增加重试机制）
        let retries = 0;
        const maxRetries = 3;
        const retryDelay = 5000; // 5秒重试间隔
        
        while (retries < maxRetries) {
          try {
            console.log(`尝试获取工具列表 (尝试 ${retries + 1}/${maxRetries})...`);
            
            // 设置超时保护
            const toolsPromise = this.mcp.listTools();
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('获取工具列表手动超时')), 60000)
            );
            
            // 使用Promise.race来避免永久挂起
            const toolsResult = await Promise.race([toolsPromise, timeoutPromise]);
            
            // 如果成功，处理工具列表
            this.tools = toolsResult.tools.map((tool) => {
              return {
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema,
              };
            });
            
            console.log(
              "已连接到NPX命令服务器，可用工具:",
              this.tools.length > 0 ? this.tools.map(({ name }) => name) : "无工具"
            );
            
            // 成功获取到工具列表，跳出循环
            break;
          } catch (e) {
            retries++;
            console.error(`获取NPX命令服务器工具列表失败 (${retries}/${maxRetries}):`, e);
            
            if (retries >= maxRetries) {
              console.error("已达到最大重试次数，将使用空工具列表继续");
              this.tools = [];
            } else {
              // 等待一段时间后重试
              console.log(`将在 ${retryDelay/1000} 秒后重试...`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
          }
        }
        
        // 提前返回，避免执行后面的代码
        return;
      } else if (!isJs && !isPy && !isMjs) {
        throw new Error("Server script must be a .js, .mjs or .py file, or an npx command, or an SSE URL");
      } else if (isPy) {
        // Python脚本处理
        const command = process.platform === "win32" ? "python" : "python3";
        this.transport = new CustomStdioClientTransport({
          command,
          args: [serverScriptPath],
        });
      } else {
        // JavaScript脚本处理
        try {
          // 检查是否为ESM模块
          const fileContent = fs.readFileSync(serverScriptPath, 'utf8');
          const isESM = isMjs || fileContent.includes('export') || fileContent.includes('import');
          
          const nodePath = process.execPath;
          let args = [serverScriptPath];
          
          // 根据不同的文件类型和模块类型设置不同的参数
          console.log("【e-mcp-client.js】isESM", isESM);
          if (isESM) {
            if (isMjs) {
              // 对于 .mjs 文件，优先使用独立的 node 命令
              const nodeAvailable = await this.checkNodeAvailable();
              
              if (nodeAvailable) {
                // 使用系统 node 命令
                const childProcess = spawn('node', [serverScriptPath]);
                
                // 记录输出便于调试
                childProcess.stdout.on('data', (data) => {
                  console.log(`【node stdout】: ${data.toString().trim()}`);
                });
                
                childProcess.stderr.on('data', (data) => {
                  console.log(`【node stderr】: ${data.toString().trim()}`);
                });
                
                this.transport = new CustomStdioClientTransport({
                  process: childProcess
                });
                
                console.log("【e-mcp-client.js】使用独立 Node 进程运行 MJS 文件:", serverScriptPath);
              } else {
                // 如果 node 不可用，尝试使用 Electron 的 Node 但添加 --input-type=module 标志
                console.log("【e-mcp-client.js】Node.js 不可用，尝试使用 Electron 运行 MJS 文件");
                
                // 首先尝试将 .mjs 内容复制到临时 .js 文件并添加 package.json
                const tempDir = path.join(path.dirname(serverScriptPath), 'temp_mjs_' + Date.now());
                fs.mkdirSync(tempDir, { recursive: true });
                
                // 创建临时 package.json 文件
                const packageJsonPath = path.join(tempDir, 'package.json');
                fs.writeFileSync(packageJsonPath, JSON.stringify({
                  "name": "temp-mjs-module",
                  "version": "1.0.0",
                  "type": "module"
                }));
                
                // 复制 MJS 文件内容到临时 JS 文件
                const tempJsPath = path.join(tempDir, 'index.js');
                fs.copyFileSync(serverScriptPath, tempJsPath);
                
                console.log(`【e-mcp-client.js】已创建临时文件: ${tempJsPath}`);
                
                // 使用 --experimental-modules 运行临时 JS 文件
                args = ['--experimental-modules', tempJsPath];
                const childProcess = spawn(nodePath, args);
                
                // 记录输出便于调试
                childProcess.stdout.on('data', (data) => {
                  console.log(`【electron node stdout】: ${data.toString().trim()}`);
                });
                
                childProcess.stderr.on('data', (data) => {
                  console.log(`【electron node stderr】: ${data.toString().trim()}`);
                });
                
                this.transport = new CustomStdioClientTransport({
                  process: childProcess
                });
              }
              
              // 提前连接并返回
              await this.transport.start();
              console.log("传输层启动完成，准备连接到MCP服务器");
              
              this.mcp.connect(this.transport);
              console.log("已连接到MCP服务器，正在获取工具列表");
              
              try {
                const toolsResult = await this.mcp.listTools();
                this.tools = toolsResult.tools.map((tool) => {
                  return {
                    name: tool.name,
                    description: tool.description,
                    input_schema: tool.inputSchema,
                  };
                });
                console.log(
                  "Connected to server with tools:",
                  this.tools.map(({ name }) => name)
                );
              } catch (e) {
                console.error("获取工具列表失败:", e);
                // 设置内置工具作为备用
                // this.setupBuiltinTools();
              }
              return;
            } else {
              // 对于 .js 文件但使用 ESM 语法
              args = ['--experimental-modules', serverScriptPath];
            }
          }
          
          console.log("【e-mcp-client.js】args", args);
          // 创建子进程
          const childProcess = spawn(nodePath, args);
          
          // 添加日志输出
          childProcess.stdout.on('data', (data) => {
            console.log(`【js stdout】: ${data.toString().trim()}`);
          });
          
          childProcess.stderr.on('data', (data) => {
            console.log(`【js stderr】: ${data.toString().trim()}`);
          });
          
          // 设置传输层
          this.transport = new CustomStdioClientTransport({
            process: childProcess
          });
          
        } catch (err) {
          console.error("无法使用Node运行服务器脚本:", err);
          throw new Error(`无法启动JavaScript服务器: ${err.message}`);
        }
      }
      
      // 启动传输层
      await this.transport.start();
      console.log("传输层启动完成，准备连接到MCP服务器");
      
      // 连接到MCP服务器
      this.mcp.connect(this.transport);
      console.log("已连接到MCP服务器，正在获取工具列表");
      
      // 尝试获取工具列表，添加更好的错误处理
      try {
        const toolsResult = await this.mcp.listTools();
        this.tools = toolsResult.tools.map((tool) => {
          return {
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema,
          };
        });
        console.log(
          "Connected to server with tools:",
          this.tools.map(({ name }) => name)
        );
      } catch (e) {
        console.error("获取工具列表失败，将使用内置工具:", e);
        // 设置内置工具作为备用
        // this.setupBuiltinTools();
        
        // 不抛出异常，允许程序继续运行
        return;
      }
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      // 设置内置工具作为备用
      // this.setupBuiltinTools();
      throw e;
    }
  }
  async processQuery(query) {
    try {
      const messages = [
        {
          role: "user",
          content: query,
        },
      ];
      console.log("【e-mcp-client.js】processQuery", query);
      console.log("【e-mcp-client.js】tools:", JSON.stringify(this.tools));
      
      // 根据tools是否为空决定是否添加tools参数
      const requestOptions = {
        model: "gpt-4o",
        max_tokens: 1000,
        messages,
      };
      
      // 只有当tools非空时才添加到请求中
      if (this.tools && this.tools.length > 0) {
        requestOptions.tools = this.tools;
      } else {
        console.log("工具列表为空，不添加tools参数");
      }
      
      // 使用 OpenAI API 替换 Anthropic API
      const response = await this.openai.chat.completions.create(requestOptions);
      
      console.log("【e-mcp-client.js】response", response);
      console.log("【e-mcp-client.js】response字符串：", JSON.stringify(response));
      const finalText = [];
      const toolResults = [];
    
      // 处理 OpenAI 的响应格式
      const message = response.choices[0].message;
      
      // 添加模型的响应
      if (message.content) {
        finalText.push(message.content);
      }
      
      // 处理工具调用
      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = JSON.parse(toolCall.function.arguments);
    
          // 处理没有MCP服务器的情况
          let result;
          if (this.mcp && this.transport) {
            try {
              // 正常通过MCP调用工具
              result = await this.mcp.callTool({
                name: toolName,
                arguments: toolArgs,
              });
            } catch (err) {
              console.error(`调用工具 ${toolName} 出错:`, err);
              result = {
                content: `调用工具失败: ${err.message}`,
              };
            }
          } else {
            // 提供模拟响应
            result = {
              content: `模拟工具${toolName}调用，参数: ${JSON.stringify(toolArgs)}。在没有MCP服务器的情况下，这是一个模拟响应。`,
            };
          }
          
          toolResults.push(result);
          finalText.push(
            `[调用工具 ${toolName} 参数 ${JSON.stringify(toolArgs)}]`
          );
    
          // 将工具结果添加到消息列表
          messages.push({
            role: "user",
            content: result.content,
          });
          console.log("【e-mcp-client.js】messages", messages);
          try {
            // 再次调用 OpenAI API 来处理工具结果
            const followupResponse = await this.openai.chat.completions.create({
              model: "gpt-4o",
              max_tokens: 1000,
              messages,
            });
      
            finalText.push(
              followupResponse.choices[0].message.content || ""
            );
          } catch (err) {
            console.error("处理工具响应失败:", err);
            finalText.push(`处理工具响应失败: ${err.message}`);
          }
        }
      }
    
      return finalText.join("\n");
    } catch (error) {
      console.error("【e-mcp-client.js】处理查询失败:", error);
      return `【e-mcp-client.js】处理查询失败: ${error.message}`;
    }
  }
  
  /**
   * 命令行对话循环
   * 注意：此方法在GUI模式下不会被调用，因为我们使用GUI界面进行对话
   * 但保留此方法以便在命令行模式下使用
   */
  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");
  
      while (true) {
        try {
          const message = await rl.question("\nQuery: ");
          if (message.toLowerCase() === "quit") {
            break;
          }
          const response = await this.processQuery(message);
          console.log("\n" + response);
        } catch (err) {
          console.error("处理查询时出错:", err);
        }
      }
    } catch (err) {
      console.error("聊天循环中发生错误:", err);
    } finally {
      rl.close();
    }
  }
  
  async cleanup() {
    try {
      if (this.transport) {
        // 关闭传输层
        await this.transport.close();
        this.transport = null;
      }
      
      if (this.mcp) {
        await this.mcp.close();
      }
      
      console.log("MCP客户端已清理");
    } catch (err) {
      console.error("关闭MCP客户端时出错:", err);
    }
  }
  
  // 添加内置工具列表，无需连接到外部服务器
  setupBuiltinTools() {
    /* 
    try {
      this.tools = [
        // {
        //   name: "mcp__read_file",
        //   description: "读取文件内容",
        //   input_schema: {
        //     type: "object",
        //     properties: {
        //       path: { type: "string" }
        //     },
        //     required: ["path"]
        //   }
        // },
        // {
        //   name: "mcp__write_file",
        //   description: "写入文件内容",
        //   input_schema: {
        //     type: "object",
        //     properties: {
        //       path: { type: "string" },
        //       content: { type: "string" }
        //     },
        //     required: ["path", "content"]
        //   }
        // },
        // {
        //   name: "mcp__list_directory",
        //   description: "列出目录内容",
        //   input_schema: {
        //     type: "object",
        //     properties: {
        //       path: { type: "string" }
        //     },
        //     required: ["path"]
        //   }
        // },
        // {
        //   name: "mcp__execute_command",
        //   description: "执行系统命令",
        //   input_schema: {
        //     type: "object",
        //     properties: {
        //       command: { type: "string" }
        //     },
        //     required: ["command"]
        //   }
        // },
        // {
        //   name: "mcp__search_web",
        //   description: "搜索网络获取信息",
        //   input_schema: {
        //     type: "object",
        //     properties: {
        //       query: { type: "string" }
        //     },
        //     required: ["query"]
        //   }
        // }
      ];
      
      console.log("已设置内置工具:", this.tools.map(({ name }) => name));
    } catch (error) {
      console.error("设置内置工具失败:", error);
      // 设置最小工具集
      this.tools = [];
    }
    */
  }
  
  // 检查 Node.js 是否可用
  async checkNodeAvailable() {
    return new Promise((resolve) => {
      const nodeProcess = spawn('node', ['--version']);
      
      nodeProcess.on('error', () => {
        console.error('Node.js 不可用，将使用 Electron 内置的 Node.js');
        resolve(false);
      });
      
      nodeProcess.stdout.on('data', (data) => {
        const version = data.toString().trim();
        console.log(`检测到 Node.js 版本: ${version}`);
        resolve(true);
      });
      
      nodeProcess.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Node.js 检查退出，退出码: ${code}`);
          resolve(false);
        }
      });
      
      // 设置超时
      setTimeout(() => {
        nodeProcess.kill();
        console.error('Node.js 检查超时');
        resolve(false);
      }, 3000);
    });
  }
}

export default MCPClient;
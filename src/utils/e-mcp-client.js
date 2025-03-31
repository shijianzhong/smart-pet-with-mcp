import { Anthropic } from "@anthropic-ai/sdk";
// 替换静态导入为动态导入，稍后在代码中使用
// import {
//   MessageParam,
//   Tool,
// } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

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
    }
    
    // 设置错误处理
    this.process.stderr.on('data', this.onStderrData);
    this.process.on('error', (err) => {
      console.error('服务器进程错误:', err);
    });
    this.process.on('exit', (code) => {
      console.log(`服务器进程退出，退出码: ${code}`);
    });
  }
  
  async send(message) {
    return new Promise((resolve, reject) => {
      // 确保进程仍在运行
      if (!this.process || this.process.killed) {
        return reject(new Error('服务器进程已关闭'));
      }
      
      // 发送消息
      this.process.stdin.write(message + '\n', (err) => {
        if (err) reject(err);
      });
      
      // 设置接收响应的处理器
      const onData = (data) => {
        const response = data.toString();
        this.process.stdout.removeListener('data', onData);
        resolve(response);
      };
      
      // 监听响应
      this.process.stdout.once('data', onData);
    });
  }
  
  async close() {
    if (this.process && !this.process.killed) {
      this.process.stderr.removeListener('data', this.onStderrData);
      this.process.kill();
    }
  }
}

// const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// if (!ANTHROPIC_API_KEY) {
//   throw new Error("ANTHROPIC_API_KEY is not set");
// }

class MCPClient {
   mcp;
   anthropic;
   transport = null;
   tools = [];
   MessageParam;
   Tool;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: "sk-fastgpt",
      baseURL: "http://localhost:3001/v1",
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    
    // 使用动态导入初始化MessageParam和Tool
    this.initializeTypes();
  }
  
  async initializeTypes() {
    try {
      const messagesModule = await import("@anthropic-ai/sdk/resources/messages/messages.mjs");
      this.MessageParam = messagesModule.MessageParam;
      this.Tool = messagesModule.Tool;
    } catch (error) {
      console.error("Failed to import message types:", error);
    }
  }

  // methods will go here
  async connectToServer(serverScriptPath) {
    try {
      const isJs = serverScriptPath.endsWith(".js");
      const isPy = serverScriptPath.endsWith(".py");
      if (!isJs && !isPy) {
        throw new Error("Server script must be a .js or .py file");
      }
      
      if (isPy) {
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
          const isESM = fileContent.includes('export') || fileContent.includes('import');
          
          const nodePath = process.execPath;
          let args = [serverScriptPath];
          
          // 如果是ESM模块，添加--experimental-modules参数
          if (isESM) {
            args = ['--experimental-modules', serverScriptPath];
          }
          
          // 创建子进程
          const childProcess = spawn(nodePath, args);
          
          // 设置传输层
          this.transport = new CustomStdioClientTransport({
            process: childProcess
          });
          
        } catch (err) {
          console.error("无法使用Node运行服务器脚本:", err);
          throw new Error(`无法启动JavaScript服务器: ${err.message}`);
        }
      }
      
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
        "Connected to server with tools:",
        this.tools.map(({ name }) => name)
      );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
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
    
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        messages,
        tools: this.tools,
      });
    
      const finalText = [];
      const toolResults = [];
    
      for (const content of response.content) {
        if (content.type === "text") {
          finalText.push(content.text);
        } else if (content.type === "tool_use") {
          const toolName = content.name;
          const toolArgs = content.input;
    
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
    
          messages.push({
            role: "user",
            content: result.content,
          });
    
          try {
            const response = await this.anthropic.messages.create({
              model: "gpt-4o",
              max_tokens: 1000,
              messages,
            });
      
            finalText.push(
              response.content[0].type === "text" ? response.content[0].text : ""
            );
          } catch (err) {
            console.error("处理工具响应失败:", err);
            finalText.push(`处理工具响应失败: ${err.message}`);
          }
        }
      }
    
      return finalText.join("\n");
    } catch (error) {
      console.error("处理查询失败:", error);
      return `处理查询失败: ${error.message}`;
    }
  }
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
    try {
      this.tools = [
        {
          name: "mcp__read_file",
          description: "读取文件内容",
          input_schema: {
            type: "object",
            properties: {
              path: { type: "string" }
            },
            required: ["path"]
          }
        },
        {
          name: "mcp__write_file",
          description: "写入文件内容",
          input_schema: {
            type: "object",
            properties: {
              path: { type: "string" },
              content: { type: "string" }
            },
            required: ["path", "content"]
          }
        },
        {
          name: "mcp__list_directory",
          description: "列出目录内容",
          input_schema: {
            type: "object",
            properties: {
              path: { type: "string" }
            },
            required: ["path"]
          }
        },
        {
          name: "mcp__execute_command",
          description: "执行系统命令",
          input_schema: {
            type: "object",
            properties: {
              command: { type: "string" }
            },
            required: ["command"]
          }
        },
        {
          name: "mcp__search_web",
          description: "搜索网络获取信息",
          input_schema: {
            type: "object",
            properties: {
              query: { type: "string" }
            },
            required: ["query"]
          }
        }
      ];
      
      console.log("已设置内置工具:", this.tools.map(({ name }) => name));
    } catch (error) {
      console.error("设置内置工具失败:", error);
      // 设置最小工具集
      this.tools = [];
    }
  }
}

export default MCPClient;
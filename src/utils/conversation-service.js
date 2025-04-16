import OpenAI from "openai";
import mcpServiceManager from './mcp-service-manager.js';
import DatabaseManager from './database.js';
import { MCPClient } from './e-mcp-client.js';

class ConversationService {
  constructor() {
    this.dbManager = new DatabaseManager();
    this.openai = null;
    this.config = {
      apiKey: "sk-fastgpt",
      baseURL: "http://localhost:3001/v1",
      model: "qwen-turbo"
    };
    
    // 初始化OpenAI配置
    this.initOpenAI();
  }
  
  // 初始化OpenAI客户端
  async initOpenAI() {
    try {
      // 获取LLM配置
      const llmSettings = await this.dbManager.getBasicSettings('llm');
      
      if (llmSettings && llmSettings.length > 0) {
        // 遍历设置
        llmSettings.forEach(setting => {
          if (setting.name === 'baseUrl' && setting.value) {
            this.config.baseURL = setting.value;
          } else if (setting.name === 'secretKey' && setting.value) {
            this.config.apiKey = setting.value;
          } else if (setting.name === 'model' && setting.value) {
            this.config.model = setting.value;
          }
        });
      }
      
      console.log('ConversationService: OpenAI配置已加载:', {
        baseURL: this.config.baseURL,
        model: this.config.model,
        apiKeySet: !!this.config.apiKey
      });
      
      // 使用配置初始化OpenAI
      this.openai = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
      });
      
      return true;
    } catch (error) {
      console.error('ConversationService: 初始化OpenAI配置失败:', error);
      
      // 使用默认配置作为备选
      this.openai = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
      });
      
      return false;
    }
  }
  
  // 获取工具列表 - 只从数据库获取
  async getTools(conversationId) {
    try {
      // 工具列表数组
      let allTools = [];
      
      console.log(`ConversationService: 开始获取工具列表，会话ID: ${conversationId || '无'}`);
      
      // 1. 如果有会话ID，获取与该会话关联的服务器工具
      if (conversationId) {
        try {
          // 获取会话关联的服务器ID
          const serverIds = await this.dbManager.getConversationServers(conversationId);
          console.log(`ConversationService: 会话${conversationId}关联了${serverIds.length}个服务器`);
          
          // 遍历每个服务器，获取它们的工具
          for (const serverId of serverIds) {
            const serverTools = await this.dbManager.getServerTools(serverId);
            console.log(`ConversationService: 服务器${serverId}拥有${serverTools ? serverTools.length : 0}个工具`);
            
            if (serverTools && serverTools.length > 0) {
              // 转换为OpenAI格式的工具
              const formattedTools = serverTools.map(tool => {
                try {
                  return {
                    type: "function",
                    function: {
                      name: tool.name,
                      description: tool.description || "",
                      parameters: tool.input_schema ? JSON.parse(tool.input_schema) : {}
                    }
                  };
                } catch (parseErr) {
                  console.error(`ConversationService: 解析工具schema失败:`, parseErr);
                  return null;
                }
              }).filter(t => t !== null); // 过滤掉解析失败的工具
              
              // 添加到工具列表
              allTools = [...allTools, ...formattedTools];
              console.log(`ConversationService: 从服务器${serverId}成功格式化${formattedTools.length}个工具`);
            }
          }
        } catch (err) {
          console.error('ConversationService: 从会话关联服务器获取工具失败:', err);
        }
      } else {
        // 2. 如果没有会话ID，获取所有服务器的工具
        try {
          // 从数据库获取所有MCP服务器
          const servers = await this.dbManager.getAllServers();
          console.log(`ConversationService: 数据库中有${servers.length}个服务器`);
          
          // 统计运行中的服务器数量
          const runningServers = servers.filter(s => s.isRunning);
          console.log(`ConversationService: 其中${runningServers.length}个服务器正在运行`);
          
          // 遍历每个服务器，获取它们的工具
          for (const server of servers) {
            if (server.isRunning) { // 只获取运行中的服务器工具
              console.log(`ConversationService: 从服务器 ${server.name}(ID:${server.id}) 获取工具`);
              const serverTools = await this.dbManager.getServerTools(server.id);
              console.log(`ConversationService: 服务器${server.id}拥有${serverTools ? serverTools.length : 0}个工具`);
              
              if (serverTools && serverTools.length > 0) {
                // 转换为OpenAI格式的工具
                const formattedTools = serverTools.map(tool => {
                  try {
                    return {
                      type: "function",
                      function: {
                        name: tool.name,
                        description: tool.description || "",
                        parameters: tool.input_schema ? JSON.parse(tool.input_schema) : {}
                      }
                    };
                  } catch (parseErr) {
                    console.error(`ConversationService: 解析工具schema失败:`, parseErr);
                    return null;
                  }
                }).filter(t => t !== null); // 过滤掉解析失败的工具
                
                // 添加到工具列表
                allTools = [...allTools, ...formattedTools];
                console.log(`ConversationService: 从服务器${server.id}成功格式化${formattedTools.length}个工具`);
              } else {
                console.warn(`ConversationService: 服务器${server.id}没有工具或工具表为空`);
              }
            }
          }
        } catch (err) {
          console.error('ConversationService: 从所有服务器获取工具失败:', err);
        }
      }
      
      // 如果数据库中没有找到工具，获取直接连接的客户端
      if (allTools.length === 0) {
        console.log('ConversationService: 数据库中没有找到工具，尝试从已连接客户端获取');
        try {
          const client = mcpServiceManager.getClient();
          if (client && client.tools && client.tools.length > 0) {
            allTools = [...client.tools];
            console.log(`ConversationService: 从直接连接客户端获取了${client.tools.length}个工具`);
            
            // 尝试保存这些工具到数据库
            this.saveToolsToDatabase(client.tools);
          } else {
            console.warn('ConversationService: 直接连接客户端也没有工具');
          }
        } catch (err) {
          console.error('ConversationService: 从直接连接客户端获取工具失败:', err);
        }
      }
      
      // 工具去重 - 根据工具名称去重
      const uniqueTools = [];
      const toolNames = new Set();
      
      for (const tool of allTools) {
        if (tool && tool.function && tool.function.name && !toolNames.has(tool.function.name)) {
          toolNames.add(tool.function.name);
          uniqueTools.push(tool);
        }
      }
      
      console.log(`ConversationService: 最终获取${uniqueTools.length}个唯一工具`);
      return uniqueTools;
    } catch (error) {
      console.error('ConversationService: 获取工具列表失败:', error);
      return [];
    }
  }
  
  // 保存工具到数据库
  async saveToolsToDatabase(tools, serverId) {
    try {
      // 如果没有指定服务器ID，使用第一个运行中的服务器
      if (!serverId) {
        const servers = await this.dbManager.getAllServers();
        const runningServer = servers.find(s => s.isRunning);
        if (runningServer) {
          serverId = runningServer.id;
        } else {
          console.warn('ConversationService: 没有运行中的服务器，无法保存工具');
          return;
        }
      }
      
      console.log(`ConversationService: 保存${tools.length}个工具到服务器${serverId}`);
      
      // 先删除该服务器的所有工具
      await this.dbManager.deleteServerTools(serverId);
      
      // 保存工具到数据库
      for (const tool of tools) {
        if (tool && tool.function) {
          try {
            await this.dbManager.addTool({
              server_id: serverId,
              name: tool.function.name,
              description: tool.function.description || "",
              input_schema: JSON.stringify(tool.function.parameters || {})
            });
          } catch (err) {
            console.error(`ConversationService: 保存工具${tool.function.name}失败:`, err);
          }
        }
      }
      
      console.log(`ConversationService: 成功保存工具到数据库`);
    } catch (error) {
      console.error('ConversationService: 保存工具到数据库失败:', error);
    }
  }
  
  // 调用工具 - 根据工具名称在合适的服务器上执行
  async callTool(toolName, args, conversationId) {
    try {
      console.log(`ConversationService: 尝试调用工具 ${toolName}`);
      
      // 记录找到工具的服务器信息
      let foundServerConfig = null;
      let foundServer = false;
      let tempClient = null;
      
      // 1. 如果有会话ID，尝试在会话关联的服务器上查找工具
      if (conversationId) {
        try {
          // 获取会话关联的服务器ID
          const serverIds = await this.dbManager.getConversationServers(conversationId);
          console.log(`ConversationService: 会话${conversationId}关联了${serverIds.length}个服务器`);
          
          // 遍历每个服务器，查找工具
          for (const serverId of serverIds) {
            const serverTools = await this.dbManager.getServerTools(serverId);
            const hasTool = serverTools && serverTools.some(tool => tool.name === toolName);
            
            if (hasTool) {
              console.log(`ConversationService: 在会话关联的服务器${serverId}上找到工具${toolName}`);
              
              // 获取服务器配置
              const serverConfig = await this.dbManager.getServerById(serverId);
              if (serverConfig) {
                foundServerConfig = serverConfig;
                foundServer = true;
                break;
              }
            }
          }
        } catch (err) {
          console.error('ConversationService: 在会话关联服务器上查找工具失败:', err);
        }
      }
      
      // 2. 如果在会话相关服务器中没找到，在所有服务器中查找
      if (!foundServer) {
        try {
          // 从数据库获取所有MCP服务器
          const servers = await this.dbManager.getAllServers();
          
          // 遍历每个服务器，查找工具
          for (const server of servers) {
            if (server.isRunning) { // 只在运行中的服务器上查找
              const serverTools = await this.dbManager.getServerTools(server.id);
              const hasTool = serverTools && serverTools.some(tool => tool.name === toolName);
              
              if (hasTool) {
                console.log(`ConversationService: 在服务器${server.id}(${server.name})上找到工具${toolName}`);
                foundServerConfig = server;
                foundServer = true;
                break;
              }
            }
          }
        } catch (err) {
          console.error('ConversationService: 在所有服务器上查找工具失败:', err);
        }
      }
      
      // 3. 如果找到了特定服务器，使用该服务器的客户端调用工具
      if (foundServer && foundServerConfig) {
        console.log(`ConversationService: 在服务器 ${foundServerConfig.name}(ID:${foundServerConfig.id}, 路径:${foundServerConfig.path}) 上调用工具 ${toolName}`);
        
        let serverClient = null;
        try {
          // 获取或创建服务器专用客户端
          try {
            serverClient = await mcpServiceManager.getClientForServer(foundServerConfig);
          } catch (clientErr) {
            console.error(`ConversationService: 获取服务器专用客户端失败，尝试创建临时客户端:`, clientErr);
            
            // 创建临时客户端
            serverClient = new MCPClient();
            await serverClient.connectToServer(foundServerConfig.path);
          }
          
          // 调用工具
          const result = await serverClient.mcp.callTool({
            name: toolName,
            arguments: args,
          });
          
          // 如果是临时创建的客户端，调用完成后清理
          if (serverClient !== mcpServiceManager.legacyClient) {
            setTimeout(() => {
              try {
                if (serverClient) {
                  serverClient.cleanup();
                  serverClient = null;
                }
              } catch (cleanupErr) {
                console.error(`ConversationService: 清理临时客户端失败:`, cleanupErr);
              }
            }, 1000);
          }
          
          return result;
        } catch (callErr) {
          // 出错时也要清理
          if (serverClient && serverClient !== mcpServiceManager.legacyClient) {
            try {
              await serverClient.cleanup();
            } catch (cleanupErr) {
              console.error(`ConversationService: 清理临时客户端失败:`, cleanupErr);
            }
          }
          
          console.error(`ConversationService: 在服务器 ${foundServerConfig.name} 上调用工具 ${toolName} 失败:`, callErr);
          throw callErr;
        }
      }
      
      // 4. 如果没找到特定服务器，尝试使用全局客户端
      console.log(`ConversationService: 未找到工具${toolName}的专用服务器，尝试使用全局客户端`);
      const client = mcpServiceManager.getClient();
      try {
        const result = await client.mcp.callTool({
          name: toolName,
          arguments: args,
        });
        return result;
      } catch (error) {
        console.error(`ConversationService: 全局客户端调用工具 ${toolName} 失败:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`ConversationService: 调用工具 ${toolName} 失败:`, error);
      throw error;
    }
  }
  
  // 处理对话查询
  async processQuery(query, conversationId) {
    try {
      console.log('ConversationService: 处理查询:', query, '对话ID:', conversationId);
      
      // 获取可用的工具
      const tools = await this.getTools(conversationId);
      console.log('ConversationService: 获取工具列表:', tools);
      const messages = [
        {
          role: "user",
          content: query,
        },
      ];
      
      // 根据tools是否为空决定是否添加tools参数
      const requestOptions = {
        model: this.config.model,
        max_tokens: 1000,
        messages,
      };
      
      // 只有当tools非空时才添加到请求中
      if (tools && tools.length > 0) {
        requestOptions.tools = tools;
      } else {
        console.log("ConversationService: 工具列表为空，不添加tools参数");
      }
      
      // 使用 OpenAI API
      const response = await this.openai.chat.completions.create(requestOptions);
      
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
    
          // 调用工具
          let result;
          try {
            result = await this.callTool(toolName, toolArgs, conversationId);
          } catch (err) {
            console.error(`ConversationService: 调用工具 ${toolName} 出错:`, err);
            result = {
              content: `调用工具失败: ${err.message}`,
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
          
          try {
            // 再次调用 OpenAI API 来处理工具结果
            const followupResponse = await this.openai.chat.completions.create({
              model: this.config.model,
              max_tokens: 1000,
              messages,
            });
      
            finalText.push(
              followupResponse.choices[0].message.content || ""
            );
          } catch (err) {
            console.error("ConversationService: 处理工具响应失败:", err);
            finalText.push(`处理工具响应失败: ${err.message}`);
          }
        }
      }
    
      // 如果有会话ID，保存消息
      if (conversationId) {
        try {
          // 先保存用户消息
          await this.dbManager.saveChatMessage({
            conversationId,
            role: 'user',
            content: query
          });
          
          // 再保存助手回复
          await this.dbManager.saveChatMessage({
            conversationId,
            role: 'assistant',
            content: finalText.join("\n")
          });
        } catch (err) {
          console.error('ConversationService: 保存对话消息失败:', err);
        }
      }
      
      return {
        text: finalText.join("\n"),
        conversationId
      };
    } catch (error) {
      console.error("ConversationService: 处理查询失败:", error);
      return {
        text: `处理查询失败: ${error.message}`,
        conversationId
      };
    }
  }
}

// 创建并导出单例
const conversationService = new ConversationService();
export default conversationService; 
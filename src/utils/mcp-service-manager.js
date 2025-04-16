import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from 'child_process';
import EventSource from 'eventsource';
import DatabaseManager from './database.js';
import path from 'path';
import fs from 'fs';
import { MCPClient } from './e-mcp-client.js';

// 自定义传输层类从e-mcp-client.js中移植过来
class CustomStdioClientTransport {
  // ... 现有的实现代码 ...
}

class SSEClientTransport {
  // ... 现有的实现代码 ...
}

// 单个MCP服务器连接管理类
class MCPServerConnection {
  constructor(serverConfig) {
    this.config = serverConfig;
    this.client = new Client({ 
      name: `mcp-client-${serverConfig.id}`, 
      version: "1.0.0",
      timeoutMs: serverConfig.timeout || 300000 
    });
    this.transport = null;
    this.tools = [];
    this.isConnected = false;
    this.connectionError = null;
  }

  async connect() {
    try {
      if (this.config.connectionType === 'http' || this.config.path.startsWith('http')) {
        this.transport = new SSEClientTransport(this.config.path);
      } else {
        // 处理文件路径或命令
        const isNpxCommand = this.config.path.includes("npx ");
        
        if (isNpxCommand) {
          const parts = this.config.path.split(' ');
          const command = parts[0]; // 应该是 "npx"
          const args = parts.slice(1);
          
          if (!args.includes('--no-install') && !args.includes('-n')) {
            args.unshift('--no-install');
          }
          
          const childProcess = spawn(command, args, {
            env: { ...process.env, FORCE_COLOR: '1' }
          });
          
          this.transport = new StdioClientTransport({
            command,
            args: args,
          });
        } else {
          // 处理其他类型的文件路径
          // ... 根据现有逻辑处理其他类型的服务器路径 ...
        }
      }
      
      await this.transport.start();
      this.client.connect(this.transport);
      
      // 获取工具列表
      const toolsResult = await this.client.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
          },
          serverId: this.config.id
        };
      });
      
      this.isConnected = true;
      
      // 将工具保存到数据库
      await this.saveToolsToDatabase();
      
      return true;
    } catch (error) {
      this.connectionError = error.message;
      this.isConnected = false;
      console.error(`连接到MCP服务器[${this.config.name}]失败:`, error);
      return false;
    }
  }
  
  async saveToolsToDatabase() {
    const dbManager = new DatabaseManager();
    // 先删除该服务器的所有工具
    await dbManager.deleteServerTools(this.config.id);
    
    // 保存新的工具列表
    for (const tool of this.tools) {
      await dbManager.addTool({
        server_id: this.config.id,
        name: tool.function.name,
        description: tool.function.description,
        input_schema: JSON.stringify(tool.function.parameters)
      });
    }
  }
  
  async callTool(name, args) {
    if (!this.isConnected) {
      throw new Error(`服务器[${this.config.name}]未连接`);
    }
    
    try {
      const result = await this.client.callTool({
        name: name,
        arguments: args,
      });
      return result;
    } catch (error) {
      console.error(`调用工具[${name}]失败:`, error);
      throw error;
    }
  }
  
  async disconnect() {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    
    if (this.client) {
      await this.client.close();
    }
    
    this.isConnected = false;
  }
}

// MCP服务管理器 - 负责管理多个MCP服务器连接
class MCPServiceManager {
  constructor() {
    this.serverConnections = new Map(); // server_id -> connection
    this.dbManager = new DatabaseManager();
    this.legacyClient = null; // 兼容旧版本的全局客户端
  }
  
  // 获取旧版MCP客户端实例（兼容层）
  getClient() {
    if (!this.legacyClient) {
      this.legacyClient = new MCPClient();
    }
    return this.legacyClient;
  }
  
  // 初始化所有MCP服务器连接
  async initializeAllServers() {
    try {
      console.log('MCPServiceManager: 初始化所有MCP服务器');
      const servers = await this.dbManager.getAllServers();
      console.log(`MCPServiceManager: 数据库中有 ${servers.length} 个服务器配置`);
      
      let connectedCount = 0;
      
      // 初始化旧版客户端
      this.getClient();
      
      // 优先连接标记为运行中的服务器
      for (const server of servers) {
        if (server.isRunning) {
          try {
            console.log(`MCPServiceManager: 尝试连接服务器 ${server.name}`);
            const connected = await this.connectToLegacyClient(server);
            if (connected) {
              connectedCount++;
              console.log(`MCPServiceManager: 服务器 ${server.name} 连接成功`);
            }
          } catch (e) {
            console.error(`MCPServiceManager: 连接服务器 ${server.name} 失败:`, e);
          }
        }
      }
      
      console.log(`MCPServiceManager: 已连接 ${connectedCount} 个服务器`);
      return connectedCount;
    } catch (error) {
      console.error('MCPServiceManager: 初始化服务器失败:', error);
      return 0;
    }
  }
  
  // 连接服务器到旧版客户端（兼容层）
  async connectToLegacyClient(serverConfig) {
    try {
      console.log(`MCPServiceManager: 连接服务器 ${serverConfig.name} 到旧版客户端`);
      const client = this.getClient();
      await client.connectToServer(serverConfig.path);
      
      // 保存工具到数据库
      if (client.tools && client.tools.length > 0) {
        console.log(`MCPServiceManager: 服务器 ${serverConfig.name} 提供了 ${client.tools.length} 个工具，正在保存到数据库...`);
        
        // 删除该服务器的所有工具
        const deleteCount = await this.dbManager.deleteServerTools(serverConfig.id);
        console.log(`MCPServiceManager: 删除了 ${deleteCount} 个旧工具记录`);
        
        // 保存新的工具列表
        let savedCount = 0;
        for (const tool of client.tools) {
          if (tool && tool.function) {
            try {
              await this.dbManager.addTool({
                server_id: serverConfig.id,
                name: tool.function.name,
                description: tool.function.description || "",
                input_schema: JSON.stringify(tool.function.parameters || {})
              });
              savedCount++;
            } catch (saveErr) {
              console.error(`MCPServiceManager: 保存工具 ${tool.function.name} 失败:`, saveErr);
            }
          }
        }
        console.log(`MCPServiceManager: 成功保存 ${savedCount}/${client.tools.length} 个工具到数据库`);
      } else {
        console.log(`MCPServiceManager: 服务器 ${serverConfig.name} 未提供任何工具`);
      }
      
      // 更新服务器状态
      serverConfig.status = '运行中';
      serverConfig.isRunning = true;
      await this.dbManager.addServer(serverConfig);
      
      console.log(`MCPServiceManager: 服务器 ${serverConfig.name} 连接成功`);
      return true;
    } catch (error) {
      console.error(`MCPServiceManager: 连接服务器失败:`, error);
      
      // 更新状态为失败
      serverConfig.status = `连接失败: ${error.message}`;
      serverConfig.isRunning = false;
      await this.dbManager.addServer(serverConfig);
      
      return false;
    }
  }
  
  // 连接服务器（将来支持多服务器同时连接）
  async connectServer(serverConfig) {
    // 在当前过渡阶段，还是用旧的方式连接
    return await this.connectToLegacyClient(serverConfig);
  }
  
  // 断开服务器连接
  async disconnectServer(serverId) {
    try {
      console.log(`MCPServiceManager: 断开服务器连接, ID: ${serverId}`);
      
      // 获取服务器配置
      const serverConfig = await this.dbManager.getServerById(serverId);
      if (!serverConfig) {
        console.error(`MCPServiceManager: 未找到服务器配置, ID: ${serverId}`);
        return false;
      }
      
      // 更新服务器状态
      serverConfig.status = '已断开';
      serverConfig.isRunning = false;
      await this.dbManager.addServer(serverConfig);
      
      console.log(`MCPServiceManager: 服务器 ${serverConfig.name} 已标记为断开`);
      return true;
    } catch (error) {
      console.error(`MCPServiceManager: 断开服务器连接失败:`, error);
      return false;
    }
  }
  
  // 创建会话（临时实现，后续会支持真实会话管理）
  async createConversation(name) {
    try {
      // 确保数据库中有这个表
      await this.ensureConversationTables();
      
      const id = await this.dbManager.createConversation(name);
      console.log(`MCPServiceManager: 创建会话成功, ID: ${id}, 名称: ${name}`);
      return id;
    } catch (error) {
      console.error(`MCPServiceManager: 创建会话失败:`, error);
      return 0;
    }
  }
  
  // 确保会话相关表存在
  async ensureConversationTables() {
    try {
      // 创建会话表
      await this.dbManager.db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // 创建会话-服务器映射表
      await this.dbManager.db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_conversation_servers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER NOT NULL,
          server_id INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversation_id) REFERENCES mcp_conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
          UNIQUE(conversation_id, server_id)
        );
      `);
      
      // 创建聊天消息表
      await this.dbManager.db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversation_id) REFERENCES mcp_conversations(id) ON DELETE CASCADE
        );
      `);
      
      return true;
    } catch (error) {
      console.error(`MCPServiceManager: 确保会话表存在失败:`, error);
      return false;
    }
  }
  
  // 为会话添加服务器
  async addServerToConversation(conversationId, serverId) {
    try {
      // 确保会话相关表存在
      await this.ensureConversationTables();
      
      // 准备SQL语句
      const stmt = this.dbManager.db.prepare(`
        INSERT OR IGNORE INTO mcp_conversation_servers 
        (conversation_id, server_id)
        VALUES (?, ?)
      `);
      
      const result = stmt.run(conversationId, serverId);
      
      // 更新会话的更新时间
      this.dbManager.db.prepare(`
        UPDATE mcp_conversations 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(conversationId);
      
      console.log(`MCPServiceManager: 为会话 ${conversationId} 添加服务器 ${serverId} ${result.changes > 0 ? '成功' : '失败(可能已存在)'}`);
      return result.changes > 0;
    } catch (error) {
      console.error(`MCPServiceManager: 为会话添加服务器失败:`, error);
      return false;
    }
  }
  
  // 关闭服务器管理器
  async shutdown() {
    try {
      console.log('MCPServiceManager: 关闭服务器管理器');
      
      // 关闭旧版客户端
      if (this.legacyClient) {
        await this.legacyClient.cleanup();
        this.legacyClient = null;
      }
      
      // 清空服务器连接
      this.serverConnections.clear();
      
      console.log('MCPServiceManager: 服务器管理器已关闭');
      return true;
    } catch (error) {
      console.error('MCPServiceManager: 关闭服务器管理器失败:', error);
      return false;
    }
  }

  // 获取或创建特定服务器的客户端
  async getClientForServer(serverConfig) {
    try {
      console.log(`MCPServiceManager: 获取服务器 ${serverConfig.name} 的客户端`);
      
      // 如果旧客户端已连接到该服务器，直接返回
      if (this.legacyClient && this.legacyClient.currentServerPath === serverConfig.path) {
        console.log(`MCPServiceManager: 使用现有全局客户端，已连接到 ${serverConfig.path}`);
        return this.legacyClient;
      }
      
      // 创建一个新的客户端并连接
      const client = new MCPClient();
      await client.connectToServer(serverConfig.path);
      console.log(`MCPServiceManager: 为服务器 ${serverConfig.name} 创建了新客户端`);
      
      return client;
    } catch (error) {
      console.error(`MCPServiceManager: 为服务器 ${serverConfig.name} 创建客户端失败:`, error);
      throw error;
    }
  }
}

// 创建单例
const mcpServiceManager = new MCPServiceManager();
export default mcpServiceManager; 
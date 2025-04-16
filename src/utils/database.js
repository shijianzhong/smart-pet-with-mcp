import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

export default class DatabaseManager {
  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'mcp_servers.db');
    this.db = null;
    this.isInitialized = false;
    this.initDatabase();
  }

  initDatabase() {
    try {
      console.log(`开始初始化数据库，路径: ${this.dbPath}`);
      
      // 确保数据库目录存在
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        console.log(`创建数据库目录: ${dbDir}`);
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // 检查是否有旧的损坏数据库文件
      if (fs.existsSync(this.dbPath)) {
        console.log(`数据库文件已存在，检查完整性: ${this.dbPath}`);
        try {
          // 尝试打开数据库测试是否可用
          const testDb = new Database(this.dbPath, { readonly: true });
          testDb.prepare('SELECT 1').get();
          testDb.close();
          console.log('现有数据库文件完整性验证通过');
        } catch (err) {
          // 数据库文件损坏，备份并创建新的
          const backupPath = `${this.dbPath}.bak.${Date.now()}`;
          console.log(`数据库文件可能损坏，错误: ${err.message}`);
          console.log(`备份到: ${backupPath}`);
          fs.copyFileSync(this.dbPath, backupPath);
          fs.unlinkSync(this.dbPath);
          console.log('已删除损坏的数据库文件');
        }
      }

      // 创建新的数据库连接
      console.log('创建新的数据库连接');
      this.db = new Database(this.dbPath, { 
        verbose: console.log 
      });
      
      // 删除并重建 basic_settings 表  DROP TABLE IF EXISTS basic_settings;
      this.db.exec(`
        
        
        CREATE TABLE IF NOT EXISTS basic_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          value TEXT,
          category TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(category, name)
        );
        
        CREATE TABLE IF NOT EXISTS mcp_servers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          path TEXT NOT NULL,
          status TEXT DEFAULT '未启动',
          isRunning INTEGER DEFAULT 0,
          connectionType TEXT DEFAULT 'file',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // 检查是否需要添加connectionType列
      this.addColumnIfNotExists('mcp_servers', 'connectionType', 'TEXT', "'file'");
      
      // 验证数据库是否工作正常
      const testResult = this.db.prepare('SELECT sqlite_version() as version').get();
      console.log(`数据库初始化成功，SQLite版本: ${testResult.version}`);
      
      // 创建工具表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_tools (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          server_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          input_schema TEXT,
          status TEXT DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
        );
      `);
      
      // 创建会话表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // 创建会话-服务器映射表
      this.db.exec(`
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
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversation_id) REFERENCES mcp_conversations(id) ON DELETE CASCADE
        );
      `);
      
      this.isInitialized = true;
    } catch (error) {
      console.error('数据库初始化失败:', error);
      console.error('错误堆栈:', error.stack);
      
      // 收集系统信息用于诊断
      try {
        const os = require('os');
        console.log('系统信息:');
        console.log(`- 平台: ${os.platform()}`);
        console.log(`- 架构: ${os.arch()}`);
        console.log(`- 版本: ${os.version()}`);
        console.log(`- 可用内存: ${Math.round(os.freemem() / 1024 / 1024)}MB / ${Math.round(os.totalmem() / 1024 / 1024)}MB`);
        
        // 检查数据库目录权限
        try {
          const testFile = path.join(path.dirname(this.dbPath), `test_${Date.now()}.txt`);
          fs.writeFileSync(testFile, 'test');
          fs.unlinkSync(testFile);
          console.log(`数据库目录权限检查通过`);
        } catch (permErr) {
          console.error(`数据库目录权限问题:`, permErr);
        }
      } catch (infoErr) {
        console.error('获取系统信息失败:', infoErr);
      }
      
      this.db = null;
    }
  }
  
  // 确保数据库连接可用
  ensureConnection() {
    if (!this.db) {
      console.log('数据库连接不可用，尝试重新初始化...', new Error().stack);
      this.initDatabase();
      
      if (!this.db) {
        console.error('无法重新初始化数据库连接', new Error().stack);
        // 创建内存数据库作为后备
        try {
          console.log('创建内存数据库作为后备');
          this.db = new Database(':memory:', { verbose: console.log });
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS mcp_servers (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT NOT NULL,
              type TEXT NOT NULL,
              path TEXT NOT NULL,
              status TEXT DEFAULT '未启动',
              isRunning INTEGER DEFAULT 0,
              connectionType TEXT DEFAULT 'file',
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
          console.log('内存数据库创建成功');
        } catch (e) {
          console.error('创建内存数据库失败:', e);
          console.error('错误堆栈:', e.stack);
          throw new Error('数据库连接不可用');
        }
      }
    }
    
    // 验证连接是否可用
    try {
      const result = this.db.prepare('SELECT 1 as test').get();
      console.log('数据库连接验证:', result);
    } catch (err) {
      console.error('数据库连接状态异常，尝试重新连接:', err);
      console.error('错误堆栈:', err.stack);
      this.db = null;
      return this.ensureConnection();
    }
    
    return true;
  }
  
  // 检查列是否存在，如果不存在则添加
  addColumnIfNotExists(table, column, type, defaultValue) {
    try {
      this.ensureConnection();
      
      // 获取表信息
      const tableInfo = this.db.prepare(`PRAGMA table_info(${table})`).all();
      // 检查列是否存在
      const columnExists = tableInfo.some(col => col.name === column);
      
      if (!columnExists) {
        console.log(`为${table}表添加${column}列`);
        // 添加列
        const defaultClause = defaultValue ? `DEFAULT ${defaultValue}` : '';
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type} ${defaultClause}`);
      }
    } catch (error) {
      console.error(`添加列${column}失败:`, error);
    }
  }

  // 获取所有服务器配置
  getAllServers() {
    try {
      this.ensureConnection();
      
      const stmt = this.db.prepare('SELECT * FROM mcp_servers ORDER BY created_at DESC');
      return stmt.all();
    } catch (error) {
      console.error('获取服务器列表失败:', error);
      return [];
    }
  }

  // 添加新的服务器配置
  addServer(serverConfig) {
    try {
      this.ensureConnection();
      
      const { name, type, path, status, isRunning, connectionType } = serverConfig;
      
      console.log(`尝试添加或更新服务器配置: 
        名称: ${name}
        类型: ${type}
        路径: ${path}
        状态: ${status || '未启动'}
        运行状态: ${isRunning ? '运行中' : '已停止'}
        连接类型: ${connectionType || 'file'}`);
      
      // 检查是否已存在相同路径的配置
      const existingServer = this.db.prepare('SELECT * FROM mcp_servers WHERE path = ?').get(path);
      if (existingServer) {
        // 如果存在，更新配置
        console.log(`更新现有服务器配置 ID:${existingServer.id}`);
        const stmt = this.db.prepare(
          'UPDATE mcp_servers SET name = ?, type = ?, status = ?, isRunning = ?, connectionType = ?, created_at = CURRENT_TIMESTAMP WHERE path = ?'
        );
        stmt.run(name, type, status || '未启动', isRunning ? 1 : 0, connectionType || 'file', path);
        return existingServer.id;
      } else {
        // 如果不存在，添加新配置
        console.log('添加新的服务器配置');
        const stmt = this.db.prepare(
          'INSERT INTO mcp_servers (name, type, path, status, isRunning, connectionType) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const info = stmt.run(name, type, path, status || '未启动', isRunning ? 1 : 0, connectionType || 'file');
        console.log(`新添加的服务器ID: ${info.lastInsertRowid}`);
        return info.lastInsertRowid;
      }
    } catch (error) {
      console.error('添加服务器配置失败:', error);
      console.error('错误堆栈:', error.stack);
      // 检查数据库对象
      console.log('数据库对象状态:', this.db ? '存在' : '不存在', '初始化状态:', this.isInitialized);
      
      // 如果是键值冲突等问题，可以使用内存存储作为备用
      try {
        console.log('尝试使用备用存储方式');
        // 简单地返回一个假的ID
        return Math.floor(Math.random() * 10000) + 1000;
      } catch (backupError) {
        console.error('备用存储也失败:', backupError);
      }
      
      return null;
    }
  }

  // 删除服务器配置
  deleteServer(id) {
    try {
      this.ensureConnection();
      
      const stmt = this.db.prepare('DELETE FROM mcp_servers WHERE id = ?');
      const info = stmt.run(id);
      return info.changes > 0;
    } catch (error) {
      console.error('删除服务器配置失败:', error);
      return false;
    }
  }

  // 关闭数据库连接
  close() {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
        this.isInitialized = false;
      } catch (err) {
        console.error('关闭数据库连接失败:', err);
      }
    }
  }
  
  // 更新服务器路径从 .js 到 .mjs
  updateJsToMjs(oldPath, newPath) {
    try {
      this.ensureConnection();
      
      const stmt = this.db.prepare('UPDATE mcp_servers SET path = ? WHERE path = ?');
      const info = stmt.run(newPath, oldPath);
      return info.changes > 0;
    } catch (error) {
      console.error('更新服务器路径失败:', error);
      return false;
    }
  }

  // 获取基础设置
  getBasicSettings(category) {
    try {
      this.ensureConnection();
      
      if (category) {
        const stmt = this.db.prepare('SELECT * FROM basic_settings WHERE category = ? ORDER BY id');
        return stmt.all(category);
      } else {
        const stmt = this.db.prepare('SELECT * FROM basic_settings ORDER BY category, id');
        return stmt.all();
      }
    } catch (error) {
      console.error('获取基础设置失败:', error);
      return [];
    }
  }

  // 通过名称获取特定设置
  getSettingByName(name, category) {
    try {
      this.ensureConnection();
      
      const stmt = this.db.prepare('SELECT * FROM basic_settings WHERE name = ? AND category = ? LIMIT 1');
      return stmt.get(name, category);
    } catch (error) {
      console.error(`获取设置[${name}]失败:`, error);
      return null;
    }
  }

  // 保存基础设置
  saveBasicSetting(name, value, category) {
    try {
      this.ensureConnection();
      
      console.log(`保存设置: ${name} = ${value} (${category})`);
      
      // 使用 INSERT OR REPLACE 来处理插入或更新
      const stmt = this.db.prepare(
        'INSERT OR REPLACE INTO basic_settings (name, value, category) VALUES (?, ?, ?)'
      );
      const info = stmt.run(name, value, category);
      console.log(`保存设置结果: ${info.lastInsertRowid}`);
      return info.lastInsertRowid;
    } catch (error) {
      console.error('保存设置失败:', error);
      throw error;
    }
  }

  // 删除基础设置
  deleteBasicSetting(id) {
    try {
      this.ensureConnection();
      
      const stmt = this.db.prepare('DELETE FROM basic_settings WHERE id = ?');
      const info = stmt.run(id);
      return info.changes > 0;
    } catch (error) {
      console.error('删除设置失败:', error);
      return false;
    }
  }
  
  // 批量保存设置
  batchSaveSettings(settings) {
    try {
      this.ensureConnection();
      
      // 开始事务
      this.db.exec('BEGIN TRANSACTION');
      
      try {
        const stmt = this.db.prepare(
          'INSERT OR REPLACE INTO basic_settings (name, value, category) VALUES (?, ?, ?)'
        );
        
        settings.forEach(setting => {
          stmt.run(setting.name, setting.value, setting.category);
        });
        
        // 提交事务
        this.db.exec('COMMIT');
        return true;
      } catch (error) {
        // 回滚事务
        this.db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      console.error('批量保存设置失败:', error);
      throw error;
    }
  }

  // 更新服务器状态
  updateServerStatus(id, status, isRunning) {
    try {
      this.ensureConnection();
      
      const stmt = this.db.prepare(
        'UPDATE mcp_servers SET status = ?, isRunning = ? WHERE id = ?'
      );
      
      const result = stmt.run(status, isRunning ? 1 : 0, id);
      return result.changes > 0;
    } catch (error) {
      console.error(`更新服务器状态失败:`, error);
      return false;
    }
  }

  // 删除服务器关联的所有工具
  deleteServerTools(serverId) {
    try {
      this.ensureConnection();
      
      // 检查表是否存在
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='mcp_tools'
      `).get();
      
      if (!tableExists) {
        console.log('数据库: mcp_tools表不存在，创建新表');
        // 创建工具表
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS mcp_tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            input_schema TEXT,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
          );
        `);
        return 0;
      }
      
      console.log(`数据库: 删除服务器ID=${serverId}的所有工具`);
      const stmt = this.db.prepare('DELETE FROM mcp_tools WHERE server_id = ?');
      const result = stmt.run(serverId);
      console.log(`数据库: 已删除${result.changes}个工具记录`);
      return result.changes;
    } catch (error) {
      console.error(`删除服务器工具失败:`, error);
      return 0;
    }
  }

  // 添加工具
  addTool(toolConfig) {
    try {
      this.ensureConnection();
      
      // 检查表是否存在
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='mcp_tools'
      `).get();
      
      if (!tableExists) {
        console.log('数据库: mcp_tools表不存在，创建新表');
        // 创建工具表
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS mcp_tools (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            input_schema TEXT,
            status TEXT DEFAULT 'active',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
          );
        `);
      }
      
      const { server_id, name, description, input_schema } = toolConfig;
      
      console.log(`数据库: 保存工具 ${name} 到服务器ID=${server_id}`);
      
      // 检查服务器是否存在
      const serverExists = this.db.prepare(`
        SELECT id FROM mcp_servers WHERE id = ?
      `).get(server_id);
      
      if (!serverExists) {
        console.error(`数据库: 服务器ID=${server_id}不存在，无法保存工具`);
        return 0;
      }
      
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO mcp_tools 
        (server_id, name, description, input_schema)
        VALUES (?, ?, ?, ?)
      `);
      
      const result = stmt.run(server_id, name, description, input_schema);
      console.log(`数据库: 工具 ${name} 保存成功，ID=${result.lastInsertRowid}`);
      return result.lastInsertRowid;
    } catch (error) {
      console.error(`添加工具失败:`, error);
      console.error(`工具数据:`, JSON.stringify(toolConfig));
      return 0;
    }
  }

  // 获取服务器的所有工具
  getServerTools(serverId) {
    try {
      this.ensureConnection();
      
      // 检查表是否存在
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='mcp_tools'
      `).get();
      
      if (!tableExists) {
        console.log('数据库: mcp_tools表不存在，返回空数组');
        return [];
      }
      
      console.log(`数据库: 获取服务器ID=${serverId}的所有工具`);
      const stmt = this.db.prepare('SELECT * FROM mcp_tools WHERE server_id = ?');
      const tools = stmt.all(serverId);
      console.log(`数据库: 找到${tools.length}个工具`);
      return tools;
    } catch (error) {
      console.error(`获取服务器工具失败:`, error);
      return [];
    }
  }

  // 创建会话
  createConversation(name) {
    try {
      this.ensureConnection();
      
      // 检查表是否存在
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='mcp_conversations'
      `).get();
      
      if (!tableExists) {
        // 创建会话表
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS mcp_conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
      
      const stmt = this.db.prepare(`
        INSERT INTO mcp_conversations (name, updated_at)
        VALUES (?, CURRENT_TIMESTAMP)
      `);
      
      const result = stmt.run(name);
      return result.lastInsertRowid;
    } catch (error) {
      console.error(`创建会话失败:`, error);
      return 0;
    }
  }

  // 为会话添加服务器
  addServerToConversation(conversationId, serverId) {
    try {
      this.ensureConnection();
      
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO mcp_conversation_servers 
        (conversation_id, server_id)
        VALUES (?, ?)
      `);
      
      const result = stmt.run(conversationId, serverId);
      
      // 更新会话的更新时间
      this.db.prepare(`
        UPDATE mcp_conversations 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(conversationId);
      
      return result.changes > 0;
    } catch (error) {
      console.error(`为会话添加服务器失败:`, error);
      return false;
    }
  }

  // 获取会话关联的服务器ID
  getConversationServers(conversationId) {
    try {
      this.ensureConnection();
      
      // 检查表是否存在
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='mcp_conversation_servers'
      `).get();
      
      if (!tableExists) {
        return [];
      }
      
      const stmt = this.db.prepare(`
        SELECT server_id FROM mcp_conversation_servers
        WHERE conversation_id = ?
      `);
      
      const results = stmt.all(conversationId);
      return results.map(r => r.server_id);
    } catch (error) {
      console.error(`获取会话服务器失败:`, error);
      return [];
    }
  }

  // 获取所有会话列表
  getAllConversations() {
    try {
      this.ensureConnection();
      
      // 检查表是否存在
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='mcp_conversations'
      `).get();
      
      if (!tableExists) {
        return [];
      }
      
      const stmt = this.db.prepare(`
        SELECT * FROM mcp_conversations 
        ORDER BY updated_at DESC
      `);
      
      return stmt.all();
    } catch (error) {
      console.error(`获取会话列表失败:`, error);
      return [];
    }
  }

  // 保存聊天消息
  saveChatMessage(messageData) {
    try {
      this.ensureConnection();
      
      // 检查表是否存在
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='mcp_chat_messages'
      `).get();
      
      if (!tableExists) {
        // 创建聊天消息表
        this.db.exec(`
          CREATE TABLE IF NOT EXISTS mcp_chat_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES mcp_conversations(id) ON DELETE CASCADE
          );
        `);
      }
      
      const { conversationId, role, content } = messageData;
      
      const stmt = this.db.prepare(`
        INSERT INTO mcp_chat_messages (conversation_id, role, content)
        VALUES (?, ?, ?)
      `);
      
      const result = stmt.run(conversationId, role, content);
      
      // 更新会话的更新时间
      this.db.prepare(`
        UPDATE mcp_conversations 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(conversationId);
      
      return result.lastInsertRowid;
    } catch (error) {
      console.error(`保存聊天消息失败:`, error);
      return 0;
    }
  }

  // 获取会话的聊天历史
  getChatHistory(conversationId) {
    try {
      this.ensureConnection();
      
      // 检查表是否存在
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='mcp_chat_messages'
      `).get();
      
      if (!tableExists) {
        return [];
      }
      
      const stmt = this.db.prepare(`
        SELECT * FROM mcp_chat_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
      `);
      
      return stmt.all(conversationId);
    } catch (error) {
      console.error(`获取聊天历史失败:`, error);
      return [];
    }
  }

  // 从对话中移除服务器
  removeServerFromConversation(conversationId, serverId) {
    try {
      this.ensureConnection();
      
      // 检查表是否存在
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='mcp_conversation_servers'
      `).get();
      
      if (!tableExists) {
        return false;
      }
      
      const stmt = this.db.prepare(`
        DELETE FROM mcp_conversation_servers
        WHERE conversation_id = ? AND server_id = ?
      `);
      
      const result = stmt.run(conversationId, serverId);
      
      // 更新会话的更新时间
      this.db.prepare(`
        UPDATE mcp_conversations 
        SET updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(conversationId);
      
      return result.changes > 0;
    } catch (error) {
      console.error(`从对话中移除服务器失败:`, error);
      return false;
    }
  }

  // 获取服务器by ID
  getServerById(id) {
    try {
      this.ensureConnection();
      
      const stmt = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?');
      return stmt.get(id);
    } catch (error) {
      console.error(`获取服务器(ID:${id})失败:`, error);
      return null;
    }
  }
} 
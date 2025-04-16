const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const Database = require('better-sqlite3');

// 需要在electron应用中运行这个脚本
function migrateDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'mcp_servers.db');
  
  console.log('开始架构迁移...');
  console.log(`数据库路径: ${dbPath}`);
  
  // 备份数据库
  const backupPath = `${dbPath}.bak.${Date.now()}`;
  fs.copyFileSync(dbPath, backupPath);
  console.log(`数据库已备份到: ${backupPath}`);
  
  const db = new Database(dbPath);
  
  // 开始事务
  db.exec('BEGIN TRANSACTION');
  
  try {
    // 1. 检查和创建新表
    console.log('创建新表...');
    
    // 创建工具表
    db.exec(`
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
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // 创建会话-服务器映射表
    db.exec(`
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
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES mcp_conversations(id) ON DELETE CASCADE
      );
    `);
    
    // 2. 为mcp_servers表添加优先级和超时字段
    try {
      db.exec(`ALTER TABLE mcp_servers ADD COLUMN priority INTEGER DEFAULT 0;`);
      db.exec(`ALTER TABLE mcp_servers ADD COLUMN timeout INTEGER DEFAULT 30000;`);
      console.log('成功为mcp_servers表添加新字段');
    } catch (e) {
      // 字段可能已存在，忽略错误
      console.log('mcp_servers表字段已存在或添加失败');
    }
    
    // 3. 创建一个默认对话，并将所有服务器关联到这个对话
    const createDefaultConversation = db.prepare(`
      INSERT INTO mcp_conversations (name, created_at, updated_at)
      VALUES ('默认对话', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    
    const defaultConvResult = createDefaultConversation.run();
    const defaultConversationId = defaultConvResult.lastInsertRowid;
    
    console.log(`已创建默认对话，ID: ${defaultConversationId}`);
    
    // 4. 获取所有现有服务器
    const servers = db.prepare(`SELECT id FROM mcp_servers`).all();
    
    // 5. 将所有服务器关联到默认对话
    if (servers.length > 0) {
      const addServerToConv = db.prepare(`
        INSERT OR IGNORE INTO mcp_conversation_servers 
        (conversation_id, server_id)
        VALUES (?, ?)
      `);
      
      for (const server of servers) {
        addServerToConv.run(defaultConversationId, server.id);
      }
      
      console.log(`已将${servers.length}个服务器关联到默认对话`);
    }
    
    // 提交事务
    db.exec('COMMIT');
    console.log('迁移成功完成');
    
  } catch (error) {
    // 如果出错，回滚事务
    db.exec('ROLLBACK');
    console.error('迁移失败:', error);
    throw error;
  } finally {
    // 关闭数据库连接
    db.close();
  }
}

// 在应用ready事件中调用此函数
module.exports = migrateDatabase; 
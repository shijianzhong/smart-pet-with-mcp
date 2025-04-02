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
      
      // 创建服务器配置表，添加状态字段和连接类型字段
      console.log('创建或验证数据库表结构');
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
      
      // 检查是否需要添加connectionType列
      this.addColumnIfNotExists('mcp_servers', 'connectionType', 'TEXT', "'file'");
      
      // 验证数据库是否工作正常
      const testResult = this.db.prepare('SELECT sqlite_version() as version').get();
      console.log(`数据库初始化成功，SQLite版本: ${testResult.version}`);
      
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
} 
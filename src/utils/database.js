import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

export default class DatabaseManager {
  constructor() {
    this.dbPath = path.join(app.getPath('userData'), 'mcp_servers.db');
    this.initDatabase();
  }

  initDatabase() {
    try {
      // 确保数据库目录存在
      const dbDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      this.db = new Database(this.dbPath);
      
      // 创建服务器配置表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS mcp_servers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          path TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      console.log('数据库初始化成功');
    } catch (error) {
      console.error('数据库初始化失败:', error);
    }
  }

  // 获取所有服务器配置
  getAllServers() {
    try {
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
      const { name, type, path } = serverConfig;
      
      // 检查是否已存在相同路径的配置
      const existingServer = this.db.prepare('SELECT * FROM mcp_servers WHERE path = ?').get(path);
      if (existingServer) {
        // 如果存在，更新配置
        const stmt = this.db.prepare(
          'UPDATE mcp_servers SET name = ?, type = ?, created_at = CURRENT_TIMESTAMP WHERE path = ?'
        );
        stmt.run(name, type, path);
        return existingServer.id;
      } else {
        // 如果不存在，添加新配置
        const stmt = this.db.prepare(
          'INSERT INTO mcp_servers (name, type, path) VALUES (?, ?, ?)'
        );
        const info = stmt.run(name, type, path);
        return info.lastInsertRowid;
      }
    } catch (error) {
      console.error('添加服务器配置失败:', error);
      return null;
    }
  }

  // 删除服务器配置
  deleteServer(id) {
    try {
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
      this.db.close();
    }
  }
} 
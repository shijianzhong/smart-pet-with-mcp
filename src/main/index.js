import { app, shell, BrowserWindow, ipcMain, Menu, dialog, globalShortcut, clipboard } from 'electron'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import MCPClient from '../utils/e-mcp-client'
import DatabaseManager from '../utils/database'
import fs from 'fs'

// 初始化数据库管理器
const dbManager = new DatabaseManager();

// 全局MCP客户端实例
let globalMCPClient = null;

// 用于存储已注册的快捷键和对应通道
const registeredShortcuts = new Map();

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 400, // 更适合单个Live2D模型的宽度
    height: 600, // 更适合单个Live2D模型的高度
    show: false,
    autoHideMenuBar: false, // 显示菜单栏
    transparent: true, // 启用窗口透明
    backgroundColor: '#00ffffff', // 完全透明背景
    frame: false, // 无边框窗口
    titleBarStyle: 'customButtonsOnHover', // 使用悬停时才显示的自定义按钮
    titleBarOverlay: false, // 不使用标题栏覆盖
    hasShadow: false, // 移除阴影
    resizable: false, // 禁止调整窗口大小
    maximizable: false, // 禁止最大化
    fullscreenable: false, // 禁止全屏
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false, // 允许加载本地资源
      contextIsolation: true,
      nodeIntegration: true, // 允许在渲染进程中使用Node API
      allowRunningInsecureContent: true // 允许加载不安全内容
    }
  })

  // 创建托盘菜单而不是窗口菜单
  const template = [
    {
      label: '文件',
      submenu: [
        { 
          label: '退出应用',
          accelerator: 'CmdOrCtrl+Q', // 添加快捷键
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: '设置',
      submenu: [
        { 
          label: 'MCP',
          click: () => {
            // 创建MCP服务器设置弹窗
            createMCPDialog(mainWindow)
          }
        },
        { 
          label: '基础配置',
          click: () => {
            // 创建基础配置设置弹窗
            createBasicSettingsDialog(mainWindow)
          }
        },
        { 
          label: '换装',
          click: () => {
            // 通知渲染进程打开换装对话框
            mainWindow.webContents.send('open-change-model-dialog')
          }
        }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { 
          label: '关于', 
          click: () => {
            dialog.showMessageBox(mainWindow, {
              title: '关于',
              message: 'Smart Pet with MCP',
              detail: '一个使用MCP协议的智能宠物应用',
              buttons: ['确定']
            })
          }
        }
      ]
    }
  ]

  // 创建右键菜单
  const contextMenu = Menu.buildFromTemplate(template)
  
  // 设置右键菜单
  mainWindow.webContents.on('context-menu', (_, params) => {
    contextMenu.popup({ window: mainWindow, x: params.x, y: params.y })
  })

  // 设置相同的菜单为应用菜单
  const appMenu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(appMenu);

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    
    // 当窗口准备好显示后，发送当前的MCP服务器状态
    const servers = dbManager.getAllServers();
    const runningServers = servers.filter(server => server.isRunning);
    if (runningServers.length > 0) {
      mainWindow.webContents.send('mcp-server-status', {
        running: true,
        message: `${runningServers.length}个MCP服务器正在运行`,
        servers: servers
      });
    }
  })

  // 阻止窗口最大化
  mainWindow.on('maximize', () => {
    // 立即还原窗口
    mainWindow.unmaximize();
  });

  // 阻止窗口最小化
  mainWindow.on('minimize', () => {
    // 立即还原窗口
    mainWindow.restore();
  });
  
  // 监听窗口移动事件，防止在拖拽时靠近屏幕边缘触发最大化
  mainWindow.on('will-move', (event, newBounds) => {
    const { screen } = require('electron');
    const displayBounds = screen.getDisplayMatching(newBounds).workArea;
    
    // 检查窗口是否靠近屏幕顶部 (通常这会触发最大化)
    if (newBounds.y <= 0) {
      // 阻止移动到屏幕顶部
      event.preventDefault();
      // 将窗口放置在一个安全的位置
      mainWindow.setBounds({ x: newBounds.x, y: 1, width: newBounds.width, height: newBounds.height });
    }
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// 创建MCP服务器设置弹窗
function createMCPDialog(parent) {
  const mcpDialog = new BrowserWindow({
    width: 600,
    height: 600,
    parent: parent,
    modal: true,
    show: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false, // 允许加载本地资源
      contextIsolation: true,
      nodeIntegration: true,
      allowRunningInsecureContent: true,
      // 添加剪贴板权限
      spellcheck: true,
      enableWebSQL: false,
      clipboard: true // 明确允许剪贴板访问
    },
    // 允许ESC键关闭窗口
    escapeExitsFullScreen: true
  })

  // 注册剪贴板权限处理
  mcpDialog.webContents.on('context-menu', (event, params) => {
    mcpDialog.webContents.executeJavaScript(`
      document.addEventListener('paste', (e) => {
        console.log('粘贴事件被触发');
      }, true);
    `);
  });

  mcpDialog.setMenu(null) // 移除弹窗的菜单栏
  
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mcpDialog.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/mcp-settings`)
  } else {
    mcpDialog.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: 'mcp-settings'
    })
  }

  mcpDialog.once('ready-to-show', () => {
    mcpDialog.show()
  })
  
  // 添加一个全局引用，确保弹窗不会被垃圾回收
  global.mcpDialog = mcpDialog
  
  // 窗口关闭时清除全局引用
  mcpDialog.on('closed', () => {
    global.mcpDialog = null
  })
  
  return mcpDialog
}

// 创建基础配置设置弹窗
function createBasicSettingsDialog(parent) {
  const basicSettingsDialog = new BrowserWindow({
    width: 600,
    height: 500,
    parent: parent,
    modal: true,
    show: false,
    resizable: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      contextIsolation: true,
      nodeIntegration: true,
      allowRunningInsecureContent: true,
      spellcheck: true,
      enableWebSQL: false,
      clipboard: true
    },
    escapeExitsFullScreen: true
  })

  basicSettingsDialog.setMenu(null)
  
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    basicSettingsDialog.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/basic-settings`)
  } else {
    basicSettingsDialog.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: 'basic-settings'
    })
  }

  basicSettingsDialog.once('ready-to-show', () => {
    basicSettingsDialog.show()
  })
  
  global.basicSettingsDialog = basicSettingsDialog
  
  basicSettingsDialog.on('closed', () => {
    global.basicSettingsDialog = null
  })
  
  return basicSettingsDialog
}

// 添加初始化函数，用于检查和更新 MCP 服务器路径
function initMcpServerPaths() {
  try {
    // 获取所有服务器配置
    const servers = dbManager.getAllServers();
    
    // 检查每个服务器路径
    for (const server of servers) {
      // 如果是 JS 文件，检查对应的 MJS 文件是否存在
      if (server.path.endsWith('.js')) {
        const mjsPath = server.path.replace('.js', '.mjs');
        const jsPath = server.path;
        
        if (fs.existsSync(jsPath) && !fs.existsSync(mjsPath)) {
          // 如果 JS 文件存在但 MJS 不存在，复制 JS 文件到 MJS
          console.log(`正在创建 MJS 文件: ${mjsPath}`);
          fs.copyFileSync(jsPath, mjsPath);
        }
        
        if (fs.existsSync(mjsPath)) {
          // 更新数据库中的路径
          console.log(`更新数据库服务器路径: ${jsPath} -> ${mjsPath}`);
          dbManager.updateJsToMjs(jsPath, mjsPath);
        }
      }
    }
    
    // 为 MCP 服务器目录创建 package.json 文件
    const mcpServerDir = path.join(app.getAppPath(), 'mcpservers');
    if (fs.existsSync(mcpServerDir)) {
      const packageJsonPath = path.join(mcpServerDir, 'package.json');
      
      // 如果 package.json 不存在，则创建
      if (!fs.existsSync(packageJsonPath)) {
        console.log(`为 MCP 服务器目录创建 package.json: ${packageJsonPath}`);
        const packageJson = {
          "name": "mcpservers",
          "version": "1.0.0",
          "type": "module",
          "description": "MCP 服务器模块"
        };
        
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      }
    }
  } catch (error) {
    console.error('初始化 MCP 服务器路径失败:', error);
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 应用程序初始化时检查数据库中是否有服务器配置，如果有，则自动启动这些服务器
  try {
    // 初始化MCP服务器路径
    initMcpServerPaths();
    
    // 获取所有服务器配置
    const servers = dbManager.getAllServers();
    
    // 如果数据库中存在服务器配置，则自动启动服务器
    if (servers && servers.length > 0) {
      console.log(`数据库中存在${servers.length}个MCP服务器配置，正在尝试启动...`);
      
      // 创建MCP客户端
      if (!globalMCPClient) {
        await startMCPClient();
      }
      
      // 标记是否至少有一个服务器成功启动
      let anyServerStarted = false;
      
      // 启动所有服务器
      for (let server of servers) {
        try {
          console.log(`正在启动${server.type}类型的MCP服务器，路径: ${server.path}`);
          // 根据连接类型进行不同的处理
          if (server.connectionType === 'npx' || server.path.includes('npx ')) {
            try {
              await globalMCPClient.connectToServer(server.path);
              
              // 更新服务器状态
              server.status = '运行中';
              server.isRunning = true;
              dbManager.addServer(server);
              anyServerStarted = true;
            } catch (npxErr) {
              console.error(`npx命令启动失败: ${server.path}`, npxErr);
              server.status = `启动失败: ${npxErr.message}`;
              server.isRunning = false;
              dbManager.addServer(server);
              
              // 继续尝试启动其他服务器
              continue;
            }
          } else if (server.connectionType === 'sse' || server.path.startsWith('http')) {
            try {
              await globalMCPClient.connectToServer(server.path);
              
              // 更新服务器状态
              server.status = '运行中';
              server.isRunning = true;
              dbManager.addServer(server);
              anyServerStarted = true;
            } catch (sseErr) {
              console.error(`SSE连接失败: ${server.path}`, sseErr);
              server.status = `连接失败: ${sseErr.message}`;
              server.isRunning = false;
              dbManager.addServer(server);
              
              // 继续尝试启动其他服务器
              continue;
            }
          } else {
            // 默认文件方式
            try {
              await globalMCPClient.connectToServer(server.path);
              
              // 更新服务器状态
              server.status = '运行中';
              server.isRunning = true;
              dbManager.addServer(server);
              anyServerStarted = true;
            } catch (fileErr) {
              console.error(`文件服务器启动失败: ${server.path}`, fileErr);
              server.status = `启动失败: ${fileErr.message}`;
              server.isRunning = false;
              dbManager.addServer(server);
              
              // 继续尝试启动其他服务器
              continue;
            }
          }
        } catch (err) {
          console.error(`启动MCP服务器失败: ${server.path}`, err);
          server.status = `启动失败: ${err.message}`;
          server.isRunning = false;
          dbManager.addServer(server);
        }
      }
      
      console.log(anyServerStarted ? '已成功自动启动MCP服务器' : '所有服务器自动启动失败');
      
      // 当主窗口创建后，通知渲染进程更新服务器状态
      app.on('browser-window-created', (_, window) => {
        // 等待窗口准备好后发送状态
        window.webContents.on('did-finish-load', () => {
          // 发送启动状态给渲染进程
          if (anyServerStarted) {
            window.webContents.send('mcp-server-status', {
              running: true,
              message: '已自动启动MCP服务器',
              servers: dbManager.getAllServers() // 更新后的服务器状态
            });
          }
        });
      });
    } else {
      console.log('数据库中没有MCP服务器配置，跳过自动启动');
    }
  } catch (err) {
    console.error('自动启动MCP服务器失败:', err);
  }

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))
  
  // 注册快捷键
  ipcMain.on('register-shortcut', (event, { accelerator, channel }) => {
    try {
      // 检查快捷键是否已注册
      if (globalShortcut.isRegistered(accelerator)) {
        globalShortcut.unregister(accelerator);
      }
      
      // 注册新快捷键
      const success = globalShortcut.register(accelerator, () => {
        console.log(`快捷键 ${accelerator} 被触发`);
        
        // 发送触发事件给渲染进程
        try {
          event.sender.send(channel);
        } catch (err) {
          console.error(`发送快捷键事件到渲染进程失败: ${err.message}`);
        }
      });
      
      if (success) {
        console.log(`快捷键 ${accelerator} 注册成功`);
        // 存储快捷键信息以便后续注销
        registeredShortcuts.set(channel, accelerator);
      } else {
        console.error(`快捷键 ${accelerator} 注册失败`);
      }
    } catch (err) {
      console.error(`注册快捷键 ${accelerator} 时出错:`, err);
    }
  });
  
  // 注销单个快捷键
  ipcMain.on('unregister-shortcut', (event, { channel }) => {
    try {
      const accelerator = registeredShortcuts.get(channel);
      if (accelerator) {
        globalShortcut.unregister(accelerator);
        registeredShortcuts.delete(channel);
        console.log(`快捷键 ${accelerator} 已注销`);
      }
    } catch (err) {
      console.error('注销快捷键时出错:', err);
    }
  });
  
  // 注销所有快捷键
  ipcMain.on('unregister-all-shortcuts', () => {
    try {
      globalShortcut.unregisterAll();
      registeredShortcuts.clear();
      console.log('所有快捷键已注销');
    } catch (err) {
      console.error('注销所有快捷键时出错:', err);
    }
  });
  
  // 处理MCP服务器相关的IPC
  ipcMain.on('open-file-dialog', (event) => {
    dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: '脚本文件', extensions: ['js', 'mjs', 'py'] }
      ]
    }).then(result => {
      if (!result.canceled && result.filePaths.length > 0) {
        event.reply('selected-file', result.filePaths[0])
      }
    }).catch(err => {
      console.error('选择文件时出错:', err)
    })
  })
  
  // 处理获取资源路径的请求
  ipcMain.handle('get-resource-path', (_, relativePath) => {
    // 将相对路径转换为绝对路径
    const resourcePath = path.join(app.getAppPath(), 'resources', relativePath);
    console.log(`请求资源路径: ${relativePath} -> ${resourcePath}`);
    
    // 检查文件是否存在
    if (fs.existsSync(resourcePath)) {
      return resourcePath;
    } else {
      console.error(`资源文件不存在: ${resourcePath}`);
      return null;
    }
  });
  
  // 添加一个新的IPC处理器，用于启动所有MCP服务器
  ipcMain.on('start-all-mcp-servers', async (event) => {
    try {
      // 获取所有服务器配置
      const servers = dbManager.getAllServers();
      
      event.reply('mcp-server-status', {
        running: false,
        message: `正在启动所有MCP服务器...`
      });
      
      // 如果MCP客户端尚未初始化，则创建一个
      if (!globalMCPClient) {
        globalMCPClient = new MCPClient();
      }
      
      // 标记是否至少有一个服务器成功启动
      let anyServerStarted = false;
      
      // 同步启动所有已保存的服务器
      for (let server of servers) {
        try {
          event.reply('mcp-server-status', {
            running: false,
            message: `正在启动${server.name}服务器...`
          });
          
          console.log(`正在启动${server.type}类型的MCP服务器，路径: ${server.path}`);
          // 根据连接类型进行不同的处理
          if (server.connectionType === 'npx' || server.path.includes('npx ')) {
            try {
              await globalMCPClient.connectToServer(server.path);
              
              // 更新服务器状态
              server.status = '运行中';
              server.isRunning = true;
              dbManager.addServer(server);
              anyServerStarted = true;
            } catch (npxErr) {
              console.error(`npx命令启动失败: ${server.path}`, npxErr);
              server.status = `启动失败: ${npxErr.message}`;
              server.isRunning = false;
              dbManager.addServer(server);
              
              // 继续尝试启动其他服务器
              continue;
            }
          } else if (server.connectionType === 'sse' || server.path.startsWith('http')) {
            try {
              await globalMCPClient.connectToServer(server.path);
              
              // 更新服务器状态
              server.status = '运行中';
              server.isRunning = true;
              dbManager.addServer(server);
              anyServerStarted = true;
            } catch (sseErr) {
              console.error(`SSE连接失败: ${server.path}`, sseErr);
              server.status = `连接失败: ${sseErr.message}`;
              server.isRunning = false;
              dbManager.addServer(server);
              
              // 继续尝试启动其他服务器
              continue;
            }
          } else {
            // 默认文件方式
            try {
              await globalMCPClient.connectToServer(server.path);
              
              // 更新服务器状态
              server.status = '运行中';
              server.isRunning = true;
              dbManager.addServer(server);
              anyServerStarted = true;
            } catch (fileErr) {
              console.error(`文件服务器启动失败: ${server.path}`, fileErr);
              server.status = `启动失败: ${fileErr.message}`;
              server.isRunning = false;
              dbManager.addServer(server);
              
              // 继续尝试启动其他服务器
              continue;
            }
          }
        } catch (err) {
          console.error(`启动MCP服务器失败: ${server.path}`, err);
          server.status = `启动失败: ${err.message}`;
          server.isRunning = false;
          dbManager.addServer(server);
        }
      }
      
      // 根据启动结果返回不同的状态消息
      event.reply('mcp-server-status', {
        running: anyServerStarted,
        message: anyServerStarted 
          ? '已成功启动MCP服务器' 
          : '所有服务器启动失败',
        servers: dbManager.getAllServers() // 更新后的服务器状态
      });
    } catch (err) {
      console.error('同步启动MCP服务器失败:', err);
      
      event.reply('mcp-server-status', {
        running: false,
        message: `服务器启动失败: ${err.message}`
      });
    }
  });
  
  // 修改停止服务器逻辑
  ipcMain.on('stop-mcp-server', async (event) => {
    try {
      console.log('正在停止MCP服务器');
      
      // 如果存在全局客户端，则关闭它
      if (globalMCPClient) {
        await globalMCPClient.cleanup();
        globalMCPClient = null;
      }
      
      // 获取所有服务器配置
      const servers = dbManager.getAllServers();
      
      // 更新所有服务器状态为已停止
      const updatedServers = servers.map(server => ({
        id: server.id,
        status: '已停止',
        isRunning: false
      }));
      
      // 通知渲染进程服务器已停止
      event.reply('mcp-server-status', { 
        running: false, 
        message: '所有服务器已停止',
        servers: updatedServers
      });
    } catch (err) {
      console.error('停止MCP服务器失败:', err);
      event.reply('mcp-server-status', { 
        running: true, 
        message: `停止失败: ${err.message}`
      });
    }
  });

  // 关闭MCP设置弹窗
  ipcMain.on('close-mcp-dialog', () => {
    if (global.mcpDialog && !global.mcpDialog.isDestroyed()) {
      global.mcpDialog.close()
    }
  })

  // 处理获取MCP服务器列表的请求
  ipcMain.handle('get-mcp-servers', async () => {
    try {
      return dbManager.getAllServers();
    } catch (error) {
      console.error('获取服务器列表失败:', error);
      // 尝试重新初始化数据库
      try {
        dbManager.initDatabase();
        return dbManager.getAllServers();
      } catch (retryError) {
        console.error('重试获取服务器列表失败:', retryError);
        return []; // 返回空数组以避免前端错误
      }
    }
  });

  // 修改处理保存MCP服务器配置的请求，添加状态字段
  ipcMain.handle('save-mcp-server', async (event, serverConfig) => {
    try {
      // 确保服务器配置包含状态字段
      const configWithStatus = {
        ...serverConfig,
        status: serverConfig.status || '未启动',
        isRunning: serverConfig.isRunning || false
      };
      
      return dbManager.addServer(configWithStatus);
    } catch (error) {
      console.error('保存服务器配置失败:', error);
      // 尝试重新初始化数据库并重试
      try {
        dbManager.initDatabase();
        return dbManager.addServer({
          ...serverConfig,
          status: serverConfig.status || '未启动',
          isRunning: serverConfig.isRunning || false
        });
      } catch (retryError) {
        console.error('重试保存服务器配置失败:', retryError);
        // 返回一个临时ID，避免前端错误
        return Math.floor(Math.random() * 10000) + 1000;
      }
    }
  });

  // 处理删除MCP服务器配置的请求
  ipcMain.handle('delete-mcp-server', async (event, serverId) => {
    try {
      return dbManager.deleteServer(serverId);
    } catch (error) {
      console.error('删除服务器配置失败:', error);
      // 尝试重新初始化数据库
      try {
        dbManager.initDatabase();
        return dbManager.deleteServer(serverId);
      } catch (retryError) {
        console.error('重试删除服务器配置失败:', retryError);
        return false;
      }
    }
  });

  // 添加IPC处理器，处理启动单个服务器的请求
  ipcMain.handle('load-mcp-server', async (event, serverId) => {
    console.log(`处理加载服务器请求，ID: ${serverId}`);
    
    try {
      const servers = dbManager.getAllServers();
      const serverConfig = servers.find(server => server.id === serverId);
      
      if (!serverConfig) {
        console.error(`未找到ID为${serverId}的服务器配置`);
        // 不要使用 event.reply，而是直接返回错误信息
        return { 
          success: false, 
          error: `未找到ID为${serverId}的服务器配置` 
        };
      }
      
      console.log(`找到服务器配置:`, serverConfig);
      
      // 直接返回服务器配置，不使用 event.reply
      return { 
        success: true, 
        serverConfig 
      };
    } catch (err) {
      console.error('加载MCP服务器失败:', err);
      
      // 返回错误信息，而不是尝试启动服务器
      return { 
        success: false, 
        error: `加载服务器配置失败: ${err.message}` 
      };
    }
  });

  // 处理单个服务器的启动请求
  ipcMain.on('start-single-server', async (event, serverConfig) => {
    try {
      console.log('启动单个MCP服务器:', serverConfig);
      
      // 如果MCP客户端尚未初始化，则创建一个
      if (!globalMCPClient) {
        try {
          await startMCPClient();
        } catch (clientErr) {
          console.error('创建MCP客户端失败:', clientErr);
          event.reply('mcp-server-status', {
            running: false,
            message: `初始化客户端失败: ${clientErr.message}`
          });
          return;
        }
      }
      
      event.reply('mcp-server-status', {
        running: false,
        message: `正在启动${serverConfig.name}服务器...`
      });
      
      let serverStarted = false;
      
      try {
        console.log(`正在启动${serverConfig.type}类型的MCP服务器，路径: ${serverConfig.path}`);
        
        // 根据连接类型进行不同的处理，并添加特定错误处理
        if (serverConfig.connectionType === 'npx' || serverConfig.path.includes('npx ')) {
          try {
            await globalMCPClient.connectToServer(serverConfig.path);
            serverStarted = true;
          } catch (npxErr) {
            console.error(`npx命令启动失败:`, npxErr);
            throw new Error(`npx命令执行失败: ${npxErr.message}`);
          }
        } else if (serverConfig.connectionType === 'sse' || serverConfig.path.startsWith('http')) {
          try {
            await globalMCPClient.connectToServer(serverConfig.path);
            serverStarted = true;
          } catch (sseErr) {
            console.error(`SSE连接失败:`, sseErr);
            throw new Error(`SSE连接失败: ${sseErr.message}`);
          }
        } else {
          // 默认文件方式
          try {
            await globalMCPClient.connectToServer(serverConfig.path);
            serverStarted = true;
          } catch (fileErr) {
            console.error(`文件服务器启动失败:`, fileErr);
            throw new Error(`文件服务器启动失败: ${fileErr.message}`);
          }
        }
        
        if (serverStarted) {
          // 更新状态
          serverConfig.status = '运行中';
          serverConfig.isRunning = true;
          
          // 如果是有效的服务器ID，保存更新
          if (serverConfig.id > 0) {
            dbManager.addServer(serverConfig);
          }
          
          // 工具列表为空也可以正常运行
          event.reply('mcp-server-status', {
            running: true,
            message: `${serverConfig.name}服务器已启动${globalMCPClient.tools.length > 0 ? '，工具列表已加载' : '，无工具列表'}`
          });
        } else {
          // 如果没有明确的错误但服务器也没启动成功，设置通用错误
          throw new Error('服务器启动过程中出现未知错误');
        }
      } catch (err) {
        console.error('启动MCP服务器失败:', err);
        
        event.reply('mcp-server-status', {
          running: false, // 无法使用没有工具列表的服务器
          message: `服务器启动失败: ${err.message}`
        });
        
        // 更新服务器状态为失败
        if (serverConfig.id > 0) {
          serverConfig.status = `启动失败: ${err.message}`;
          serverConfig.isRunning = false;
          dbManager.addServer(serverConfig);
        }
      }
    } catch (err) {
      console.error('启动MCP客户端失败:', err);
      
      event.reply('mcp-server-status', {
        running: false,
        message: `连接失败: ${err.message}`
      });
    }
  });
  
  // 程序启动时
  initMcpServerPaths()
  
  // 创建窗口
  createWindow()
  
  // 注册IPC处理函数，处理渲染进程发送的查询
  ipcMain.handle('process-query', async (event, query) => {
    if (!globalMCPClient) {
      await startMCPClient();
    }
    
    try {
      console.log('收到查询:', query);
      const response = await globalMCPClient.processQuery(query);
      return response;
    } catch (err) {
      console.error('【main/index.js】处理查询失败:', err);
      throw err;
    }
  });
  
  // 剪贴板相关IPC处理
  ipcMain.handle('read-clipboard-text', () => {
    console.log('读取剪贴板内容');
    return clipboard.readText();
  });
  
  ipcMain.handle('write-clipboard-text', (event, text) => {
    console.log('写入剪贴板内容:', text);
    clipboard.writeText(text);
    return true;
  });
  
  // 等待一会儿让窗口加载完成
  setTimeout(async () => {
    try {
      await startMCPClient();
    } catch (err) {
      console.error('启动MCP客户端失败:', err);
    }
  }, 2000);

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

// 修改原有的startMCPClient函数
async function startMCPClient() {
  // 如果全局MCP客户端不存在，则创建一个
  try {
    if (!globalMCPClient) {
      globalMCPClient = new MCPClient();
      // 不再调用setupBuiltinTools
      console.log('MCP客户端已初始化，等待消息查询...');
    }
    return true;
  } catch (error) {
    console.error('初始化MCP客户端失败:', error);
    // 即使初始化失败，仍然尝试创建空客户端
    if (!globalMCPClient) {
      try {
        globalMCPClient = new MCPClient();
        console.log('已创建备用MCP客户端');
      } catch (e) {
        console.error('创建备用MCP客户端也失败:', e);
      }
    }
    return false;
  }
}

// 应用退出时关闭数据库连接
app.on('will-quit', () => {
  try {
    console.log('应用即将退出，关闭数据库连接...');
    dbManager.close();
  } catch (error) {
    console.error('关闭数据库连接出错:', error);
  }
})

// 处理崩溃和挂起
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
  // 确保数据库正确关闭
  try {
    dbManager.close();
  } catch (err) {
    console.error('关闭数据库连接出错:', err);
  }
})

// 确保在主进程崩溃时也能正确关闭数据库
process.on('exit', (code) => {
  console.log(`进程即将退出，代码: ${code}`);
  // 确保数据库正确关闭
  try {
    dbManager.close();
  } catch (err) {
    console.error('关闭数据库连接出错:', err);
  }
});

// 获取基础设置
ipcMain.handle('get-basic-settings', async (_, category) => {
  try {
    return dbManager.getBasicSettings(category);
  } catch (error) {
    console.error('获取基础设置失败:', error);
    return [];
  }
});

// 保存单个基础设置
ipcMain.handle('save-basic-setting', async (_, { name, value, category }) => {
  try {
    return dbManager.saveBasicSetting(name, value, category);
  } catch (error) {
    console.error('保存基础设置失败:', error);
    return null;
  }
});

// 批量保存设置
ipcMain.handle('batch-save-settings', async (_, settings) => {
  try {
    return dbManager.batchSaveSettings(settings);
  } catch (error) {
    console.error('批量保存设置失败:', error);
    return false;
  }
});

// 关闭基础设置对话框
ipcMain.on('close-basic-settings-dialog', () => {
  if (global.basicSettingsDialog && !global.basicSettingsDialog.isDestroyed()) {
    global.basicSettingsDialog.close();
  }
});
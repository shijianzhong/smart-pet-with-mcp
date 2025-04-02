import { app, shell, BrowserWindow, ipcMain, Menu, dialog, globalShortcut } from 'electron'
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
      allowRunningInsecureContent: true
    },
    // 允许ESC键关闭窗口
    escapeExitsFullScreen: true
  })

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
  
  // 获取资源路径
  ipcMain.handle('get-resource-path', (event, relativePath) => {
    // 返回资源文件的绝对路径
    return path.join(app.getAppPath(), relativePath);
  })
  
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
            await globalMCPClient.connectToServer(server.path);
          } else if (server.connectionType === 'sse' || server.path.startsWith('http')) {
            await globalMCPClient.connectToServer(server.path);
          } else {
            // 默认文件方式
            await globalMCPClient.connectToServer(server.path);
          }
          
          // 更新服务器状态
          server.status = '运行中';
          server.isRunning = true;
          dbManager.addServer(server);
        } catch (err) {
          console.error(`启动MCP服务器失败: ${server.path}`, err);
          server.status = `启动失败: ${err.message}`;
          server.isRunning = false;
          dbManager.addServer(server);
        }
      }
      
      // 设置内置工具
      globalMCPClient.setupBuiltinTools();
      
      // 正常情况下不需要启动聊天循环
      // await globalMCPClient.chatLoop();
      
      event.reply('mcp-server-status', {
        running: true,
        message: '所有MCP服务器已启动',
        servers: dbManager.getAllServers() // 更新后的服务器状态
      });
    } catch (err) {
      console.error('同步启动MCP服务器失败:', err);
      event.reply('mcp-server-status', {
        running: false,
        message: `启动失败: ${err.message}`
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
    return dbManager.getAllServers();
  });

  // 修改处理保存MCP服务器配置的请求，添加状态字段
  ipcMain.handle('save-mcp-server', async (event, serverConfig) => {
    // 确保服务器配置包含状态字段
    const configWithStatus = {
      ...serverConfig,
      status: serverConfig.status || '未启动',
      isRunning: serverConfig.isRunning || false
    };
    
    return dbManager.addServer(configWithStatus);
  });

  // 处理删除MCP服务器配置的请求
  ipcMain.handle('delete-mcp-server', async (event, serverId) => {
    return dbManager.deleteServer(serverId);
  });

  // 添加IPC处理器，处理启动单个服务器的请求
  ipcMain.handle('load-mcp-server', async (event, serverId) => {
    try {
      const servers = dbManager.getAllServers();
      const serverConfig = servers.find(server => server.id === serverId);
      
      if (!serverConfig) {
        throw new Error(`未找到ID为${serverId}的服务器配置`);
      }
      
      event.reply('mcp-server-status', {
        running: false,
        message: `正在加载${serverConfig.name}服务器...`
      });
      
      return serverConfig;
    } catch (err) {
      console.error('加载MCP服务器失败:', err);
      
      // 如果MCP客户端尚未初始化，则创建一个
      if (!globalMCPClient) {
        globalMCPClient = new MCPClient();
      }
      
      event.reply('mcp-server-status', {
        running: false,
        message: `正在启动${serverConfig.name}服务器...`
      });
      
      try {
        console.log(`正在启动${serverConfig.type}类型的MCP服务器，路径: ${serverConfig.path}`);
        // 根据连接类型进行不同的处理
        if (serverConfig.connectionType === 'npx' || serverConfig.path.includes('npx ')) {
          await globalMCPClient.connectToServer(serverConfig.path);
        } else if (serverConfig.connectionType === 'sse' || serverConfig.path.startsWith('http')) {
          await globalMCPClient.connectToServer(serverConfig.path);
        } else {
          // 默认文件方式
          await globalMCPClient.connectToServer(serverConfig.path);
        }
        
        // 正常情况下不需要启动聊天循环
        // await globalMCPClient.chatLoop();
        
        event.reply('mcp-server-status', {
          running: true,
          message: `${serverConfig.name}服务器已启动`
        });
        
        // 更新服务器状态
        serverConfig.status = '运行中';
        serverConfig.isRunning = true;
        dbManager.addServer(serverConfig);
      } catch (err) {
        console.error(`启动MCP服务器失败: ${serverConfig.path}`, err);
        
        globalMCPClient.setupBuiltinTools();
        // await globalMCPClient.chatLoop();
        
        event.reply('mcp-server-status', {
          running: true,
          message: `警告: 启动失败，使用内置工具`
        });
        
        serverConfig.status = `启动失败: ${err.message}`;
        serverConfig.isRunning = false;
        dbManager.addServer(serverConfig);
      }
      
      return null;
    }
  });

  // 处理单个服务器的启动请求
  ipcMain.on('start-single-server', async (event, serverConfig) => {
    try {
      console.error('启动单个MCP服务器:', serverConfig);
      
      // 如果MCP客户端尚未初始化，则创建一个
      if (!globalMCPClient) {
        await startMCPClient();
      }
      
      event.reply('mcp-server-status', {
        running: false,
        message: `正在启动${serverConfig.name}服务器...`
      });
      
      try {
        console.log(`正在启动${serverConfig.type}类型的MCP服务器，路径: ${serverConfig.path}`);
        // 根据连接类型进行不同的处理
        if (serverConfig.connectionType === 'npx' || serverConfig.path.includes('npx ')) {
          await globalMCPClient.connectToServer(serverConfig.path);
        } else if (serverConfig.connectionType === 'sse' || serverConfig.path.startsWith('http')) {
          await globalMCPClient.connectToServer(serverConfig.path);
        } else {
          // 默认文件方式
          await globalMCPClient.connectToServer(serverConfig.path);
        }
        
        // 更新状态
        serverConfig.status = '运行中';
        serverConfig.isRunning = true;
        
        // 如果是有效的服务器ID，保存更新
        if (serverConfig.id > 0) {
          dbManager.addServer(serverConfig);
        }
        
        globalMCPClient.setupBuiltinTools();
        // await globalMCPClient.chatLoop();
        
        event.reply('mcp-server-status', {
          running: true,
          message: `${serverConfig.name}服务器已启动`
        });
      } catch (err) {
        console.error('启动MCP服务器失败:', err);
        event.reply('mcp-server-status', {
          running: false,
          message: `启动失败: ${err.message}`
        });
      }
    } catch (err) {
      console.error('启动MCP客户端失败:', err);
      event.reply('mcp-server-status', {
        running: false,
        message: `启动失败: ${err.message}`
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
  if (!globalMCPClient) {
    globalMCPClient = new MCPClient();
    // 使用内置工具列表
    globalMCPClient.setupBuiltinTools();
    // 不再调用chatLoop，而是通过IPC处理查询
    console.log('MCP客户端已初始化，等待消息查询...');
  }
}

// 应用退出时关闭数据库连接
app.on('will-quit', () => {
  dbManager.close();
});
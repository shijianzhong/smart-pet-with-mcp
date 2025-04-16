import { app, shell, BrowserWindow, ipcMain, Menu, dialog, globalShortcut, clipboard, Tray } from 'electron'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import MCPClient from '../utils/e-mcp-client'
import DatabaseManager from '../utils/database'
import fs from 'fs'
import mcpServiceManager from '../utils/mcp-service-manager.js'
import conversationService from '../utils/conversation-service.js'

// 初始化数据库管理器
const dbManager = new DatabaseManager();

// 全局MCP客户端实例
let globalMCPClient = null;

// 用于存储已注册的快捷键和对应通道
const registeredShortcuts = new Map();

// 全局变量，用于存储托盘对象
let tray = null;

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
    icon, // 在所有平台上使用icon.png作为应用图标
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false, // 允用加载本地资源
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
          label: '基础配置',
          click: () => {
            // 创建基础配置设置弹窗
            createBasicSettingsDialog(mainWindow)
          }
        },
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
    icon, // 使用相同的图标
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
    icon, // 使用相同的图标
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

// 程序启动时初始化MCP服务器
async function initMcpServerPaths() {
  try {
    // 初始化所有MCP服务器连接
    const connectedCount = await mcpServiceManager.initializeAllServers();
    console.log(`已连接 ${connectedCount} 个MCP服务器`);
  } catch (error) {
    console.error('初始化MCP服务器失败:', error);
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // 执行架构迁移
  try {
    const migrateDatabase = require('../../scripts/migrate-to-new-architecture');
    await migrateDatabase();
    console.log('数据库架构迁移完成');
  } catch (error) {
    console.error('数据库架构迁移失败:', error);
    // 继续启动应用，不要在迁移失败时终止
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // 创建系统托盘
  try {
    const { nativeImage } = require('electron');
    
    // 使用专门的托盘图标，不同平台使用不同大小
    let trayIconPath;
    
    // 根据平台和打包状态选择正确的图标路径
    if (app.isPackaged) {
      // 打包后的路径
      if (process.platform === 'darwin') {
        // macOS使用16x16的图标
        trayIconPath = path.join(process.resourcesPath, 'trayicon.png');
      } else if (process.platform === 'win32') {
        // Windows使用16x16的图标
        trayIconPath = path.join(process.resourcesPath, 'trayicon.png');
      } else {
        // Linux使用24x24的图标
        trayIconPath = path.join(process.resourcesPath, 'trayicon.png');
      }
    } else {
      // 开发环境路径
      trayIconPath = path.join(app.getAppPath(), 'resources', 'trayicon.png');
      
      // 如果没有专用图标，则回退到普通图标
      if (!fs.existsSync(trayIconPath)) {
        trayIconPath = path.join(app.getAppPath(), 'resources', 'icon.png');
      }
    }
    
    console.log(`使用托盘图标: ${trayIconPath}`);
    
    // 创建托盘图标
    let trayIcon;
    
    if (fs.existsSync(trayIconPath)) {
      // 直接使用专用托盘图标，不调整大小
      trayIcon = nativeImage.createFromPath(trayIconPath);
      
      // 设置适当的图标大小，确保图标适合托盘
      if (process.platform === 'darwin') {
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
      } else if (process.platform === 'win32') {
        trayIcon = trayIcon.resize({ width: 16, height: 16 });
      } else {
        trayIcon = trayIcon.resize({ width: 24, height: 24 });
      }
    } else {
      console.log('找不到托盘图标文件，使用默认导入的图标');
      trayIcon = icon;
    }
    
    tray = new Tray(trayIcon);
    
    // 在macOS上，托盘图标需要特殊处理
    if (process.platform === 'darwin') {
      // 设置为模板图像，让macOS自动处理亮/暗模式
      tray.setIgnoreDoubleClickEvents(true);
      app.dock.setIcon(icon); // Dock图标使用原始大小的图标
    }
  } catch (err) {
    console.error('创建托盘图标失败:', err);
    // 使用导入的图标作为备用
    tray = new Tray(icon);
  }
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: '显示主窗口',
      click: () => {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
          const mainWindow = windows[0];
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'MCP设置',
      click: () => {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
          createMCPDialog(windows[0]);
        } else {
          const mainWindow = createWindow();
          createMCPDialog(mainWindow);
        }
      }
    },
    {
      label: '基础配置',
      click: () => {
        const windows = BrowserWindow.getAllWindows();
        if (windows.length > 0) {
          createBasicSettingsDialog(windows[0]);
        } else {
          const mainWindow = createWindow();
          createBasicSettingsDialog(mainWindow);
        }
      }
    },
    { type: 'separator' },
    { 
      label: '退出应用',
      role: 'quit'
    }
  ]);
  tray.setToolTip('Smart Pet with MCP');
  tray.setContextMenu(contextMenu);
  
  // 点击托盘图标显示主窗口
  tray.on('click', () => {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const mainWindow = windows[0];
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

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
  
  // 重新实现启动MCP服务器的IPC处理
  ipcMain.on('start-mcp-server', async (event, serverConfig) => {
    try {
      console.log('启动MCP服务器:', serverConfig);
      
      // 连接服务器
      const connected = await mcpServiceManager.connectServer(serverConfig);
      
      if (connected) {
        // 获取该服务器的工具列表
        const tools = await dbManager.getServerTools(serverConfig.id);
        const toolCount = tools ? tools.length : 0;
        
        // 如果工具表为空，尝试从客户端获取并保存工具
        if (toolCount === 0) {
          console.log(`服务器 ${serverConfig.name} 工具表为空，尝试从客户端获取`);
          const client = mcpServiceManager.getClient();
          if (client && client.tools && client.tools.length > 0) {
            console.log(`从客户端获取了 ${client.tools.length} 个工具，尝试保存到数据库`);
            await conversationService.saveToolsToDatabase(client.tools, serverConfig.id);
            
            // 重新获取工具数量
            const updatedTools = await dbManager.getServerTools(serverConfig.id);
            const updatedToolCount = updatedTools ? updatedTools.length : 0;
            console.log(`更新后的工具数量: ${updatedToolCount}`);
          }
        }
        
        // 报告状态
        event.reply('mcp-server-status', {
          running: true,
          message: `${serverConfig.name}服务器已启动${toolCount > 0 ? '，工具列表已加载' : '，无工具列表'}`
        });
      } else {
        // 连接失败
        event.reply('mcp-server-status', {
          running: false,
          message: `服务器启动失败`
        });
      }
    } catch (err) {
      console.error('启动MCP服务器失败:', err);
      
      event.reply('mcp-server-status', {
        running: false,
        message: `服务器启动失败: ${err.message}`
      });
    }
  });

  // 停止MCP服务器
  ipcMain.on('stop-mcp-server', async (event, serverId) => {
    try {
      const disconnected = await mcpServiceManager.disconnectServer(serverId);
      
      event.reply('mcp-server-status', {
        running: false,
        message: disconnected ? '服务器已停止' : '服务器未运行'
      });
    } catch (err) {
      console.error('停止MCP服务器失败:', err);
      
      event.reply('mcp-server-status', {
        running: false,
        message: `停止服务器失败: ${err.message}`
      });
    }
  });

  // 处理查询
  ipcMain.handle('process-query', async (event, queryData) => {
    try {
      // 支持新格式（对象）和旧格式（字符串）
      let query, conversationId;
      
      if (typeof queryData === 'string') {
        query = queryData;
      } else {
        // 新格式，包含query和conversationId
        query = queryData.query;
        conversationId = queryData.conversationId;
      }
      
      console.log('收到查询:', query, conversationId ? `[对话ID:${conversationId}]` : '');
      
      // 使用对话服务处理查询
      try {
        const response = await conversationService.processQuery(query, conversationId);
        return response;
      } catch (convErr) {
        console.error('使用对话服务处理查询失败，回退到旧方法:', convErr);
        
        // 回退到旧的处理方式
        if (!globalMCPClient) {
          await startMCPClient();
        }
        
        const oldResponse = await globalMCPClient.processQuery(query);
        
        // 如果是新格式，则返回包含对话ID的对象
        if (conversationId) {
          return {
            text: oldResponse,
            conversationId
          };
        }
        
        return oldResponse;
      }
    } catch (err) {
      console.error('【main/index.js】处理查询失败:', err);
      throw err;
    }
  });

  // 创建新对话
  ipcMain.handle('create-conversation', async (event, name) => {
    try {
      const id = await mcpServiceManager.createConversation(name || '新对话');
      return id;
    } catch (err) {
      console.error('创建对话失败:', err);
      throw err;
    }
  });

  // 获取对话列表
  ipcMain.handle('get-conversations', async () => {
    try {
      const conversations = await dbManager.getAllConversations();
      return conversations;
    } catch (err) {
      console.error('获取对话列表失败:', err);
      return [];
    }
  });

  // 为对话添加服务器
  ipcMain.handle('add-server-to-conversation', async (event, { conversationId, serverId }) => {
    try {
      return await mcpServiceManager.addServerToConversation(conversationId, serverId);
    } catch (err) {
      console.error('为对话添加服务器失败:', err);
      throw err;
    }
  });

  // 获取对话的服务器列表
  ipcMain.handle('get-conversation-servers', async (event, conversationId) => {
    try {
      const serverIds = await dbManager.getConversationServers(conversationId);
      
      // 获取服务器详情
      const servers = [];
      for (const id of serverIds) {
        const serverConfig = await dbManager.getServerById(id);
        if (serverConfig) {
          const isConnected = mcpServiceManager.serverConnections.has(id) && 
                            mcpServiceManager.serverConnections.get(id).isConnected;
          
          servers.push({
            ...serverConfig,
            isConnected
          });
        }
      }
      
      return servers;
    } catch (err) {
      console.error('获取对话服务器失败:', err);
      return [];
    }
  });

  // 获取服务器的工具列表
  ipcMain.handle('get-server-tools', async (event, serverId) => {
    try {
      if (mcpServiceManager.serverConnections.has(serverId)) {
        const connection = mcpServiceManager.serverConnections.get(serverId);
        return connection.tools;
      }
      
      // 如果服务器未连接，尝试从数据库获取
      return await dbManager.getServerTools(serverId);
    } catch (err) {
      console.error('获取服务器工具列表失败:', err);
      return [];
    }
  });

  // 程序启动时
  initMcpServerPaths()
  
  // 创建窗口
  createWindow()
  
  // 剪贴板相关IPC处理
  ipcMain.handle('read-clipboard-text', () => {
    try {
      const text = clipboard.readText();
      console.log('读取剪贴板内容成功:', text);
      return text;
    } catch (err) {
      console.error('读取剪贴板出错:', err);
      return '';
    }
  });
  
  ipcMain.handle('write-clipboard-text', (event, text) => {
    try {
      console.log('写入剪贴板内容:', text);
      clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('写入剪贴板出错:', err);
      return false;
    }
  });
  
  // 保存聊天消息
  ipcMain.handle('save-chat-message', async (event, messageData) => {
    try {
      return dbManager.saveChatMessage(messageData);
    } catch (error) {
      console.error('保存聊天消息失败:', error);
      throw error;
    }
  });

  // 获取聊天历史
  ipcMain.handle('get-chat-history', async (event, conversationId) => {
    try {
      return dbManager.getChatHistory(conversationId);
    } catch (error) {
      console.error('获取聊天历史失败:', error);
      return [];
    }
  });

  // 从对话中移除服务器
  ipcMain.handle('remove-server-from-conversation', async (event, { conversationId, serverId }) => {
    try {
      return dbManager.removeServerFromConversation(conversationId, serverId);
    } catch (error) {
      console.error('从对话中移除服务器失败:', error);
      throw error;
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
  try {
    if (!globalMCPClient) {
      // 尝试使用新的服务管理器
      try {
        globalMCPClient = mcpServiceManager.getClient();
      } catch (e) {
        console.error('使用新服务管理器失败，回退到直接创建:', e);
        globalMCPClient = new MCPClient();
      }
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
app.on('will-quit', async () => {
  try {
    console.log('应用即将退出，关闭MCP服务管理器...');
    await mcpServiceManager.shutdown();
    
    // 关闭数据库连接
    dbManager.close();
    
    // 清理托盘图标
    if (tray) {
      tray.destroy();
      tray = null;
    }
  } catch (error) {
    console.error('关闭资源出错:', error);
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
    const result = dbManager.batchSaveSettings(settings);
    
    // 检查是否有LLM相关设置更新
    const hasLlmSettingsUpdated = settings.some(s => s.category === 'llm');
    
    // 检查是否有ASR相关设置更新
    const hasAsrSettingsUpdated = settings.some(s => s.category === 'asr');
    
    // 如果更新了LLM设置且MCP客户端存在，重新初始化OpenAI
    if (hasLlmSettingsUpdated && globalMCPClient) {
      try {
        await globalMCPClient.initOpenAI();
        console.log('已根据更新的设置重新初始化OpenAI客户端');
      } catch (err) {
        console.error('重新初始化OpenAI客户端失败:', err);
      }
    }
    
    // 如果更新了ASR设置，通知所有窗口更新ASR配置
    if (hasAsrSettingsUpdated) {
      // 获取所有窗口
      const windows = BrowserWindow.getAllWindows();
      
      // 获取最新的ASR设置
      const asrSettings = await dbManager.getBasicSettings('asr');
      
      // 通知所有窗口
      windows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send('asr-settings-updated', asrSettings);
          console.log('已通知窗口更新ASR设置');
        }
      });
    }
    
    return result;
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

// 获取MCP服务器列表
ipcMain.handle('get-mcp-servers', async () => {
  try {
    return dbManager.getAllServers();
  } catch (error) {
    console.error('获取MCP服务器列表失败:', error);
    return [];
  }
});

// 保存MCP服务器配置
ipcMain.handle('save-mcp-server', async (event, serverConfig) => {
  try {
    console.log('保存MCP服务器配置:', serverConfig);
    const savedId = await dbManager.addServer(serverConfig);
    return {
      success: true,
      id: savedId,
      message: '服务器配置已保存'
    };
  } catch (error) {
    console.error('保存MCP服务器配置失败:', error);
    return {
      success: false,
      message: `保存服务器配置失败: ${error.message}`
    };
  }
});

// 删除MCP服务器配置
ipcMain.handle('delete-mcp-server', async (event, id) => {
  try {
    const deleted = await dbManager.deleteServer(id);
    return {
      success: deleted,
      message: deleted ? '服务器配置已删除' : '删除服务器配置失败'
    };
  } catch (error) {
    console.error('删除MCP服务器配置失败:', error);
    return {
      success: false,
      message: `删除服务器配置失败: ${error.message}`
    };
  }
});

// 单个服务器启动处理
ipcMain.on('start-single-server', async (event, serverConfig) => {
  try {
    console.log('启动单个MCP服务器:', serverConfig);
    
    // 如果这是一个旧的处理器名称，重定向到start-mcp-server
    event.sender.send('start-mcp-server', serverConfig);
  } catch (err) {
    console.error('启动MCP服务器失败:', err);
    
    event.reply('mcp-server-status', {
      running: false,
      message: `服务器启动失败: ${err.message}`
    });
  }
});
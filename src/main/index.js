import { app, shell, BrowserWindow, ipcMain, Menu, dialog, globalShortcut } from 'electron'
import path from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import MCPClient from '../utils/e-mcp-client'

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
    width: 500,
    height: 400,
    parent: parent,
    modal: true,
    show: false,
    resizable: false,
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
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
        { name: '脚本文件', extensions: ['js', 'py'] }
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
  
  // 启动MCP服务器
  ipcMain.on('start-mcp-server', async (event, options) => {
    try {
      const { type, path } = options
      console.log(`正在启动${type}类型的MCP服务器，路径: ${path}`)
      
      // 这里实现服务器启动逻辑
      const mcpClient = new MCPClient()
      await mcpClient.connectToServer(path)
      
      // 通知渲染进程服务器已启动
      event.reply('mcp-server-status', { running: true, message: '服务器已启动' })
    } catch (err) {
      console.error('启动MCP服务器失败:', err)
      event.reply('mcp-server-status', { running: false, message: `启动失败: ${err.message}` })
    }
  })
  
  // 停止MCP服务器
  ipcMain.on('stop-mcp-server', (event) => {
    try {
      console.log('正在停止MCP服务器')
      // 实现服务器停止逻辑
      
      // 通知渲染进程服务器已停止
      event.reply('mcp-server-status', { running: false, message: '服务器已停止' })
    } catch (err) {
      console.error('停止MCP服务器失败:', err)
      event.reply('mcp-server-status', { running: true, message: `停止失败: ${err.message}` })
    }
  })

  // 关闭MCP设置弹窗
  ipcMain.on('close-mcp-dialog', () => {
    if (global.mcpDialog && !global.mcpDialog.isDestroyed()) {
      global.mcpDialog.close()
    }
  })

  createWindow()

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


async function startMCPClient() {
  const mcpClient = new MCPClient()
  // 不再尝试连接到服务器文件
  // await mcpClient.connectToServer('./src/utils/e-mcp-server.js')
  
  // 直接使用内置工具列表
  mcpClient.setupBuiltinTools()
  await mcpClient.chatLoop()
}

// 添加此行以在应用启动时调用MCP客户端
app.whenReady().then(async () => {
  try {
    // 等待一会儿让窗口加载完成
    setTimeout(async () => {
      await startMCPClient();
    }, 2000);
  } catch (err) {
    console.error('启动MCP客户端失败:', err);
  }
});
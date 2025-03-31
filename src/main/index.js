import { app, shell, BrowserWindow, ipcMain, Menu, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import MCPClient from '../utils/e-mcp-client'

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // 创建应用菜单
  const template = [
    {
      label: '文件',
      submenu: [
        { role: 'quit', label: '退出' }
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

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    // 允许ESC键关闭窗口
    escapeExitsFullScreen: true
  })

  mcpDialog.setMenu(null) // 移除弹窗的菜单栏
  
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mcpDialog.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/mcp-settings`)
  } else {
    mcpDialog.loadFile(join(__dirname, '../renderer/index.html'), {
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


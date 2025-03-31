import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import path from 'path'

// Custom APIs for renderer
const api = {
  // MCP服务器相关API
  openFileDialog: () => ipcRenderer.send('open-file-dialog'),
  startMCPServer: (options) => ipcRenderer.send('start-mcp-server', options),
  stopMCPServer: () => ipcRenderer.send('stop-mcp-server'),
  closeMCPDialog: () => ipcRenderer.send('close-mcp-dialog'),
  onMCPServerStatus: (callback) => {
    ipcRenderer.on('mcp-server-status', (_, data) => callback(data))
    return () => ipcRenderer.removeListener('mcp-server-status', callback)
  },
  onSelectedFile: (callback) => {
    ipcRenderer.once('selected-file', (_, filePath) => callback(filePath))
  },
  // 换装对话框相关API
  onOpenChangeModelDialog: (callback) => {
    ipcRenderer.on('open-change-model-dialog', () => callback())
    return () => ipcRenderer.removeListener('open-change-model-dialog', callback)
  },
  // 获取资源文件的绝对路径
  getResourcePath: (relativePath) => ipcRenderer.invoke('get-resource-path', relativePath),
  
  // 快捷键相关API
  registerShortcut: (accelerator, callback) => {
    // 为了保持唯一性，使用时间戳创建一个唯一的通道名
    const channel = `shortcut-callback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 注册监听器以接收主进程的快捷键触发通知
    ipcRenderer.on(channel, () => callback());
    
    // 向主进程发送注册快捷键的请求
    ipcRenderer.send('register-shortcut', { accelerator, channel });
    
    // 返回一个清理函数
    return () => {
      ipcRenderer.removeListener(channel, callback);
      ipcRenderer.send('unregister-shortcut', { channel });
    };
  },
  
  // 注销所有快捷键
  unregisterShortcuts: () => ipcRenderer.send('unregister-all-shortcuts')
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}

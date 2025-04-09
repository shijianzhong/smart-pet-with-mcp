import { contextBridge, ipcRenderer, clipboard } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import path from 'path'
import fs from 'fs'

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
  unregisterShortcuts: () => ipcRenderer.send('unregister-all-shortcuts'),
  
  // 数据库相关API
  getMCPServers: () => ipcRenderer.invoke('get-mcp-servers'),
  saveMCPServer: (serverConfig) => ipcRenderer.invoke('save-mcp-server', serverConfig),
  deleteMCPServer: (serverId) => ipcRenderer.invoke('delete-mcp-server', serverId),
  loadMCPServer: (serverId) => ipcRenderer.invoke('load-mcp-server', serverId),
  
  // 基础设置相关API
  getBasicSettings: (category) => ipcRenderer.invoke('get-basic-settings', category),
  saveBasicSetting: (name, value, category) => ipcRenderer.invoke('save-basic-setting', { name, value, category }),
  batchSaveSettings: (settings) => ipcRenderer.invoke('batch-save-settings', settings),
  closeBasicSettingsDialog: () => ipcRenderer.send('close-basic-settings-dialog'),
  
  // 剪贴板相关API
  readClipboardText: () => ipcRenderer.invoke('read-clipboard-text'),
  writeClipboardText: (text) => ipcRenderer.invoke('write-clipboard-text', text),
  // 直接在渲染进程中操作剪贴板的方法
  getClipboardText: () => clipboard.readText(),
  setClipboardText: (text) => clipboard.writeText(text)
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

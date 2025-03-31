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
  getResourcePath: (relativePath) => ipcRenderer.invoke('get-resource-path', relativePath)
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

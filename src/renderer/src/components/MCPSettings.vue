<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const serverType = ref('js')
const serverPath = ref('')
const isServerRunning = ref(false)
const statusMessage = ref('未连接')

// 监听MCP服务器状态变化
const listenToServerStatus = () => {
  window.electron.ipcRenderer.on('mcp-server-status', (event, data) => {
    isServerRunning.value = data.running
    statusMessage.value = data.message
  })
}

// 组件挂载时注册事件监听
onMounted(() => {
  listenToServerStatus()
})

// 组件卸载时移除事件监听
onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('mcp-server-status')
})

const startServer = () => {
  // 这里实际应该调用通过IPC与主进程通信，启动MCP服务器
  // 示例代码，实际实现需要通过IPC与主进程通信
  if (!serverPath.value) {
    statusMessage.value = '请输入服务器路径'
    return
  }
  
  statusMessage.value = '正在启动服务器...'
  // 通知主进程启动服务器
  window.electron.ipcRenderer.send('start-mcp-server', {
    type: serverType.value,
    path: serverPath.value
  })
}

const stopServer = () => {
  // 这里实际应该调用通过IPC与主进程通信，停止MCP服务器
  statusMessage.value = '正在停止服务器...'
  // 通知主进程停止服务器
  window.electron.ipcRenderer.send('stop-mcp-server')
}

const browseFile = () => {
  // 通过IPC调用主进程打开文件选择器
  window.electron.ipcRenderer.send('open-file-dialog')
  
  // 监听返回结果
  window.electron.ipcRenderer.once('selected-file', (filePath) => {
    if (filePath) {
      serverPath.value = filePath
    }
  })
}

// 关闭当前窗口
const closeWindow = () => {
  // 使用新的API关闭对话框
  window.api.closeMCPDialog()
}
</script>

<template>
  <div class="mcp-settings">
    <div class="header">
      <h2>MCP服务器设置</h2>
      <button class="close-btn" @click="closeWindow">×</button>
    </div>
    
    <div class="form-group">
      <label class="form-label">服务器类型</label>
      <div class="radio-group">
        <label>
          <input type="radio" v-model="serverType" value="js" :disabled="isServerRunning" />
          <span class="radio-text">JavaScript</span>
        </label>
        <label>
          <input type="radio" v-model="serverType" value="py" :disabled="isServerRunning" />
          <span class="radio-text">Python</span>
        </label>
      </div>
    </div>
    
    <div class="form-group">
      <label class="form-label">服务器路径</label>
      <div class="file-input">
        <input type="text" v-model="serverPath" placeholder="选择服务器脚本文件" :disabled="isServerRunning" />
        <button @click="browseFile" :disabled="isServerRunning">浏览...</button>
      </div>
    </div>
    
    <div class="status-bar">
      <span>状态: {{ statusMessage }}</span>
    </div>
    
    <div class="actions">
      <button @click="startServer" class="start-btn" :disabled="isServerRunning">启动服务器</button>
      <button @click="stopServer" class="stop-btn" :disabled="!isServerRunning">停止服务器</button>
      <button @click="closeWindow" class="cancel-btn">关闭</button>
    </div>
  </div>
</template>

<style scoped>
.mcp-settings {
  width: 100%;
  margin: 0 auto;
  padding: 20px;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h2 {
  margin: 0;
  color: #42b883;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.close-btn:hover {
  background-color: #f0f0f0;
  color: #333;
}

h2 {
  text-align: center;
  color: #42b883;
}

.form-group {
  margin-bottom: 16px;
  background-color: #f9f9f9;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #eaeaea;
}

.form-label {
  display: block;
  font-weight: bold;
  margin-bottom: 6px;
  color: #333333;
  font-size: 14px;
  z-index: 10;
  position: relative;
  text-shadow: 0px 0px 1px rgba(0,0,0,0.2);
  background-color: rgba(255,255,255,0.1);
  padding: 2px 4px;
  border-radius: 2px;
}

label {
  display: block;
  font-weight: bold;
  margin-bottom: 6px;
}

.radio-group {
  display: flex;
  gap: 16px;
}

.radio-group label {
  font-weight: normal;
  display: flex;
  align-items: center;
  gap: 4px;
  color: #333333;
  font-size: 14px;
  z-index: 10;
  position: relative;
}

.file-input {
  display: flex;
  gap: 8px;
}

.file-input input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  color: #333;
  background-color: white;
  font-size: 14px;
}

button {
  padding: 8px 16px;
  background-color: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover:not(:disabled) {
  background-color: #369e6b;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.status-bar {
  margin: 16px 0;
  padding: 8px;
  background-color: #f8f8f8;
  border-radius: 4px;
  color: #333;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 16px;
}

.start-btn {
  background-color: #42b883;
}

.stop-btn {
  background-color: #e74c3c;
}

.stop-btn:hover:not(:disabled) {
  background-color: #c0392b;
}

.cancel-btn {
  background-color: #7f8c8d;
}

.cancel-btn:hover:not(:disabled) {
  background-color: #636e72;
}

.radio-text {
  color: #333333; 
  font-size: 14px;
  font-weight: 500;
  text-shadow: 0px 0px 1px rgba(0,0,0,0.1);
  display: inline-block;
  padding-left: 4px;
}

input[type="radio"] {
  width: 16px;
  height: 16px;
  margin-right: 4px;
  cursor: pointer;
  accent-color: #42b883;
}
</style> 
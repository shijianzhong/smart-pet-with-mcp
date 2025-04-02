<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'

const serverType = ref('js')
const serverPath = ref('')
const serverName = ref('')
const isServerRunning = ref(false)
const statusMessage = ref('未连接')
const mcpServers = ref([])
const isLoading = ref(false)
// 添加连接类型选项
const connectionType = ref('file') // 'file', 'npx', 'sse'

// 计算保存按钮是否可用
const canSave = computed(() => {
  return serverPath.value && serverName.value && !isServerRunning.value
})

// 计算启动按钮是否可用
const canStart = computed(() => {
  // 如果已经在运行或无数据无路径，则禁用按钮
  return !isServerRunning.value && (mcpServers.value.length > 0 || serverPath.value)
})

// 计算服务器路径的占位符文本
const pathPlaceholder = computed(() => {
  switch (connectionType.value) {
    case 'file': return '选择服务器脚本文件'
    case 'npx': return '输入npx命令，例如：npx my-mcp-server'
    case 'sse': return '输入服务器URL，例如：http://localhost:3000/events'
    default: return '输入服务器路径'
  }
})

// 计算是否显示浏览按钮
const showBrowseButton = computed(() => {
  return connectionType.value === 'file'
})

// 计算是否显示服务器类型选择
const showServerTypeSelection = computed(() => {
  return connectionType.value === 'file'
})

// 监听MCP服务器状态变化
const listenToServerStatus = () => {
  window.electron.ipcRenderer.on('mcp-server-status', (event, data) => {
    isServerRunning.value = data.running
    statusMessage.value = data.message
    
    // 更新服务器列表状态
    if (data.servers && Array.isArray(data.servers)) {
      // 更新服务器状态
      mcpServers.value = mcpServers.value.map(server => {
        const updatedServer = data.servers.find(s => s.id === server.id);
        return updatedServer ? { ...server, ...updatedServer } : server;
      });
    }
  })
}

// 加载保存的服务器列表
const loadMCPServers = async () => {
  isLoading.value = true
  try {
    mcpServers.value = await window.api.getMCPServers()
  } catch (error) {
    console.error('加载MCP服务器列表失败:', error)
  } finally {
    isLoading.value = false
  }
}

// 保存MCP服务器配置
const saveServerConfig = async () => {
  if (!canSave.value) return
  
  try {
    const serverConfig = {
      name: serverName.value,
      type: serverType.value,
      path: serverPath.value,
      status: '未启动', // 初始状态
      isRunning: false,
      connectionType: connectionType.value // 添加连接类型
    }
    
    await window.api.saveMCPServer(serverConfig)
    statusMessage.value = '配置已保存'
    await loadMCPServers() // 重新加载服务器列表
  } catch (error) {
    console.error('保存MCP服务器配置失败:', error)
    statusMessage.value = '保存配置失败'
  }
}

// 加载服务器配置
const loadServerConfig = async (serverId) => {
  try {
    const server = await window.api.loadMCPServer(serverId)
    if (server) {
      serverName.value = server.name
      serverType.value = server.type
      serverPath.value = server.path
      // 如果有connectionType字段，则加载它
      connectionType.value = server.connectionType || 'file'
    }
  } catch (error) {
    console.error('加载服务器配置失败:', error)
  }
}

// 删除服务器配置
const deleteServerConfig = async (serverId) => {
  try {
    await window.api.deleteMCPServer(serverId)
    await loadMCPServers() // 重新加载服务器列表
  } catch (error) {
    console.error('删除服务器配置失败:', error)
  }
}

// 组件挂载时注册事件监听
onMounted(() => {
  listenToServerStatus()
  loadMCPServers()
})

// 组件卸载时移除事件监听
onUnmounted(() => {
  window.electron.ipcRenderer.removeAllListeners('mcp-server-status')
})

const startServer = () => {
  // 启动所有服务器
  statusMessage.value = '正在启动服务器...'
  
  // 添加当前表单中的未保存服务器（如果有）
  const currentServer = {
    id: -1, // 使用一个临时ID
    name: serverName.value || '未命名服务器',
    type: serverType.value,
    path: serverPath.value,
    status: '未保存',
    isRunning: false,
    connectionType: connectionType.value // 添加连接类型
  };

  // 通知主进程启动所有服务器（包括当前未保存的）
  const hasSavedServers = mcpServers.value.length > 0;
  const hasCurrentServer = serverPath.value ? true : false;
  
  // 根据情况决定如何启动
  if (hasSavedServers) {
    // 有已保存的服务器，启动所有保存的服务器
    window.electron.ipcRenderer.send('start-all-mcp-servers');
  } else if (hasCurrentServer) {
    // 只有当前未保存的服务器，直接启动它
    window.electron.ipcRenderer.send('start-single-server', currentServer);
  }
}

const stopServer = () => {
  // 停止所有服务器
  statusMessage.value = '正在停止服务器...'
  // 通知主进程停止服务器
  window.electron.ipcRenderer.send('stop-mcp-server')
}

const browseFile = () => {
  // 通过IPC调用主进程打开文件选择器
  window.api.openFileDialog()
  
  // 监听返回结果 - 修复参数接收方式
  window.api.onSelectedFile((filePath) => {
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

// 获取服务器状态样式
const getStatusStyle = (server) => {
  if (server.isRunning) {
    return 'running';
  } else if (server.status && server.status.includes('失败')) {
    return 'failed';
  } else {
    return 'stopped';
  }
}

// 根据连接类型获取显示的类型文本
const getConnectionTypeText = (connType) => {
  switch (connType) {
    case 'file': return '文件'
    case 'npx': return 'NPX命令'
    case 'sse': return 'SSE连接'
    default: return '文件'
  }
}
</script>

<template>
  <div class="mcp-settings-container">
    <div class="mcp-settings">
      <div class="header">
        <h2>MCP服务器设置</h2>
        <button class="close-btn" @click="closeWindow">×</button>
      </div>
      
      <div class="content-area">
        <div class="form-section">
          <div class="form-group">
            <label class="form-label">服务器名称</label>
            <input type="text" v-model="serverName" placeholder="输入服务器名称" :disabled="isServerRunning" />
          </div>
          
          <div class="form-group">
            <label class="form-label">连接类型</label>
            <div class="radio-group">
              <label>
                <input type="radio" v-model="connectionType" value="file" :disabled="isServerRunning" />
                <span class="radio-text">文件</span>
              </label>
              <label>
                <input type="radio" v-model="connectionType" value="npx" :disabled="isServerRunning" />
                <span class="radio-text">NPX命令</span>
              </label>
              <label>
                <input type="radio" v-model="connectionType" value="sse" :disabled="isServerRunning" />
                <span class="radio-text">SSE连接</span>
              </label>
            </div>
          </div>
          
          <div class="form-group" v-if="showServerTypeSelection">
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
            <label class="form-label">服务器路径{{ connectionType === 'file' ? '' : '/命令/URL' }}</label>
            <div class="file-input">
              <input type="text" v-model="serverPath" :placeholder="pathPlaceholder" :disabled="isServerRunning" />
              <button v-if="showBrowseButton" @click="browseFile" :disabled="isServerRunning">浏览...</button>
            </div>
          </div>
          
          <div class="status-bar">
            <span>状态: {{ statusMessage }}</span>
          </div>
          
          <div class="actions">
            <button @click="startServer" class="start-btn" :disabled="!canStart">启动服务器</button>
            <button @click="stopServer" class="stop-btn" :disabled="!isServerRunning">停止服务器</button>
            <button @click="saveServerConfig" class="save-btn" :disabled="!canSave">保存配置</button>
            <button @click="closeWindow" class="cancel-btn">关闭</button>
          </div>
        </div>
        
        <!-- 服务器列表 -->
        <div class="server-list-container">
          <h3>已保存的服务器</h3>
          <div v-if="isLoading" class="loading">加载中...</div>
          <div v-else-if="mcpServers.length === 0" class="no-servers">
            没有保存的服务器配置
          </div>
          <ul v-else class="server-list">
            <li v-for="server in mcpServers" :key="server.id" class="server-item">
              <div class="server-info">
                <div class="server-name">
                  {{ server.name }}
                  <span :class="['server-status', getStatusStyle(server)]">
                    {{ server.status || '未启动' }}
                  </span>
                </div>
                <div class="server-path">{{ server.path }}</div>
                <div class="server-type">
                  类型: {{ server.connectionType ? getConnectionTypeText(server.connectionType) : (server.type === 'js' ? 'JavaScript' : 'Python') }}
                </div>
              </div>
              <div class="server-actions">
                <button @click="loadServerConfig(server.id)" :disabled="isServerRunning" class="load-btn">加载</button>
                <button @click="deleteServerConfig(server.id)" :disabled="isServerRunning" class="delete-btn">删除</button>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mcp-settings-container {
  width: 100%;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: hidden;
  padding: 20px;
  box-sizing: border-box;
}

.mcp-settings {
  width: 100%;
  max-width: 580px;
  max-height: 580px;
  margin: 0 auto;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eaeaea;
}

.header h2 {
  margin: 0;
  color: #42b883;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(580px - 60px); /* 减去header高度 */
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  color: #42b883;
}

h3 {
  margin-top: 0;
  margin-bottom: 12px;
  color: #42b883;
  font-size: 16px;
}

.form-group {
  margin-bottom: 8px;
  background-color: #f9f9f9;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #eaeaea;
}

.form-group input[type="text"] {
  width: 100%;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
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
  margin: 8px 0;
  padding: 8px;
  background-color: #f8f8f8;
  border-radius: 4px;
  color: #333;
}

.actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 12px;
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

.save-btn {
  background-color: #3498db;
}

.save-btn:hover:not(:disabled) {
  background-color: #2980b9;
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

.server-list-container {
  padding: 16px;
  background-color: #f9f9f9;
  border-radius: 6px;
  border: 1px solid #eaeaea;
}

.loading, .no-servers {
  padding: 12px;
  text-align: center;
  color: #666;
}

.server-list {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 250px;
  overflow-y: auto;
  border-radius: 4px;
}

/* 自定义滚动条样式 */
.server-list::-webkit-scrollbar {
  width: 8px;
}

.server-list::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.server-list::-webkit-scrollbar-thumb {
  background: #42b883;
  border-radius: 4px;
}

.server-list::-webkit-scrollbar-thumb:hover {
  background: #369e6b;
}

.content-area::-webkit-scrollbar {
  width: 8px;
}

.content-area::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.content-area::-webkit-scrollbar-thumb {
  background: #42b883;
  border-radius: 4px;
}

.content-area::-webkit-scrollbar-thumb:hover {
  background: #369e6b;
}

.server-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid #eaeaea;
  background-color: white;
  margin-bottom: 8px;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.server-item:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.server-info {
  flex: 1;
}

.server-name {
  font-weight: bold;
  color: #333;
  margin-bottom: 4px;
}

.server-path {
  font-size: 12px;
  color: #666;
  word-break: break-all;
  margin-bottom: 4px;
}

.server-type {
  font-size: 12px;
  color: #666;
}

.server-actions {
  display: flex;
  gap: 8px;
}

.load-btn {
  background-color: #3498db;
  font-size: 12px;
  padding: 4px 8px;
}

.delete-btn {
  background-color: #e74c3c;
  font-size: 12px;
  padding: 4px 8px;
}

.load-btn:hover:not(:disabled) {
  background-color: #2980b9;
}

.delete-btn:hover:not(:disabled) {
  background-color: #c0392b;
}

/* 新增服务器状态样式 */
.server-status {
  display: inline-block;
  padding: 2px 6px;
  font-size: 12px;
  border-radius: 3px;
  margin-left: 8px;
  color: white;
  font-weight: normal;
}

.server-status.running {
  background-color: #42b883;
}

.server-status.failed {
  background-color: #e74c3c;
}

.server-status.stopped {
  background-color: #7f8c8d;
}
</style> 
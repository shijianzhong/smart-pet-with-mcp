<script setup>
import Versions from './Versions.vue'
import Live2D from './live2d/index.vue'
import { ref } from 'vue'

const ipcHandle = () => window.electron.ipcRenderer.send('ping')

// 对话相关状态
const userInput = ref('')
const chatHistory = ref([])
const isLoading = ref(false)

// 处理用户发送消息
const handleSendMessage = async () => {
  if (!userInput.value.trim()) return
  
  // 添加用户消息到聊天历史
  chatHistory.value.push({
    role: 'user',
    content: userInput.value
  })
  
  // 设置加载状态
  isLoading.value = true
  
  try {
    // 发送消息到主进程处理
    const response = await window.electron.ipcRenderer.invoke('process-query', userInput.value)
    
    // 添加助手回复到聊天历史
    chatHistory.value.push({
      role: 'assistant',
      content: response
    })
  } catch (error) {
    console.error('处理查询时出错:', error)
    // 添加错误信息到聊天历史
    chatHistory.value.push({
      role: 'error',
      content: `处理查询失败: ${error.message}`
    })
  } finally {
    // 清空输入框并重置加载状态
    userInput.value = ''
    isLoading.value = false
    
    // 滚动到聊天底部
    setTimeout(() => {
      const chatContainer = document.querySelector('.chat-history')
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight
      }
    }, 100)
  }
}

// 处理按下回车键
const handleKeyDown = (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSendMessage()
  }
}
</script>

<template>
  <div class="home-container">
    <!-- <img alt="logo" class="logo" src="../assets/electron.svg" />
    <div class="creator">Powered by electron-vite</div>
    <div class="text">
      智能宠物伴侣
      <span class="vue">MCP</span>
    </div>
    <p class="tip">您可以通过菜单 "设置 > MCP" 配置MCP服务器</p>
    <div class="actions">
      <div class="action">
        <a href="https://electron-vite.org/" target="_blank" rel="noreferrer">文档</a>
      </div>
      <div class="action">
        <a @click="ipcHandle">发送IPC测试</a>
      </div>
    </div>
    <Versions /> -->
    <Live2D />
    
    <!-- 聊天界面 -->
    <div class="chat-container">
      <!-- 聊天历史记录 -->
      <div class="chat-history">
        <div 
          v-for="(message, index) in chatHistory" 
          :key="index" 
          :class="['message', message.role]"
        >
          <div class="message-content">{{ message.content }}</div>
        </div>
        
        <div v-if="isLoading" class="message assistant loading">
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </div>
      
      <!-- 输入框区域 -->
      <div class="input-container">
        <textarea 
          v-model="userInput" 
          @keydown="handleKeyDown" 
          placeholder="输入消息..." 
          :disabled="isLoading"
        ></textarea>
        <button 
          @click="handleSendMessage" 
          :disabled="isLoading || !userInput.trim()"
        >
          发送
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100vh;
  padding: 0;
  margin: 0;
  background-color: transparent;
  position: relative;
  pointer-events: none; /* 默认不接收鼠标事件，这样Live2D模型可以被拖动 */
}
.logo {
  width: 150px;
  margin: 0 auto;
}
.creator {
  font-size: 14px;
  color: #666;
  margin-top: 10px;
}
.text {
  font-size: 24px;
  font-weight: bold;
  margin: 20px 0;
}
.vue {
  color: #42b883;
}
.tip {
  background-color: #f8f8f8;
  padding: 8px 16px;
  border-radius: 4px;
  border-left: 4px solid #42b883;
}
.actions {
  display: flex;
  gap: 20px;
  margin-top: 20px;
}
.action a {
  display: inline-block;
  padding: 8px 16px;
  background-color: #42b883;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  cursor: pointer;
}
.action a:hover {
  background-color: #369e6b;
}

/* 聊天界面样式 */
.chat-container {
  position: absolute;
  bottom: 10px;
  left: 10px;
  right: 10px;
  max-height: 300px;
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1000; /* 确保显示在canvas上层 */
  pointer-events: auto; /* 确保元素可以接收鼠标事件 */
  -webkit-app-region: no-drag; /* 确保不作为拖动区域 */
  app-region: no-drag;
}

.chat-history {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  max-height: 200px;
  pointer-events: auto;
}

.message {
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 16px;
  max-width: 80%;
  word-break: break-word;
}

.user {
  align-self: flex-end;
  margin-left: auto;
  background-color: #42b883;
  color: white;
}

.assistant {
  align-self: flex-start;
  background-color: #f1f1f1;
  color: #333;
}

.error {
  align-self: center;
  background-color: #ffebee;
  color: #d32f2f;
  width: 100%;
  text-align: center;
}

.input-container {
  display: flex;
  padding: 10px;
  border-top: 1px solid #eee;
  pointer-events: auto;
}

textarea {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 8px;
  min-height: 40px;
  max-height: 80px;
  resize: none;
  font-family: inherit;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

button {
  margin-left: 8px;
  padding: 0 16px;
  background-color: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

button:hover {
  background-color: #369e6b;
}

button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

/* 加载动画 */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

.typing-indicator {
  display: flex;
  align-items: center;
}

.typing-indicator span {
  height: 8px;
  width: 8px;
  background-color: #42b883;
  border-radius: 50%;
  display: inline-block;
  margin: 0 2px;
  animation: bouncing 1.2s infinite ease-in-out;
}

.typing-indicator span:nth-child(1) {
  animation-delay: 0s;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes bouncing {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}
</style> 
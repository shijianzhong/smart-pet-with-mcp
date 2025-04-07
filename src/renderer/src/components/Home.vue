<script setup>
import Versions from './Versions.vue'
import Live2D from './live2d/index.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import SpeechRecognizer from './audio/SpeechRecognizer.vue'

const ipcHandle = () => window.electron.ipcRenderer.send('ping')

// 对话相关状态
const userInput = ref('')
const chatHistory = ref([])
const isLoading = ref(false)

// 语音识别相关状态
const isRecording = ref(false)
const speechStatus = ref('idle') // idle, connecting, recording, processing, error
const speechRecognizer = ref(null)
// 语音识别服务地址直接写死在代码中
const asrServerUrl = 'ws://127.0.0.1:10096/'

// 初始化语音识别
onMounted(() => {
  // 不再需要监听recorder-scripts-loaded事件，因为我们使用了自己的组件
  console.log('组件已挂载，语音识别组件将自动初始化');
})

onBeforeUnmount(() => {
  // 清理语音识别资源
  if (speechRecognizer.value && isRecording.value) {
    speechRecognizer.value.stopRecognition()
  }
})

// 处理语音识别结果
const handleRecognitionResult = (result) => {
  console.log('收到语音识别结果:', result);
  if (result && result.result) {
    userInput.value = result.result;
  }
}

// 处理语音识别状态变化
const handleRecognitionStart = () => {
  isRecording.value = true;
  speechStatus.value = 'recording';
}

const handleRecognitionStop = () => {
  isRecording.value = false;
  speechStatus.value = 'idle';
}

const handleConnectionOpen = () => {
  speechStatus.value = 'connected';
}

const handleConnectionError = () => {
  speechStatus.value = 'error';
}

// 处理语音识别
const toggleSpeechRecognition = () => {
  if (!speechRecognizer.value) {
    console.error('语音识别组件未初始化');
    speechStatus.value = 'error';
    return;
  }
  
  if (isRecording.value) {
    // 停止录音
    speechRecognizer.value.stopRecognition();
    speechStatus.value = 'processing';
  } else {
    // 开始录音
    speechRecognizer.value.startRecognition();
    speechStatus.value = 'connecting';
  }
}

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
      content: `【Home.vue】处理查询失败: ${error.message}`
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
        <div v-for="(message, index) in chatHistory" :key="index" class="message" :class="message.role">
          <div v-if="message.role === 'user'" class="message-header">
            <span class="user-tag">用户</span>
          </div>
          <div v-else-if="message.role === 'assistant'" class="message-header">
            <span class="assistant-tag">助手</span>
          </div>
          <div v-else class="message-header">
            <span class="error-tag">错误</span>
          </div>
          <div class="message-content">{{ message.content }}</div>
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
        
        <div class="input-controls">
          <button 
            class="speech-button" 
            :class="{ 'recording': isRecording }"
            @click="toggleSpeechRecognition"
            :disabled="isLoading || speechStatus === 'connecting' || speechStatus === 'processing'"
          >
            <span v-if="isRecording">停止录音</span>
            <span v-else>语音输入</span>
          </button>
          
          <button 
            @click="handleSendMessage" 
            class="send-button"
            :disabled="isLoading || !userInput.trim()"
          >
            发送
          </button>
        </div>
        
        <!-- 语音识别状态提示 -->
        <div v-if="speechStatus !== 'idle'" class="speech-status">
          <span v-if="speechStatus === 'connecting'">正在连接语音服务...</span>
          <span v-if="speechStatus === 'recording'" class="recording-status">正在录音...</span>
          <span v-if="speechStatus === 'processing'">正在处理语音...</span>
          <span v-if="speechStatus === 'error'" class="error-status">语音服务连接失败</span>
        </div>
      </div>
    </div>
    
    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
    </div>
    
    <!-- 语音识别组件 (隐藏) -->
    <div style="display: none;">
      <SpeechRecognizer
        ref="speechRecognizer"
        :server-url="asrServerUrl"
        :sample-rate="16000"
        :mime-type="'audio/wav'"
        :show-status="false"
        @recognition-result="handleRecognitionResult"
        @recognition-start="handleRecognitionStart"
        @recognition-stop="handleRecognitionStop"
        @connection-open="handleConnectionOpen"
        @connection-error="handleConnectionError"
      />
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

/* 语音按钮样式 */
.speech-button {
  padding: 0 12px;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.speech-button.recording {
  background-color: #e74c3c;
}

.speech-button.recording:hover {
  background-color: #c0392b;
}

/* 语音识别状态提示 */
.speech-status {
  padding: 4px 10px;
  font-size: 12px;
  text-align: center;
  background-color: #f8f8f8;
  border-top: 1px solid #eee;
  pointer-events: auto;
}

.recording-status {
  color: #e74c3c;
  animation: pulse 1.5s infinite;
}

.error-status {
  color: #e74c3c;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}

/* 加载动画 */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(255, 255, 255, 0.5);
  z-index: 1001;
}

.loading-spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #42b883;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style> 
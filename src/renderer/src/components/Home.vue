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
const speechStatus = ref('idle') // idle, connecting, recording, processing, error, timeout
const speechRecognizer = ref(null)
const serverAvailable = ref(false)
const realtimeText = ref('') // 添加实时识别文本
// 语音识别服务地址 - 默认值，将从配置中加载
const asrServerUrl = ref('ws://127.0.0.1:10096/')
// 添加语音状态提示文本
const statusMessages = {
  idle: '',
  connecting: '正在连接语音服务...',
  recording: '正在录音...',
  processing: '正在处理语音...',
  error: '语音服务连接失败',
  timeout: '语音处理超时，请重试',
  completed: '语音识别完成',
  unavailable: '语音服务不可用，请确保语音服务已启动'
}

// 初始化语音识别
onMounted(async () => {
  // 不再需要监听recorder-scripts-loaded事件，因为我们使用了自己的组件
  console.log('组件已挂载，语音识别组件将自动初始化');
  
  // 加载ASR服务器地址配置
  await loadAsrSettings();
  
  // 监听ASR设置更新事件
  const unsubscribeAsrUpdate = window.api.onAsrSettingsUpdated((settings) => {
    console.log('收到ASR设置更新通知:', settings);
    updateAsrServerUrl(settings);
  });
  
  // 3秒后检查服务器是否可用
  setTimeout(() => {
    checkServerAvailability();
  }, 3000);
})

onBeforeUnmount(() => {
  // 清理语音识别资源
  if (speechRecognizer.value && isRecording.value) {
    speechRecognizer.value.stopRecognition()
  }
  
  // 自动卸载ASR设置更新事件监听（API已处理）
})

// 加载ASR设置
const loadAsrSettings = async () => {
  try {
    const asrSettings = await window.api.getBasicSettings('asr');
    updateAsrServerUrl(asrSettings);
  } catch (error) {
    console.error('加载ASR配置失败:', error);
  }
}

// 更新ASR服务器URL
const updateAsrServerUrl = (asrSettings) => {
  if (asrSettings && asrSettings.length > 0) {
    const funasrAddressSetting = asrSettings.find(s => s.name === 'funasrAddress');
    if (funasrAddressSetting && funasrAddressSetting.value) {
      // 确保地址是WebSocket格式
      let wsAddress = funasrAddressSetting.value;
      if (wsAddress.startsWith('http://')) {
        // 如果是http地址，转换为ws地址，并替换默认端口10095为10096
        wsAddress = wsAddress.replace('http://', 'ws://').replace(':10095', ':10096');
      } else if (!wsAddress.startsWith('ws://')) {
        // 如果既不是http也不是ws开头，添加ws://前缀
        wsAddress = `ws://${wsAddress}`;
      }
      
      // 确保端口是10096（WebSocket端口）
      if (!wsAddress.includes(':10096') && wsAddress.includes(':10095')) {
        wsAddress = wsAddress.replace(':10095', ':10096');
      } else if (!wsAddress.includes(':')) {
        // 如果没有指定端口，添加默认端口
        wsAddress = `${wsAddress}:10096`;
      }
      
      // 确保以/结尾
      if (!wsAddress.endsWith('/')) {
        wsAddress = `${wsAddress}/`;
      }
      
      asrServerUrl.value = wsAddress;
      console.log('已更新ASR服务器地址:', asrServerUrl.value);
    }
  }
}

// 检查服务器是否可用
const checkServerAvailability = async () => {
  if (!speechRecognizer.value) return;
  
  try {
    // 调用组件方法检查服务器可用性
    const isAvailable = await speechRecognizer.value.checkServerAvailability();
    serverAvailable.value = isAvailable;
    
    if (!isAvailable) {
      speechStatus.value = 'unavailable';
      console.warn('语音识别服务不可用，请确保服务已启动');
    } else {
      console.log('语音识别服务可用');
      if (speechStatus.value === 'unavailable') {
        speechStatus.value = 'idle';
      }
    }
  } catch (error) {
    console.error('检查服务器可用性失败:', error);
    serverAvailable.value = false;
    speechStatus.value = 'unavailable';
  }
};

// 处理语音识别结果
const handleRecognitionResult = (result) => {
  console.log('收到语音识别结果:', result);
  if (result && result.text) {
    userInput.value = result.text;
    // 清空实时文本
    realtimeText.value = '';
    // 设置状态为正在处理，但不显示在界面上
    speechStatus.value = 'processing';
    // 立即发送消息
    handleSendMessage()
  }}

// 处理实时识别结果
const handleRealtimeRecognition = (result) => {
  console.log('收到实时识别结果:', result);
  if (result && result.text) {
    realtimeText.value = `我说：${result.text}`;
  }
}

// 处理语音识别状态变化
const handleRecognitionStart = () => {
  isRecording.value = true;
  speechStatus.value = 'recording';
  console.log('语音识别开始');
}

const handleRecognitionStop = (data) => {
  isRecording.value = false;
  // 检查停止原因
  if (data && data.reason) {
    console.log('语音识别停止，原因:', data.reason);
    if (data.reason === 'timeout') {
      speechStatus.value = 'timeout';
      // 3秒后恢复idle状态
      setTimeout(() => {
        if (speechStatus.value === 'timeout') {
          speechStatus.value = 'idle';
        }
      }, 3000);
    } else if (data.reason === 'completed') {
      speechStatus.value = 'completed';
      // 确保completed状态也会恢复到idle
      setTimeout(() => {
        if (speechStatus.value === 'completed') {
          speechStatus.value = 'idle';
        }
      }, 2000);
    } else {
      // 其他任何原因都将状态设置为idle
      speechStatus.value = 'idle';
    }
  } else {
    // 如果没有原因，也将状态设置为idle
    speechStatus.value = 'idle';
  }
}

const handleConnectionOpen = () => {
  speechStatus.value = 'connected';
  serverAvailable.value = true;
  console.log('WebSocket连接已打开');
}

const handleConnectionError = (error) => {
  serverAvailable.value = false;
  speechStatus.value = 'error';
  console.error('WebSocket连接错误:', error);
  // 3秒后恢复idle状态或标记为不可用
  setTimeout(() => {
    if (speechStatus.value === 'error') {
      // 再次检查服务器可用性
      checkServerAvailability();
    }
  }, 3000);
}

// 处理语音识别
const toggleSpeechRecognition = async () => {
  console.log('切换语音识别状态，当前状态:', isRecording.value);
  
  if (!speechRecognizer.value) {
    console.error('语音识别组件未初始化');
    speechStatus.value = 'error';
    return;
  }
  
  // 检查服务器是否可用
  if (!serverAvailable.value && !isRecording.value) {
    // 先检查服务器可用性
    const isAvailable = await speechRecognizer.value.checkServerAvailability();
    serverAvailable.value = isAvailable;
    
    if (!isAvailable) {
      speechStatus.value = 'unavailable';
      setTimeout(() => {
        if (speechStatus.value === 'unavailable') {
          speechStatus.value = 'idle';
        }
      }, 3000);
      return;
    }
  }
  
  if (isRecording.value) {
    // 停止录音
    console.log('停止录音');
    speechRecognizer.value.stopRecognition();
    speechStatus.value = 'processing';
    
    // 确保状态最终会恢复到idle，即使没有收到停止事件
    setTimeout(() => {
      if (speechStatus.value === 'processing') {
        console.log('语音处理超时，强制恢复idle状态');
        isRecording.value = false;
        speechStatus.value = 'idle';
      }
    }, 5000);
  } else {
    // 开始录音
    console.log('开始录音');
    const started = await speechRecognizer.value.startRecognition();
    if (started) {
      speechStatus.value = 'connecting';
    } else {
      speechStatus.value = 'error';
      // 3秒后恢复idle状态
      setTimeout(() => {
        if (speechStatus.value === 'error') {
          speechStatus.value = 'idle';
        }
      }, 3000);
    }
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
    <!-- <div class="chat-container">
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
        <div class="input-wrapper">
          <textarea 
            v-model="userInput" 
            @keydown="handleKeyDown" 
            placeholder="输入消息..." 
            :disabled="isLoading"
          ></textarea>
          
          <!-- 实时识别结果 -->
          <div v-if="realtimeText && isRecording" class="realtime-text">
            {{ realtimeText }}
          </div>
        </div>
        
        <div class="input-controls">
          <button 
            class="speech-button" 
            :class="{ 'recording': isRecording }"
            @click="toggleSpeechRecognition"
            :disabled="isLoading || speechStatus === 'connecting'"
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
          <span v-if="speechStatus === 'connecting'">{{ statusMessages.connecting }}</span>
          <span v-if="speechStatus === 'recording'" class="recording-status">{{ statusMessages.recording }}</span>
          <span v-if="speechStatus === 'processing'">{{ statusMessages.processing }}</span>
          <span v-if="speechStatus === 'error'" class="error-status">{{ statusMessages.error }}</span>
          <span v-if="speechStatus === 'timeout'" class="error-status">{{ statusMessages.timeout }}</span>
          <span v-if="speechStatus === 'completed'" class="success-status">{{ statusMessages.completed }}</span>
          <span v-if="speechStatus === 'unavailable'" class="error-status">{{ statusMessages.unavailable }}</span>
        </div>
      </div>
    </div> -->
    
    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
    </div>
    
    <!-- 语音识别组件 (隐藏) -->
    <div style="display: none;">
      <SpeechRecognizer
        ref="speechRecognizer"
        :server-url="asrServerUrl.value"
        :sample-rate="16000"
        :mime-type="'audio/wav'"
        :show-status="false"
        :processing-timeout="10000"
        :enable-realtime="true"
        :realtime-interval="1000"
        @recognition-result="handleRecognitionResult"
        @recognition-realtime="handleRealtimeRecognition"
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
  flex-direction: column;
  padding: 10px;
  border-top: 1px solid #eee;
  pointer-events: auto;
}

.input-wrapper {
  position: relative;
  width: 100%;
  margin-bottom: 8px;
}

.input-controls {
  display: flex;
  gap: 8px;
}

textarea {
  width: 100%;
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

/* 实时识别文本样式 */
.realtime-text {
  font-size: 1.2em;
  font-weight: bold;
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

.success-status {
  color: #27ae60;
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
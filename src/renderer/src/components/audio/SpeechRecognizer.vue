<template>
  <div class="speech-recognizer">
    <div class="recognizer-inner">
      <!-- 录音组件 -->
      <AudioRecorder
        ref="audioRecorder"
        :sample-rate="sampleRate"
        :mime-type="mimeType"
        :auto-request-permission="autoRequestPermission"
        @recording-start="handleRecordingStart"
        @recording-stop="handleRecordingStop"
        @recording-pause="handleRecordingPause"
        @recording-resume="handleRecordingResume"
        @recording-complete="handleRecordingComplete"
        @error="handleRecorderError"
      />
      
      <!-- 语音识别状态 -->
      <div v-if="showStatus" class="recognition-status">
        <p v-if="recognitionStatus" class="status-text">{{ recognitionStatus }}</p>
        
        <!-- 识别结果 -->
        <div v-if="recognitionResult" class="recognition-result">
          <p class="result-label">识别结果:</p>
          <p class="result-text">{{ recognitionResult }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import AudioRecorder from './AudioRecorder.vue';

// 组件属性
const props = defineProps({
  // 语音识别服务URL
  serverUrl: {
    type: String,
    required: true
  },
  // 音频采样率
  sampleRate: {
    type: Number,
    default: 16000
  },
  // 音频格式
  mimeType: {
    type: String,
    default: 'audio/wav'
  },
  // 是否自动获取麦克风权限
  autoRequestPermission: {
    type: Boolean,
    default: false
  },
  // 是否显示状态
  showStatus: {
    type: Boolean,
    default: true
  },
  // 自动连接
  autoConnect: {
    type: Boolean,
    default: false
  }
});

// 组件事件
const emit = defineEmits([
  'recognition-start',
  'recognition-stop',
  'recognition-result',
  'recognition-error',
  'connection-open',
  'connection-close',
  'connection-error'
]);

// 组件引用
const audioRecorder = ref(null);

// 状态
const isConnected = ref(false);
const isRecognizing = ref(false);
const recognitionStatus = ref('');
const recognitionResult = ref('');
const webSocket = ref(null);
const reconnectAttempts = ref(0);
const maxReconnectAttempts = 3;
const reconnectTimeout = ref(null);

// 生命周期钩子
onMounted(() => {
  // 如果设置了自动连接，则连接到服务器
  if (props.autoConnect) {
    connectToServer();
  }
});

onUnmounted(() => {
  // 断开连接
  disconnectFromServer();
  
  // 清理重连定时器
  if (reconnectTimeout.value) {
    clearTimeout(reconnectTimeout.value);
  }
});

// 监听服务器URL变化
watch(() => props.serverUrl, (newUrl, oldUrl) => {
  if (newUrl !== oldUrl && isConnected.value) {
    // 重新连接到新的服务器
    disconnectFromServer();
    connectToServer();
  }
});

// 连接到语音识别服务器
const connectToServer = () => {
  // 如果已经连接，则返回
  if (isConnected.value || webSocket.value) {
    return true;
  }
  
  try {
    // 更新状态
    recognitionStatus.value = '正在连接语音识别服务...';
    
    // 创建WebSocket连接
    webSocket.value = new WebSocket(props.serverUrl);
    
    // 连接打开事件
    webSocket.value.onopen = handleConnectionOpen;
    
    // 收到消息事件
    webSocket.value.onmessage = handleMessage;
    
    // 连接关闭事件
    webSocket.value.onclose = handleConnectionClose;
    
    // 连接错误事件
    webSocket.value.onerror = handleConnectionError;
    
    return true;
  } catch (error) {
    handleError(`连接到语音识别服务失败: ${error.message}`);
    return false;
  }
};

// 断开与语音识别服务器的连接
const disconnectFromServer = () => {
  if (webSocket.value) {
    // 关闭WebSocket连接
    try {
      webSocket.value.close();
    } catch (error) {
      console.error('关闭WebSocket连接失败:', error);
    }
    
    webSocket.value = null;
  }
  
  // 更新状态
  isConnected.value = false;
  isRecognizing.value = false;
};

// 发送音频数据到服务器
const sendAudioData = (audioBlob) => {
  if (!isConnected.value || !webSocket.value) {
    handleError('未连接到语音识别服务');
    return false;
  }
  
  try {
    // 发送音频数据
    webSocket.value.send(audioBlob);
    return true;
  } catch (error) {
    handleError(`发送音频数据失败: ${error.message}`);
    return false;
  }
};

// 尝试重新连接
const attemptReconnect = () => {
  if (reconnectAttempts.value >= maxReconnectAttempts) {
    recognitionStatus.value = '重连失败，已达到最大重试次数';
    return;
  }
  
  reconnectAttempts.value++;
  recognitionStatus.value = `正在尝试重新连接 (${reconnectAttempts.value}/${maxReconnectAttempts})...`;
  
  reconnectTimeout.value = setTimeout(() => {
    connectToServer();
  }, 2000); // 2秒后重试
};

// 处理WebSocket连接打开
const handleConnectionOpen = (event) => {
  isConnected.value = true;
  reconnectAttempts.value = 0; // 重置重连次数
  recognitionStatus.value = '已连接到语音识别服务';
  
  // 发出事件
  emit('connection-open', event);
};

// 处理WebSocket消息
const handleMessage = (event) => {
  try {
    // 解析服务器响应
    const response = JSON.parse(event.data);
    
    if (response.result) {
      // 更新识别结果
      recognitionResult.value = response.result;
      
      // 发出事件
      emit('recognition-result', response);
    }
  } catch (error) {
    console.error('解析WebSocket消息失败:', error);
  }
};

// 处理WebSocket连接关闭
const handleConnectionClose = (event) => {
  isConnected.value = false;
  
  // 如果正在识别，则停止识别
  if (isRecognizing.value) {
    isRecognizing.value = false;
    recognitionStatus.value = '语音识别已停止（连接已关闭）';
    
    // 发出事件
    emit('recognition-stop', { reason: 'connection-closed' });
  } else {
    recognitionStatus.value = '与语音识别服务的连接已关闭';
  }
  
  // 清理WebSocket
  webSocket.value = null;
  
  // 发出事件
  emit('connection-close', event);
  
  // 如果不是正常关闭，尝试重新连接
  if (event.code !== 1000) {
    attemptReconnect();
  }
};

// 处理WebSocket连接错误
const handleConnectionError = (error) => {
  handleError(`与语音识别服务的连接发生错误: ${error.message || '未知错误'}`);
  
  // 发出事件
  emit('connection-error', error);
  
  // 尝试重新连接
  attemptReconnect();
};

// 处理录音开始
const handleRecordingStart = () => {
  // 连接到服务器（如果未连接）
  if (!isConnected.value) {
    const connected = connectToServer();
    if (!connected) return;
  }
  
  // 更新状态
  isRecognizing.value = true;
  recognitionStatus.value = '语音识别已开始';
  recognitionResult.value = '';
  
  // 发出事件
  emit('recognition-start');
};

// 处理录音停止
const handleRecordingStop = () => {
  // 更新状态
  isRecognizing.value = false;
  recognitionStatus.value = '语音识别已停止';
  
  // 发出事件
  emit('recognition-stop', { reason: 'user-stopped' });
};

// 处理录音暂停
const handleRecordingPause = () => {
  recognitionStatus.value = '语音识别已暂停';
};

// 处理录音恢复
const handleRecordingResume = () => {
  recognitionStatus.value = '语音识别已恢复';
};

// 处理录音完成
const handleRecordingComplete = ({ blob, url, duration }) => {
  // 发送音频数据到服务器
  if (isConnected.value) {
    sendAudioData(blob);
    recognitionStatus.value = '正在处理语音...';
  }
};

// 处理录音错误
const handleRecorderError = (error) => {
  handleError(`录音错误: ${error.message}`);
};

// 处理错误
const handleError = (message) => {
  console.error('语音识别错误:', message);
  recognitionStatus.value = `错误: ${message}`;
  
  // 发出事件
  emit('recognition-error', new Error(message));
};

// 开始语音识别
const startRecognition = () => {
  if (audioRecorder.value) {
    return audioRecorder.value.startRecording();
  }
};

// 停止语音识别
const stopRecognition = () => {
  if (audioRecorder.value) {
    return audioRecorder.value.stopRecording();
  }
};

// 暂停语音识别
const pauseRecognition = () => {
  if (audioRecorder.value) {
    return audioRecorder.value.pauseRecording();
  }
};

// 恢复语音识别
const resumeRecognition = () => {
  if (audioRecorder.value) {
    return audioRecorder.value.resumeRecording();
  }
};

// 导出方法供父组件使用
defineExpose({
  startRecognition,
  stopRecognition,
  pauseRecognition,
  resumeRecognition,
  connectToServer,
  disconnectFromServer,
  isConnected,
  isRecognizing,
  recognitionStatus,
  recognitionResult
});
</script>

<style scoped>
.speech-recognizer {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  width: 100%;
  max-width: 500px;
  margin: 0 auto;
}

.recognizer-inner {
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}

.recognition-status {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #e2e8f0;
}

.status-text {
  font-size: 14px;
  color: #4a5568;
  margin: 0;
  text-align: center;
}

.recognition-result {
  margin-top: 16px;
  background-color: white;
  border-radius: 4px;
  padding: 12px;
  border: 1px solid #e2e8f0;
}

.result-label {
  font-size: 12px;
  color: #718096;
  margin: 0 0 8px 0;
}

.result-text {
  font-size: 16px;
  color: #2d3748;
  margin: 0;
  line-height: 1.5;
}
</style>
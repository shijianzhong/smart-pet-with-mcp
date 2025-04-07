<template>
  <div class="speech-recognizer">
    <div class="recognizer-inner">
      <!-- 录音组件 -->
      <AudioRecorder
        ref="audioRecorder"
        :sample-rate="sampleRate"
        :mime-type="mimeType"
        :auto-request-permission="autoRequestPermission"
        :enable-realtime="enableRealtime"
        :realtime-interval="realtimeInterval"
        @recording-start="handleRecordingStart"
        @recording-stop="handleRecordingStop"
        @recording-pause="handleRecordingPause"
        @recording-resume="handleRecordingResume"
        @recording-complete="handleRecordingComplete"
        @realtime-data="handleRealtimeData"
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
        
        <!-- 实时识别结果 -->
        <div v-if="realtimeResult && realtimeResult !== recognitionResult" class="recognition-result realtime">
          <p class="result-label">实时识别:</p>
          <p class="result-text">{{ realtimeResult }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue';
import AudioRecorder from './AudioRecorder.vue';
import { SpeechRecognition } from '../speech/speechRecognition.js';

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
  },
  // 处理超时时间(毫秒)
  processingTimeout: {
    type: Number,
    default: 10000
  },
  // 是否启用实时识别
  enableRealtime: {
    type: Boolean,
    default: true
  },
  // 实时数据发送间隔(毫秒)
  realtimeInterval: {
    type: Number,
    default: 1000
  },
  // ASR模式
  mode: {
    type: String,
    default: '2pass',
    validator: value => ['offline', 'online', '2pass'].includes(value)
  },
  // 热词列表
  hotwords: {
    type: Array,
    default: () => []
  },
  // 是否使用ITN(逆文本正则化)
  useITN: {
    type: Boolean,
    default: true
  }
});

// 组件事件
const emit = defineEmits([
  'recognition-start',
  'recognition-stop',
  'recognition-pause',
  'recognition-resume',
  'recognition-result',
  'recognition-realtime',
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
const realtimeResult = ref('');
const webSocket = ref(null);
const reconnectAttempts = ref(0);
const maxReconnectAttempts = 3;
const reconnectTimeout = ref(null);
const processingTimeoutId = ref(null);

// FunASR语音识别引擎
const speechRecognition = ref(null);

// 生命周期钩子
onMounted(async () => {
  console.log('SpeechRecognizer组件已挂载');
  
  // 初始化语音识别引擎
  initSpeechRecognition();
  
  // 如果设置了自动连接，则检查服务器可用性并连接
  if (props.autoConnect) {
    const isAvailable = await checkServerAvailability();
    if (isAvailable) {
      // 服务可用，自动连接
      console.log('服务可用，自动连接');
    } else {
      // 服务不可用
      recognitionStatus.value = '语音识别服务不可用，请检查服务器';
      emit('connection-error', new Error('语音识别服务不可用'));
    }
  }
});

onUnmounted(() => {
  // 停止识别
  stopRecognition();
  
  // 清理重连定时器
  if (reconnectTimeout.value) {
    clearTimeout(reconnectTimeout.value);
  }
  
  // 清理处理超时定时器
  if (processingTimeoutId.value) {
    clearTimeout(processingTimeoutId.value);
  }
});

// 监听服务器URL变化
watch(() => props.serverUrl, (newUrl, oldUrl) => {
  if (newUrl !== oldUrl) {
    // 重新初始化语音识别引擎
    initSpeechRecognition();
  }
});

// 初始化FunASR语音识别引擎
const initSpeechRecognition = () => {
  // 如果已存在实例，先清理
  if (speechRecognition.value) {
    stopRecognition();
  }
  
  // 创建新的语音识别实例
  speechRecognition.value = new SpeechRecognition({
    serverUrl: props.serverUrl,
    mode: props.mode,
    useITN: props.useITN,
    hotwords: props.hotwords.length > 0 ? props.hotwords : null,
    onResult: handleRecognitionResult,
    onRealtimeResult: handleRealtimeResult,
    onStateChange: handleRecognitionState
  });
  
  console.log('语音识别引擎已初始化');
};

// 检查服务器是否可用
const checkServerAvailability = async () => {
  if (!speechRecognition.value) {
    return false;
  }
  
  recognitionStatus.value = '正在检查语音识别服务可用性...';
  
  try {
    const isAvailable = await speechRecognition.value.checkServerAvailability();
    isConnected.value = isAvailable;
    
    if (isAvailable) {
      recognitionStatus.value = '语音识别服务可用';
    } else {
      recognitionStatus.value = '语音识别服务不可用，请检查服务器';
    }
    
    return isAvailable;
  } catch (error) {
    console.error('检查服务器可用性失败:', error);
    recognitionStatus.value = '检查服务器可用性时出错';
    isConnected.value = false;
    return false;
  }
};

// 开始语音识别
const startRecognition = async () => {
  if (isRecognizing.value) {
    console.warn('已经在进行语音识别');
    return false;
  }
  
  if (!speechRecognition.value) {
    console.error('语音识别引擎未初始化');
    recognitionStatus.value = '语音识别引擎未初始化';
    emit('recognition-error', new Error('语音识别引擎未初始化'));
    return false;
  }
  
  // 先检查服务器可用性
  const isAvailable = await checkServerAvailability();
  if (!isAvailable) {
    console.error('语音识别服务不可用');
    emit('recognition-error', new Error('语音识别服务不可用'));
    return false;
  }
  
  // 重置状态
  recognitionResult.value = '';
  realtimeResult.value = '';
  reconnectAttempts.value = 0;
  
  // 开始识别
  recognitionStatus.value = '正在启动语音识别...';
  
  try {
    const success = await speechRecognition.value.start();
    
    if (success) {
      isRecognizing.value = true;
      recognitionStatus.value = '正在录音...';
      emit('recognition-start');
      
      // 设置处理超时
      if (props.processingTimeout > 0) {
        processingTimeoutId.value = setTimeout(() => {
          // 如果超时仍在识别，则停止
          if (isRecognizing.value) {
            stopRecognition('timeout');
          }
        }, props.processingTimeout);
      }
      
      return true;
    } else {
      recognitionStatus.value = '启动语音识别失败';
      emit('recognition-error', new Error('启动语音识别失败'));
      return false;
    }
  } catch (error) {
    console.error('启动语音识别时出错:', error);
    recognitionStatus.value = `启动语音识别出错: ${error.message}`;
    emit('recognition-error', error);
    return false;
  }
};

// 停止语音识别
const stopRecognition = (reason = 'user') => {
  if (!isRecognizing.value) {
    return false;
  }
  
  // 清除处理超时定时器
  if (processingTimeoutId.value) {
    clearTimeout(processingTimeoutId.value);
    processingTimeoutId.value = null;
  }
  
  // 停止识别
  if (speechRecognition.value) {
    recognitionStatus.value = '正在停止语音识别...';
    speechRecognition.value.stop();
  }
  
  // 更新状态
  isRecognizing.value = false;
  recognitionStatus.value = reason === 'timeout' 
    ? '语音识别超时' 
    : '语音识别已停止';
  
  emit('recognition-stop', { reason });
  return true;
};

// 处理语音识别结果
const handleRecognitionResult = (result) => {
  console.log('收到语音识别结果:', result);
  
  if (result && result.text) {
    recognitionResult.value = result.text;
    emit('recognition-result', {
      text: result.text,
      isFinal: result.isFinal || false
    });
    
    // 如果是最终结果
    if (result.isFinal) {
      recognitionStatus.value = '语音识别完成';
      // 清除超时定时器
      if (processingTimeoutId.value) {
        clearTimeout(processingTimeoutId.value);
        processingTimeoutId.value = null;
      }
    }
  }
};

// 处理实时语音识别结果
const handleRealtimeResult = (result) => {
  if (!props.enableRealtime) return;
  
  console.log('收到实时语音识别结果:', result);
  
  if (result && result.text) {
    realtimeResult.value = result.text;
    emit('recognition-realtime', {
      text: result.text,
      isFinal: false
    });
  }
};

// 处理语音识别状态变化
const handleRecognitionState = (state) => {
  console.log('语音识别状态变化:', state);
  
  switch (state) {
    case 'ready':
      recognitionStatus.value = '语音识别就绪';
      break;
    case 'connecting':
      recognitionStatus.value = '正在连接语音识别服务...';
      emit('connection-open');
      break;
    case 'connected':
      recognitionStatus.value = '已连接语音识别服务';
      isConnected.value = true;
      reconnectAttempts.value = 0;
      emit('connection-open');
      break;
    case 'disconnected':
      recognitionStatus.value = '语音识别服务连接已断开';
      isConnected.value = false;
      emit('connection-close');
      break;
    case 'recording':
      recognitionStatus.value = '正在录音...';
      break;
    case 'stopped':
      recognitionStatus.value = '语音识别已停止';
      isRecognizing.value = false;
      break;
    case 'error':
      recognitionStatus.value = '语音识别出错';
      isRecognizing.value = false;
      emit('recognition-error', new Error('语音识别出错'));
      break;
    default:
      recognitionStatus.value = state;
  }
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
  console.log('录音完成，时长:', duration, '秒');
  
  // 发送音频数据到服务器
  if (isConnected.value) {
    recognitionStatus.value = '正在处理语音...';
    sendAudioData(blob);
  } else {
    handleError('未连接到语音识别服务，无法处理语音');
    
    // 尝试重新连接
    connectToServer();
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
  
  // 清理处理超时定时器
  if (processingTimeoutId.value) {
    clearTimeout(processingTimeoutId.value);
    processingTimeoutId.value = null;
  }
  
  // 发出事件
  emit('recognition-error', new Error(message));
};

// 处理实时音频数据
const handleRealtimeData = ({ blob, duration }) => {
  if (!isConnected.value || !webSocket.value) {
    console.warn('未连接到语音识别服务，无法发送实时音频数据');
    return;
  }
  
  try {
    console.log(`发送${duration}秒的实时音频数据`);
    
    // 发送音频数据
    webSocket.value.send(blob);
  } catch (error) {
    console.error('发送实时音频数据失败:', error);
  }
};

// 连接到语音识别服务器
const connectToServer = async () => {
  // 如果已经连接，则返回
  if (isConnected.value || webSocket.value) {
    return true;
  }
  
  try {
    // 更新状态
    recognitionStatus.value = '正在连接语音识别服务...';
    
    console.log(`正在连接到语音识别服务: ${props.serverUrl}`);
    
    // 先检查服务器是否可用
    const isAvailable = await checkServerAvailability();
    if (!isAvailable) {
      handleError('语音识别服务不可用，请检查服务器');
      return false;
    }
    
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
    console.error('WebSocket连接创建失败:', error);
    handleError(`连接到语音识别服务失败: ${error.message}`);
    return false;
  }
};

// 断开与语音识别服务器的连接
const disconnectFromServer = () => {
  console.log('断开与语音识别服务的连接');
  
  // 清理处理超时定时器
  if (processingTimeoutId.value) {
    clearTimeout(processingTimeoutId.value);
    processingTimeoutId.value = null;
  }
  
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
    console.log('发送音频数据到语音识别服务');
    
    // 设置处理超时
    processingTimeoutId.value = setTimeout(() => {
      console.warn(`语音处理超时(${props.processingTimeout}ms)`);
      
      // 发出错误事件
      emit('recognition-error', new Error('语音处理超时'));
      
      // 更新状态
      recognitionStatus.value = '语音处理超时，请重试';
      
      // 清理状态
      processingTimeoutId.value = null;
      
      // 发出结束事件
      emit('recognition-stop', { reason: 'timeout' });
    }, props.processingTimeout);
    
    // 发送音频数据
    webSocket.value.send(audioBlob);
    return true;
  } catch (error) {
    console.error('发送音频数据失败:', error);
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
  console.log('WebSocket连接已打开');
  isConnected.value = true;
  reconnectAttempts.value = 0; // 重置重连次数
  recognitionStatus.value = '已连接到语音识别服务';
  
  // 发出事件
  emit('connection-open', event);
};

// 处理WebSocket消息
const handleMessage = (event) => {
  try {
    console.log('收到WebSocket消息:', event.data);
    
    // 清理处理超时定时器
    if (processingTimeoutId.value) {
      clearTimeout(processingTimeoutId.value);
      processingTimeoutId.value = null;
    }
    
    // 解析服务器响应
    const response = JSON.parse(event.data);
    
    // 根据消息类型处理
    if (response.type === 'partial' || response.partial || response.is_partial) {
      // 处理实时识别结果
      handleRealtimeResult(response);
    } else if (response.result || response.text) {
      // 处理最终识别结果
      handleFinalResult(response);
    }
    
    // 处理可能的错误信息
    if (response.error) {
      handleError(`服务器返回错误: ${response.error}`);
    }
  } catch (error) {
    console.error('解析WebSocket消息失败:', error);
    handleError(`解析语音识别结果失败: ${error.message}`);
  }
};

// 处理最终识别结果
const handleFinalResult = (response) => {
  // 提取结果文本
  const text = response.result || response.text || '';
  
  // 更新识别结果
  recognitionResult.value = text;
  
  // 更新状态
  recognitionStatus.value = '语音识别完成';
  
  // 发出事件
  emit('recognition-result', {
    text,
    isPartial: false,
    originalResponse: response
  });
  
  // 清空实时结果
  realtimeResult.value = '';
  
  // 如果正在识别，则停止识别
  if (isRecognizing.value) {
    isRecognizing.value = false;
    
    // 发出停止事件
    emit('recognition-stop', { reason: 'completed' });
  }
  
  console.log('最终识别结果:', text);
};

// 处理WebSocket连接关闭
const handleConnectionClose = (event) => {
  console.log('WebSocket连接已关闭', event);
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
  
  // 清理处理超时定时器
  if (processingTimeoutId.value) {
    clearTimeout(processingTimeoutId.value);
    processingTimeoutId.value = null;
  }
  
  // 发出事件
  emit('connection-close', event);
  
  // 如果不是正常关闭，尝试重新连接
  if (event.code !== 1000) {
    attemptReconnect();
  }
};

// 处理WebSocket连接错误
const handleConnectionError = (error) => {
  console.error('WebSocket连接错误:', error);
  handleError(`与语音识别服务的连接发生错误: ${error.message || '未知错误'}`);
  
  // 发出事件
  emit('connection-error', error);
  
  // 尝试重新连接
  attemptReconnect();
};

// 暴露给父组件的方法
defineExpose({
  startRecognition,
  stopRecognition,
  checkServerAvailability,
  isRecognizing: () => isRecognizing.value,
  isConnected: () => isConnected.value,
  getRecognitionResult: () => recognitionResult.value,
  getRealtimeResult: () => realtimeResult.value
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

.recognition-result.realtime {
  background-color: #f8f9fa;
  border: 1px dashed #e2e8f0;
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

.recognition-result.realtime .result-text {
  color: #4a5568;
  font-style: italic;
}
</style>
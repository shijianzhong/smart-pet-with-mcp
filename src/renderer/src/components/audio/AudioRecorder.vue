<template>
  <div class="audio-recorder">
    <div class="recorder-controls">
      <button 
        class="control-button" 
        :class="{ 'recording': isRecording }"
        @click="toggleRecording" 
        :disabled="isProcessing"
      >
        <span v-if="isRecording">停止录音</span>
        <span v-else>开始录音</span>
      </button>
      
      <button 
        v-if="isRecording" 
        class="control-button"
        @click="togglePause"
        :disabled="isProcessing"
      >
        <span v-if="isPaused">继续录音</span>
        <span v-else>暂停录音</span>
      </button>
    </div>

    <!-- 录音状态 -->
    <div v-if="recordingStatus" class="recording-status">
      {{ recordingStatus }}
    </div>

    <!-- 音量指示器 -->
    <div v-if="isRecording && !isPaused" class="volume-indicator">
      <div 
        v-for="(bar, index) in volumeBars" 
        :key="index" 
        class="volume-bar"
        :style="{ height: bar + '%' }"
      ></div>
    </div>

    <!-- 录音时长 -->
    <div v-if="isRecording" class="recording-time">
      录音时长: {{ formatTime(recordingTime) }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';

// 组件属性
const props = defineProps({
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
  }
});

// 组件事件
const emit = defineEmits([
  'recording-start', 
  'recording-stop', 
  'recording-pause', 
  'recording-resume',
  'recording-complete', 
  'error'
]);

// 录音状态
const isRecording = ref(false);
const isPaused = ref(false);
const isProcessing = ref(false);
const recordingStatus = ref('');
const recordingTime = ref(0);
const recordingStartTime = ref(0);
const recordingTimer = ref(null);

// 音频上下文
const audioContext = ref(null);
const analyser = ref(null);
const mediaRecorder = ref(null);
const audioStream = ref(null);
const audioChunks = ref([]);
const volumeData = ref(new Uint8Array(0));
const volumeBars = ref(Array(20).fill(0));

// 初始化音频上下文
onMounted(async () => {
  try {
    // 检查浏览器支持
    if (!navigator.mediaDevices || !window.MediaRecorder) {
      throw new Error('您的浏览器不支持录音功能');
    }

    // 创建音频上下文
    audioContext.value = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: props.sampleRate
    });

    // 如果设置了自动请求权限，则请求麦克风权限
    if (props.autoRequestPermission) {
      await requestMicrophonePermission();
    }

    recordingStatus.value = '录音组件已就绪';
  } catch (error) {
    handleError(error);
  }
});

// 清理资源
onUnmounted(() => {
  stopRecording();
  if (audioStream.value) {
    audioStream.value.getTracks().forEach(track => track.stop());
  }
  if (audioContext.value) {
    audioContext.value.close();
  }
  clearInterval(recordingTimer.value);
});

// 请求麦克风权限
const requestMicrophonePermission = async () => {
  try {
    recordingStatus.value = '正在请求麦克风权限...';
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: { 
        sampleRate: props.sampleRate,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });
    
    audioStream.value = stream;
    
    // 设置分析器
    setupAudioAnalyser(stream);
    
    recordingStatus.value = '麦克风权限已获取';
    return stream;
  } catch (error) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      throw new Error('麦克风权限被拒绝，请允许访问麦克风');
    } else {
      throw new Error(`获取麦克风权限失败: ${error.message}`);
    }
  }
};

// 设置音频分析器
const setupAudioAnalyser = (stream) => {
  if (!audioContext.value) return;
  
  const source = audioContext.value.createMediaStreamSource(stream);
  analyser.value = audioContext.value.createAnalyser();
  analyser.value.fftSize = 256;
  source.connect(analyser.value);
  
  volumeData.value = new Uint8Array(analyser.value.frequencyBinCount);
};

// 更新音量指示器
const updateVolumeIndicator = () => {
  if (!analyser.value || !isRecording.value || isPaused.value) return;
  
  analyser.value.getByteFrequencyData(volumeData.value);
  
  // 计算平均音量
  let sum = 0;
  for (let i = 0; i < volumeData.value.length; i++) {
    sum += volumeData.value[i];
  }
  const average = sum / volumeData.value.length;
  
  // 更新音量条
  const scaledValue = Math.min(100, average * 2); // 将0-128的值映射到0-100
  
  // 生成音量条的高度数组
  for (let i = 0; i < volumeBars.value.length; i++) {
    // 随机变化，使音量条看起来更自然
    const randomFactor = 0.7 + Math.random() * 0.6;
    const targetHeight = scaledValue * randomFactor;
    // 平滑过渡
    volumeBars.value[i] = volumeBars.value[i] * 0.7 + targetHeight * 0.3;
  }
  
  // 继续更新
  requestAnimationFrame(updateVolumeIndicator);
};

// 开始录音
const startRecording = async () => {
  try {
    if (isRecording.value) return;
    
    // 如果未获取麦克风权限，先获取
    if (!audioStream.value) {
      audioStream.value = await requestMicrophonePermission();
    }
    
    // 清空之前的录音数据
    audioChunks.value = [];
    
    // 创建MediaRecorder实例
    const options = {
      audioBitsPerSecond: 128000
    };
    
    // 检查是否支持指定的MIME类型
    if (MediaRecorder.isTypeSupported(props.mimeType)) {
      options.mimeType = props.mimeType;
    }
    
    mediaRecorder.value = new MediaRecorder(audioStream.value, options);
    
    // 设置数据可用时的处理函数
    mediaRecorder.value.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.value.push(event.data);
      }
    };
    
    // 录音停止时的处理函数
    mediaRecorder.value.onstop = () => {
      processAudioData();
    };
    
    // 录音错误处理
    mediaRecorder.value.onerror = (event) => {
      handleError(new Error(`录音错误: ${event.error}`));
    };
    
    // 开始录音
    mediaRecorder.value.start(100); // 每100ms触发一次dataavailable事件
    
    // 设置录音状态
    isRecording.value = true;
    isPaused.value = false;
    recordingStatus.value = '正在录音...';
    
    // 开始计时
    recordingStartTime.value = Date.now();
    startRecordingTimer();
    
    // 开始更新音量指示器
    requestAnimationFrame(updateVolumeIndicator);
    
    // 发出事件
    emit('recording-start');
  } catch (error) {
    handleError(error);
  }
};

// 暂停录音
const pauseRecording = () => {
  if (!isRecording.value || !mediaRecorder.value || mediaRecorder.value.state !== 'recording') return;
  
  try {
    mediaRecorder.value.pause();
    isPaused.value = true;
    recordingStatus.value = '录音已暂停';
    
    // 暂停计时
    clearInterval(recordingTimer.value);
    
    // 发出事件
    emit('recording-pause');
  } catch (error) {
    handleError(error);
  }
};

// 恢复录音
const resumeRecording = () => {
  if (!isRecording.value || !mediaRecorder.value || mediaRecorder.value.state !== 'paused') return;
  
  try {
    mediaRecorder.value.resume();
    isPaused.value = false;
    recordingStatus.value = '正在录音...';
    
    // 恢复计时
    startRecordingTimer();
    
    // 重新开始更新音量指示器
    requestAnimationFrame(updateVolumeIndicator);
    
    // 发出事件
    emit('recording-resume');
  } catch (error) {
    handleError(error);
  }
};

// 停止录音
const stopRecording = () => {
  if (!isRecording.value || !mediaRecorder.value) return;
  
  try {
    if (mediaRecorder.value.state === 'recording' || mediaRecorder.value.state === 'paused') {
      mediaRecorder.value.stop();
      isProcessing.value = true;
      recordingStatus.value = '正在处理录音...';
      
      // 停止计时
      clearInterval(recordingTimer.value);
      
      // 发出事件
      emit('recording-stop');
    }
  } catch (error) {
    handleError(error);
  }
};

// 处理音频数据
const processAudioData = () => {
  try {
    // 创建Blob对象
    const audioBlob = new Blob(audioChunks.value, { type: props.mimeType });
    
    // 创建音频URL
    const audioUrl = URL.createObjectURL(audioBlob);
    
    // 重置状态
    isRecording.value = false;
    isPaused.value = false;
    isProcessing.value = false;
    recordingStatus.value = '录音已完成';
    
    // 发出事件
    emit('recording-complete', { 
      blob: audioBlob, 
      url: audioUrl, 
      duration: recordingTime.value 
    });
  } catch (error) {
    handleError(error);
  }
};

// 开始录音计时器
const startRecordingTimer = () => {
  clearInterval(recordingTimer.value);
  recordingTimer.value = setInterval(() => {
    recordingTime.value = Math.floor((Date.now() - recordingStartTime.value) / 1000);
  }, 1000);
};

// 格式化时间
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// 切换录音
const toggleRecording = () => {
  if (isRecording.value) {
    stopRecording();
  } else {
    startRecording();
  }
};

// 切换暂停
const togglePause = () => {
  if (isPaused.value) {
    resumeRecording();
  } else {
    pauseRecording();
  }
};

// 错误处理
const handleError = (error) => {
  console.error('录音错误:', error);
  recordingStatus.value = `错误: ${error.message}`;
  
  // 重置状态
  isRecording.value = false;
  isPaused.value = false;
  isProcessing.value = false;
  
  // 清理计时器
  clearInterval(recordingTimer.value);
  
  // 发出错误事件
  emit('error', error);
};

// 导出方法供父组件使用
defineExpose({
  startRecording,
  stopRecording,
  pauseRecording,
  resumeRecording,
  isRecording,
  isPaused,
  recordingStatus,
  recordingTime
});
</script>

<style scoped>
.audio-recorder {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}

.recorder-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}

.control-button {
  padding: 8px 16px;
  border-radius: 4px;
  border: none;
  background-color: #4361ee;
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
}

.control-button:hover {
  background-color: #3a56d4;
}

.control-button:disabled {
  background-color: #a0aec0;
  cursor: not-allowed;
}

.control-button.recording {
  background-color: #e63946;
}

.control-button.recording:hover {
  background-color: #d62b39;
}

.recording-status {
  font-size: 14px;
  color: #4a5568;
  margin-bottom: 16px;
  text-align: center;
}

.recording-time {
  font-size: 14px;
  color: #4a5568;
  text-align: center;
  margin-top: 16px;
}

.volume-indicator {
  display: flex;
  justify-content: center;
  align-items: flex-end;
  height: 40px;
  gap: 2px;
  margin: 16px 0;
  background-color: rgba(0, 0, 0, 0.05);
  border-radius: 4px;
  overflow: hidden;
  padding: 4px;
}

.volume-bar {
  width: 4px;
  background-color: #4361ee;
  border-radius: 2px;
  transition: height 0.1s ease;
}
</style>
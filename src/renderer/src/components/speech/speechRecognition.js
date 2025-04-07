/**
 * 语音识别服务
 * 基于FunASR语音识别引擎
 */
import { WebSocketConnector } from './wsconnector.js';

// 语音识别服务类
export class SpeechRecognition {
  constructor(config = {}) {
    // 保存配置
    this.serverUrl = config.serverUrl || 'ws://127.0.0.1:10096/';
    this.onResult = config.onResult || (() => {});
    this.onRealtimeResult = config.onRealtimeResult || (() => {});
    this.onStateChange = config.onStateChange || (() => {});
    this.mode = config.mode || '2pass';
    this.hotwords = config.hotwords || null;
    this.useITN = config.useITN !== undefined ? config.useITN : true;
    
    // 初始化状态
    this.isRecording = false;
    this.sampleBuf = new Int16Array();
    this.recText = '';
    this.initialized = false;
    this.audioContext = null;
    this.mediaStream = null;
    this.scriptProcessor = null;
    this.wsConnector = null;
    this.retryCount = 0;
    this.maxRetries = 3;
    
    // 初始化WebSocket连接器
    this.wsConnector = new WebSocketConnector({
      serverUrl: this.serverUrl,
      mode: this.mode,
      useITN: this.useITN,
      hotwords: this.hotwords,
      msgHandle: (e) => this.handleMessage(e),
      stateHandle: (state) => this.handleStateChange(state)
    });
    
    // 尝试初始化音频上下文
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000
      });
      this.initialized = true;
      console.log("语音识别初始化成功");
      this.onStateChange('ready');
    } catch (error) {
      console.error("音频上下文创建失败:", error);
      this.onStateChange('error');
    }
  }
  
  // 检查是否初始化成功
  isInitialized() {
    return this.initialized === true;
  }

  // 处理WebSocket消息
  handleMessage(jsonMsg) {
    try {
      const data = JSON.parse(jsonMsg.data);
      const text = data.text || '';
      const isFinal = data.is_final || false;
      const mode = data.mode || '';
      
      // 根据模式处理结果
      if (mode === '2pass-online') {
        // 实时识别结果
        this.onRealtimeResult({ text, isFinal: false });
      } else if (mode === '2pass-offline' || isFinal) {
        // 最终识别结果
        this.recText = text;
        this.onResult({ text: this.recText, isFinal: true });
        
        // 如果是最终结果，自动停止录音
        if (isFinal) {
          this.stop();
        }
      }
    } catch (error) {
      console.error('处理语音识别结果出错:', error);
    }
  }

  // 处理连接状态变化
  handleStateChange(connState) {
    if (connState === 0) { // 连接成功
      console.log('WebSocket连接成功');
      this.onStateChange('connected');
      this.retryCount = 0;
    } else if (connState === 1) { // 连接关闭
      console.log('WebSocket连接关闭');
      this.onStateChange('disconnected');
      
      // 如果正在录音，尝试重连
      if (this.isRecording && this.retryCount < this.maxRetries) {
        console.log(`尝试重连 (${this.retryCount + 1}/${this.maxRetries})...`);
        this.retryCount++;
        setTimeout(() => {
          this.wsConnector.wsStart();
        }, 1000);
      }
    } else if (connState === 2) { // 连接错误
      console.error('WebSocket连接错误');
      this.onStateChange('error');
      
      // 如果正在录音，尝试重连
      if (this.isRecording && this.retryCount < this.maxRetries) {
        console.log(`尝试重连 (${this.retryCount + 1}/${this.maxRetries})...`);
        this.retryCount++;
        setTimeout(() => {
          this.wsConnector.wsStart();
        }, 1000);
      }
    }
  }

  // 开始录音和识别
  async start() {
    if (this.isRecording) {
      console.warn("已经在录音中，请先停止当前录音");
      return false;
    }
    
    try {
      // 重置状态
      this.recText = '';
      this.sampleBuf = new Int16Array();
      this.retryCount = 0;
      
      // 请求麦克风权限
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      // 开始WebSocket连接
      const wsStartResult = this.wsConnector.wsStart();
      if (wsStartResult !== 1) {
        throw new Error('WebSocket连接失败');
      }
      
      // 设置音频处理
      const audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // 创建ScriptProcessor节点处理音频数据
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      // 处理音频数据
      this.scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
        if (!this.isRecording) return;
        
        // 获取输入音频数据
        const inputBuffer = audioProcessingEvent.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // 转换为Int16格式
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.min(1, Math.max(-1, inputData[i])) * 0x7FFF;
        }
        
        // 添加到缓冲区
        this.sampleBuf = Int16Array.from([...this.sampleBuf, ...pcmData]);
        
        // 每960个样本发送一次数据（60ms @ 16kHz）
        const chunkSize = 960;
        while (this.sampleBuf.length >= chunkSize) {
          const sendBuf = this.sampleBuf.slice(0, chunkSize);
          this.sampleBuf = this.sampleBuf.slice(chunkSize, this.sampleBuf.length);
          this.wsConnector.wsSend(sendBuf);
        }
      };
      
      // 连接节点
      audioSource.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
      
      // 更新状态
      this.isRecording = true;
      this.onStateChange('recording');
      
      return true;
    } catch (error) {
      console.error('启动语音识别失败:', error);
      this.onStateChange('error');
      return false;
    }
  }

  // 停止录音和识别
  stop() {
    if (!this.isRecording) {
      return false;
    }
    
    try {
      // 发送结束标志
      this.wsConnector.wsSend(JSON.stringify({ "is_speaking": false }));
      
      // 停止录音
      if (this.scriptProcessor) {
        this.scriptProcessor.disconnect();
        this.scriptProcessor = null;
      }
      
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }
      
      // 更新状态
      this.isRecording = false;
      this.onStateChange('stopped');
      
      // 5秒后关闭WebSocket连接（给服务器处理结果的时间）
      setTimeout(() => {
        if (this.wsConnector) {
          this.wsConnector.wsStop();
        }
      }, 5000);
      
      return true;
    } catch (error) {
      console.error('停止语音识别失败:', error);
      return false;
    }
  }
  
  // 检查服务器是否可用
  async checkServerAvailability() {
    return new Promise((resolve) => {
      // 创建临时WebSocket连接检查服务器是否可用
      try {
        const testSocket = new WebSocket(this.serverUrl);
        
        // 设置超时
        const timeout = setTimeout(() => {
          console.log('检查服务器可用性超时');
          resolve(false);
          
          try {
            testSocket.close();
          } catch (e) {
            // 忽略关闭错误
          }
        }, 3000);
        
        // 连接成功
        testSocket.onopen = () => {
          clearTimeout(timeout);
          console.log('服务器可用');
          testSocket.close();
          resolve(true);
        };
        
        // 连接错误
        testSocket.onerror = () => {
          clearTimeout(timeout);
          console.error('服务器不可用');
          resolve(false);
        };
      } catch (error) {
        console.error('检查服务器可用性出错:', error);
        resolve(false);
      }
    });
  }
  
  // 更新配置
  updateConfig(config) {
    if (config.serverUrl) {
      this.serverUrl = config.serverUrl;
      if (this.wsConnector) {
        this.wsConnector.serverUrl = config.serverUrl;
      }
    }
    
    if (config.mode !== undefined) {
      this.mode = config.mode;
      if (this.wsConnector) {
        this.wsConnector.mode = config.mode;
      }
    }
    
    if (config.useITN !== undefined) {
      this.useITN = config.useITN;
      if (this.wsConnector) {
        this.wsConnector.useITN = config.useITN;
      }
    }
    
    if (config.hotwords !== undefined) {
      this.hotwords = config.hotwords;
      if (this.wsConnector) {
        this.wsConnector.hotwords = config.hotwords;
      }
    }
  }
} 
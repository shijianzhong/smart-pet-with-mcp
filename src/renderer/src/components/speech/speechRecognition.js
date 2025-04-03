/**
 * 语音识别服务
 * 基于FunASR语音识别引擎
 */

// WebSocket连接类
class WebSocketConnectMethod {
  constructor(config) {
    this.speechSokt = null;
    this.msgHandle = config.msgHandle;
    this.stateHandle = config.stateHandle;
  }

  // 启动WebSocket连接
  wsStart(serverUrl) {
    if (!serverUrl.match(/wss?:\S*/)) {
      console.error('WebSocket地址格式错误');
      return 0;
    }

    if ('WebSocket' in window) {
      this.speechSokt = new WebSocket(serverUrl);
      this.speechSokt.onopen = (e) => this.onOpen(e);
      this.speechSokt.onclose = (e) => this.onClose(e);
      this.speechSokt.onmessage = (e) => this.onMessage(e);
      this.speechSokt.onerror = (e) => this.onError(e);
      return 1;
    } else {
      console.error('当前浏览器不支持WebSocket');
      return 0;
    }
  }

  // 停止WebSocket连接
  wsStop() {
    if (this.speechSokt) {
      this.speechSokt.close();
    }
  }

  // 发送数据
  wsSend(oneData) {
    if (!this.speechSokt) return;
    if (this.speechSokt.readyState === 1) { // 0:CONNECTING, 1:OPEN, 2:CLOSING, 3:CLOSED
      this.speechSokt.send(oneData);
    }
  }

  // 连接打开回调
  onOpen(e) {
    // 发送初始化配置
    const chunk_size = [5, 10, 5];
    const request = {
      "chunk_size": chunk_size,
      "wav_name": "h5",
      "is_speaking": true,
      "chunk_interval": 10,
      "itn": false,
      "mode": "2pass", // 默认使用2pass模式
    };
    
    this.speechSokt.send(JSON.stringify(request));
    console.log("WebSocket连接成功");
    this.stateHandle(0);
  }

  // 连接关闭回调
  onClose(e) {
    this.stateHandle(1);
  }

  // 收到消息回调
  onMessage(e) {
    this.msgHandle(e);
  }

  // 连接错误回调
  onError(e) {
    console.error('WebSocket连接错误:', e);
    this.stateHandle(2);
  }
}

// 语音识别服务类
export class SpeechRecognition {
  constructor(config = {}) {
    this.serverUrl = config.serverUrl || 'ws://127.0.0.1:10096/';
    this.onResult = config.onResult || (() => {});
    this.onStateChange = config.onStateChange || (() => {});
    
    this.isRecording = false;
    this.sampleBuf = new Int16Array();
    this.rec = null;
    this.wsconnecter = null;
    this.recText = '';
    
    // 初始化WebSocket连接器
    this.wsconnecter = new WebSocketConnectMethod({
      msgHandle: (e) => this.handleMessage(e),
      stateHandle: (state) => this.handleStateChange(state)
    });
  }

  // 处理WebSocket消息
  handleMessage(jsonMsg) {
    try {
      const data = JSON.parse(jsonMsg.data);
      const text = data.text || '';
      const isFinal = data.is_final || false;
      
      this.recText += text;
      this.onResult(this.recText, isFinal);
      
      if (isFinal) {
        this.stop();
      }
    } catch (error) {
      console.error('处理语音识别结果出错:', error);
    }
  }

  // 处理连接状态变化
  handleStateChange(connState) {
    if (connState === 0) { // 连接成功
      this.onStateChange('connected');
      // 连接成功后开始录音
      this.startRecording();
    } else if (connState === 1) { // 连接关闭
      this.onStateChange('disconnected');
    } else if (connState === 2) { // 连接错误
      this.onStateChange('error');
    }
  }

  // 初始化录音
  initRecorder() {
    // 确保全局有Recorder对象
    if (typeof Recorder !== 'undefined') {
      try {
        this.rec = new Recorder({
          type: 'pcm',
          bitRate: 16,
          sampleRate: 16000,
          onProcess: (buffer, powerLevel, bufferDuration, bufferSampleRate, newBufferIdx, asyncEnd) => {
            if (this.isRecording) {
              const data_48k = buffer[buffer.length - 1];
              const array_48k = [data_48k];
              const data_16k = Recorder.SampleData(array_48k, bufferSampleRate, 16000).data;
              
              this.sampleBuf = Int16Array.from([...this.sampleBuf, ...data_16k]);
              const chunk_size = 960; // 设定的块大小
              
              while (this.sampleBuf.length >= chunk_size) {
                const sendBuf = this.sampleBuf.slice(0, chunk_size);
                this.sampleBuf = this.sampleBuf.slice(chunk_size, this.sampleBuf.length);
                this.wsconnecter.wsSend(sendBuf);
              }
            }
          }
        });
        console.log("录音初始化成功");
        return true;
      } catch (error) {
        console.error("录音初始化出错:", error);
        return false;
      }
    } else {
      console.error("Recorder对象未定义，请确保recorder-core.js已正确加载");
      return false;
    }
  }

  // 开始录音
  startRecording() {
    if (!this.rec && !this.initRecorder()) {
      console.error('录音初始化失败');
      
      // 尝试延迟重试一次，可能是scripts还未完全加载
      setTimeout(() => {
        if (!this.rec && !this.initRecorder()) {
          console.error('重试录音初始化仍然失败');
          this.onStateChange('error');
        } else {
          this.startRecordingProcess();
        }
      }, 1000);
      return;
    }
    
    this.startRecordingProcess();
  }
  
  // 实际开始录音的过程
  startRecordingProcess() {
    this.rec.open(() => {
      this.rec.start();
      this.isRecording = true;
      this.onStateChange('recording');
    }, (error) => {
      console.error('打开录音失败:', error);
      this.onStateChange('error');
    });
  }

  // 启动语音识别
  start(customServerUrl) {
    this.recText = '';
    const url = customServerUrl || this.serverUrl;
    
    // 先尝试连接服务器
    const ret = this.wsconnecter.wsStart(url);
    if (ret === 1) {
      this.onStateChange('connecting');
      return true;
    } else {
      this.onStateChange('error');
      return false;
    }
  }

  // 停止语音识别
  stop() {
    // 发送结束指令
    if (this.sampleBuf.length > 0) {
      this.wsconnecter.wsSend(this.sampleBuf);
      this.sampleBuf = new Int16Array();
    }
    
    // 发送结束标志
    const request = {
      "chunk_size": [5, 10, 5],
      "wav_name": "h5",
      "is_speaking": false,
      "chunk_interval": 10,
      "mode": "2pass",
    };
    this.wsconnecter.wsSend(JSON.stringify(request));
    
    // 停止录音
    if (this.rec) {
      this.isRecording = false;
      this.rec.stop();
    }
    
    // 延迟关闭WebSocket，等待最终结果
    setTimeout(() => {
      this.wsconnecter.wsStop();
    }, 2000);
    
    this.onStateChange('stopped');
    return true;
  }
}

export default SpeechRecognition;
/**
 * Copyright FunASR (https://github.com/alibaba-damo-academy/FunASR). All Rights
 * Reserved. MIT License  (https://opensource.org/licenses/MIT)
 */

/**
 * WebSocket连接方法类
 * 用于与FunASR服务建立WebSocket连接并处理消息交换
 */
export class WebSocketConnector {
  constructor(config) {
    this.speechSocket = null;
    this.connKeeperID = null;
    
    // 设置回调函数
    this.msgHandle = config.msgHandle || (() => {});
    this.stateHandle = config.stateHandle || (() => {});
    
    // 服务器地址
    this.serverUrl = config.serverUrl || 'ws://127.0.0.1:10096/';
    
    // 配置参数
    this.mode = config.mode || '2pass'; // 支持 'offline', 'online', '2pass' 模式
    this.useITN = config.useITN !== undefined ? config.useITN : true; // 是否使用ITN(逆文本正则化)
    this.isFileMode = config.isFileMode || false; // 是否是文件模式
    this.fileExt = config.fileExt || 'pcm'; // 文件扩展名
    this.fileSampleRate = config.fileSampleRate || 16000; // 采样率
    this.hotwords = config.hotwords || null; // 热词
    
    // 连接状态
    this.isConnected = false;
  }

  /**
   * 启动WebSocket连接
   * @returns {number} 1-成功启动连接，0-启动失败
   */
  wsStart() {
    if (!this.serverUrl.match(/wss?:\S*/)) {
      console.error('WebSocket地址格式错误');
      return 0;
    }

    if ('WebSocket' in window) {
      try {
        console.log('开始连接WebSocket:', this.serverUrl);
        this.speechSocket = new WebSocket(this.serverUrl);
        this.speechSocket.onopen = (e) => this.onOpen(e);
        this.speechSocket.onclose = (e) => this.onClose(e);
        this.speechSocket.onmessage = (e) => this.onMessage(e);
        this.speechSocket.onerror = (e) => this.onError(e);
        return 1;
      } catch (error) {
        console.error('创建WebSocket对象时出错:', error);
        return 0;
      }
    } else {
      console.error('当前浏览器不支持WebSocket');
      return 0;
    }
  }

  /**
   * 停止WebSocket连接
   */
  wsStop() {
    if (this.speechSocket) {
      console.log('关闭WebSocket连接');
      this.speechSocket.close();
      this.isConnected = false;
    }
  }

  /**
   * 发送数据
   * @param {any} data 要发送的数据
   */
  wsSend(data) {
    if (!this.speechSocket) return;
    
    if (this.speechSocket.readyState === 1) { // 0:CONNECTING, 1:OPEN, 2:CLOSING, 3:CLOSED
      try {
        this.speechSocket.send(data);
      } catch (error) {
        console.error('发送数据失败:', error);
      }
    } else {
      console.warn('WebSocket未连接，无法发送数据');
    }
  }

  /**
   * 连接打开回调
   * @param {Event} e WebSocket事件
   */
  onOpen(e) {
    // 发送初始化配置
    const chunk_size = [5, 10, 5]; // 默认chunk_size配置
    const request = {
      "chunk_size": chunk_size,
      "wav_name": "h5",
      "is_speaking": true,
      "chunk_interval": 10,
      "itn": this.useITN,
      "mode": this.mode, // 使用配置的模式
    };
    
    // 如果是文件模式，添加文件相关参数
    if (this.isFileMode) {
      request.wav_format = this.fileExt;
      if (this.fileExt === "wav") {
        request.wav_format = "PCM";
        request.audio_fs = this.fileSampleRate;
      }
    }
    
    // 如果有热词，添加热词参数
    if (this.hotwords) {
      request.hotwords = this.hotwords;
    }
    
    console.log("WebSocket连接成功，发送初始化配置:", JSON.stringify(request));
    this.speechSocket.send(JSON.stringify(request));
    
    this.isConnected = true;
    this.stateHandle(0); // 0表示连接成功
  }

  /**
   * 连接关闭回调
   * @param {Event} e WebSocket事件
   */
  onClose(e) {
    console.log("WebSocket连接已关闭", e);
    this.isConnected = false;
    this.stateHandle(1); // 1表示连接关闭
  }

  /**
   * 收到消息回调
   * @param {MessageEvent} e WebSocket消息事件
   */
  onMessage(e) {
    this.msgHandle(e);
  }

  /**
   * 连接错误回调
   * @param {Event} e WebSocket错误事件
   */
  onError(e) {
    console.error('WebSocket连接错误:', e);
    this.isConnected = false;
    this.stateHandle(2); // 2表示连接错误
  }
  
  /**
   * 检查连接状态
   * @returns {boolean} 当前连接状态
   */
  isConnectedState() {
    return this.isConnected && this.speechSocket && this.speechSocket.readyState === 1;
  }
} 
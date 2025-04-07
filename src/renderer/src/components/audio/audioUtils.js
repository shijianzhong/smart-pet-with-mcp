/**
 * 音频处理工具函数
 */

/**
 * 将音频数据编码为WAV格式
 * @param {AudioBuffer} audioBuffer - 音频缓冲区
 * @param {Number} outSampleRate - 输出采样率
 * @returns {ArrayBuffer} WAV格式的数据
 */
export function encodeWAV(audioBuffer, outSampleRate = 16000) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  
  // 获取音频数据
  const samples = new Float32Array(length * numChannels);
  let offset = 0;
  
  // 如果是多声道，将多个声道的数据交错存储
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      samples[offset++] = channelData[i];
    }
  }
  
  // 重采样（如果需要）
  let newSamples = samples;
  if (sampleRate !== outSampleRate) {
    newSamples = resample(samples, sampleRate, outSampleRate, numChannels);
  }
  
  // 转换为Int16格式
  const dataLength = newSamples.length;
  const buffer = new ArrayBuffer(44 + dataLength * 2);
  const view = new DataView(buffer);
  
  // 写入WAV头
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength * 2, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM格式
  view.setUint16(22, numChannels, true);
  view.setUint32(24, outSampleRate, true);
  view.setUint32(28, outSampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength * 2, true);
  
  // 写入PCM数据
  floatTo16BitPCM(view, 44, newSamples);
  
  return buffer;
}

/**
 * 从Blob创建AudioBuffer
 * @param {Blob} blob - 音频Blob
 * @param {AudioContext} audioContext - 音频上下文
 * @returns {Promise<AudioBuffer>} 音频缓冲区
 */
export async function blobToAudioBuffer(blob, audioContext) {
  const arrayBuffer = await blob.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * 重采样音频数据
 * @param {Float32Array} samples - 原始音频数据
 * @param {Number} originalSampleRate - 原始采样率
 * @param {Number} targetSampleRate - 目标采样率
 * @param {Number} numChannels - 声道数
 * @returns {Float32Array} 重采样后的数据
 */
function resample(samples, originalSampleRate, targetSampleRate, numChannels) {
  if (originalSampleRate === targetSampleRate) {
    return samples;
  }
  
  const ratio = originalSampleRate / targetSampleRate;
  const newLength = Math.round(samples.length / ratio);
  const result = new Float32Array(newLength);
  
  // 简单的线性插值
  for (let i = 0; i < newLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;
    
    if (index + 1 < samples.length) {
      result[i] = samples[index] * (1 - fraction) + samples[index + 1] * fraction;
    } else {
      result[i] = samples[index];
    }
  }
  
  return result;
}

/**
 * 将Float32Array转换为16位PCM
 * @param {DataView} output - 输出数据视图
 * @param {Number} offset - 偏移量
 * @param {Float32Array} input - 输入数据
 */
function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

/**
 * 将字符串写入DataView
 * @param {DataView} view - 数据视图
 * @param {Number} offset - 偏移量
 * @param {String} string - 字符串
 */
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * 根据音量数据获取分贝值
 * @param {Uint8Array} frequencyData - 频率数据
 * @returns {Number} 分贝值 (0-100)
 */
export function getDecibels(frequencyData) {
  let sum = 0;
  for (let i = 0; i < frequencyData.length; i++) {
    sum += frequencyData[i];
  }
  const average = sum / frequencyData.length;
  // 将0-255的值映射到0-100的分贝值
  return (average / 255) * 100;
}

/**
 * 创建音频可视化器
 * @param {HTMLCanvasElement} canvas - Canvas元素
 * @param {AnalyserNode} analyser - 分析器节点
 * @param {Object} options - 选项
 * @returns {Function} 停止可视化的函数
 */
export function createVisualizer(canvas, analyser, options = {}) {
  const ctx = canvas.getContext('2d');
  let animationFrame;
  let running = true;
  
  const {
    barWidth = 5,
    barGap = 2,
    barColor = '#4361ee',
    backgroundColor = 'transparent'
  } = options;
  
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  
  function draw() {
    if (!running) return;
    
    animationFrame = requestAnimationFrame(draw);
    
    analyser.getByteFrequencyData(dataArray);
    
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    if (backgroundColor !== 'transparent') {
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);
    }
    
    const bars = Math.min(Math.floor(width / (barWidth + barGap)), bufferLength);
    const step = Math.floor(bufferLength / bars);
    
    ctx.fillStyle = barColor;
    
    for (let i = 0; i < bars; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        const index = i * step + j;
        if (index < bufferLength) {
          sum += dataArray[index];
        }
      }
      const average = sum / step;
      const barHeight = (average / 255) * height;
      const x = i * (barWidth + barGap);
      const y = height - barHeight;
      
      ctx.fillRect(x, y, barWidth, barHeight);
    }
  }
  
  draw();
  
  return () => {
    running = false;
    cancelAnimationFrame(animationFrame);
  };
}
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// 大模型配置
const llmBaseUrl = ref('')
const llmModel = ref('')
const llmSecretKey = ref('')

// 语音服务配置
const funasrAddress = ref('')

// 状态信息
const statusMessage = ref('准备就绪')
const isSaving = ref(false)

// 初始化时加载配置
onMounted(async () => {
  try {
    statusMessage.value = '加载配置中...'
    
    // 获取大模型配置
    const llmSettings = await window.api.getBasicSettings('llm')
    if (llmSettings && llmSettings.length > 0) {
      llmSettings.forEach(setting => {
        if (setting.name === 'baseUrl') llmBaseUrl.value = setting.value || ''
        if (setting.name === 'model') llmModel.value = setting.value || ''
        if (setting.name === 'secretKey') llmSecretKey.value = setting.value || ''
      })
    }
    
    // 获取语音服务配置
    const asrSettings = await window.api.getBasicSettings('asr')
    if (asrSettings && asrSettings.length > 0) {
      asrSettings.forEach(setting => {
        if (setting.name === 'funasrAddress') funasrAddress.value = setting.value || ''
      })
    }
    
    statusMessage.value = '配置已加载'
  } catch (error) {
    console.error('加载配置失败:', error)
    statusMessage.value = '加载配置失败'
  }
  
  // 添加全局键盘快捷键监听
  document.addEventListener('keydown', handleKeyDown)
})

// 组件卸载时移除事件监听
onUnmounted(() => {
  // 移除全局键盘快捷键监听
  document.removeEventListener('keydown', handleKeyDown)
})

// 处理键盘快捷键
const handleKeyDown = async (event) => {
  // 检测常见的粘贴快捷键 (Ctrl+V 或 Command+V)
  if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
    console.log('检测到粘贴快捷键');
    
    // 获取当前焦点元素
    const activeElement = document.activeElement;
    if (activeElement && 
        (activeElement.tagName === 'INPUT' || 
         activeElement.tagName === 'TEXTAREA')) {
      
      // 尝试获取剪贴板文本
      try {
        let clipboardText = '';
        
        // 首先尝试直接API
        try {
          clipboardText = await window.api.getClipboardText();
        } catch (err) {
          // 如果失败，尝试IPC方式
          clipboardText = await window.api.readClipboardText();
        }
        
        if (clipboardText) {
          console.log('从剪贴板获取文本:', clipboardText);
          
          // 根据输入框的id或其他属性更新对应的数据模型
          const inputId = activeElement.id;
          const inputName = activeElement.name;
          
          if (inputId === 'llm-base-url' || inputName === 'llmBaseUrl') {
            llmBaseUrl.value = clipboardText;
          } else if (inputId === 'llm-model' || inputName === 'llmModel') {
            llmModel.value = clipboardText;
          } else if (inputId === 'llm-secret-key' || inputName === 'llmSecretKey') {
            llmSecretKey.value = clipboardText;
          } else if (inputId === 'funasr-address' || inputName === 'funasrAddress') {
            funasrAddress.value = clipboardText;
          } else {
            // 尝试直接插入到输入框
            const start = activeElement.selectionStart || 0;
            const end = activeElement.selectionEnd || 0;
            const value = activeElement.value || '';
            
            // 组合新值
            const newValue = value.substring(0, start) + 
                           clipboardText + 
                           value.substring(end);
            
            // 更新输入框值
            activeElement.value = newValue;
            
            // 触发input事件来更新v-model
            activeElement.dispatchEvent(new Event('input', { bubbles: true }));
            
            // 更新光标位置
            activeElement.selectionStart = activeElement.selectionEnd = 
              start + clipboardText.length;
          }
        }
      } catch (err) {
        console.error('处理粘贴快捷键时出错:', err);
      }
    }
  }
}

// 保存所有配置
const saveAllSettings = async () => {
  try {
    isSaving.value = true
    statusMessage.value = '保存配置中...'
    
    const settings = [
      { name: 'baseUrl', value: llmBaseUrl.value, category: 'llm' },
      { name: 'model', value: llmModel.value, category: 'llm' },
      { name: 'secretKey', value: llmSecretKey.value, category: 'llm' },
      { name: 'funasrAddress', value: funasrAddress.value, category: 'asr' }
    ]
    
    const result = await window.api.batchSaveSettings(settings)
    
    if (result) {
      statusMessage.value = '配置已保存'
    } else {
      statusMessage.value = '保存配置失败'
    }
  } catch (error) {
    console.error('保存配置失败:', error)
    statusMessage.value = '保存配置失败: ' + error.message
  } finally {
    isSaving.value = false
  }
}

// 关闭窗口
const closeWindow = () => {
  window.api.closeBasicSettingsDialog()
}

// 处理复制事件
const handleCopy = async (event, text) => {
  try {
    await window.api.setClipboardText(text)
  } catch (err) {
    console.error('复制到剪贴板失败:', err)
  }
}

// 处理剪切事件
const handleCut = async (event, field) => {
  try {
    const text = event.target.value
    await window.api.setClipboardText(text)
    
    // 清空对应字段
    switch (field) {
      case 'llmBaseUrl':
        llmBaseUrl.value = ''
        break
      case 'llmModel':
        llmModel.value = ''
        break
      case 'llmSecretKey':
        llmSecretKey.value = ''
        break
      case 'funasrAddress':
        funasrAddress.value = ''
        break
    }
  } catch (err) {
    console.error('剪切到剪贴板失败:', err)
  }
}

// 普通粘贴处理函数
const normalPaste = (event, field) => {
  // 不阻止默认粘贴
  console.log(`粘贴到 ${field}`)
}

// 备用粘贴处理方法
const handlePaste = async (event, field) => {
  console.log(`尝试粘贴到 ${field}`)
  // 阻止默认粘贴行为，我们将手动处理
  event.preventDefault();

  let pastedText = '';
  
  // 首先尝试从剪贴板事件获取文本
  if (event.clipboardData && event.clipboardData.getData) {
    pastedText = event.clipboardData.getData('text/plain');
  }
  
  // 如果事件中没有数据，尝试通过API获取
  if (!pastedText) {
    try {
      // 尝试读取系统剪贴板
      pastedText = await window.api.getClipboardText();
    } catch (err) {
      console.error('读取剪贴板失败:', err);
      
      // 尝试使用IPC通道读取
      try {
        pastedText = await window.api.readClipboardText();
      } catch (err2) {
        console.error('通过IPC读取剪贴板失败:', err2);
      }
    }
  }
  
  // 确保在控制台打印粘贴的内容（用于调试）
  console.log('粘贴的内容:', pastedText);
  
  // 如果成功获取到文本，设置到对应字段
  if (pastedText) {
    switch (field) {
      case 'llmBaseUrl':
        llmBaseUrl.value = pastedText;
        break;
      case 'llmModel':
        llmModel.value = pastedText;
        break;
      case 'llmSecretKey':
        llmSecretKey.value = pastedText;
        break;
      case 'funasrAddress':
        funasrAddress.value = pastedText;
        break;
    }
  }
}
</script>

<template>
  <div class="basic-settings-container">
    <div class="basic-settings">
      <div class="header">
        <h2>基础配置</h2>
        <button class="close-btn" @click="closeWindow">×</button>
      </div>
      
      <div class="content-area">
        <!-- 大模型配置 -->
        <div class="settings-section">
          <h3>大模型配置</h3>
          
          <div class="form-group">
            <label class="form-label">API地址 (BaseURL)</label>
            <input 
              type="text" 
              id="llm-base-url"
              name="llmBaseUrl"
              v-model="llmBaseUrl" 
              placeholder="请输入API地址，例如：https://api.example.com/v1" 
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">模型名称 (Model)</label>
            <input 
              type="text" 
              id="llm-model"
              name="llmModel"
              v-model="llmModel" 
              placeholder="请输入模型名称" 
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">密钥 (API Key)</label>
            <input 
              type="password" 
              id="llm-secret-key"
              name="llmSecretKey"
              v-model="llmSecretKey" 
              placeholder="请输入API密钥" 
            />
          </div>
        </div>
        
        <!-- 语音服务配置 -->
        <div class="settings-section">
          <h3>语音服务配置</h3>
          
          <div class="form-group">
            <label class="form-label">FunASR服务地址</label>
            <input 
              type="text" 
              id="funasr-address"
              name="funasrAddress"
              v-model="funasrAddress" 
              placeholder="请输入FunASR服务地址，例如：http://localhost:10095" 
            />
          </div>
        </div>
        
        <!-- 状态栏和操作按钮 -->
        <div class="status-bar">
          <span>状态: {{ statusMessage }}</span>
        </div>
        
        <div class="actions">
          <button 
            @click="saveAllSettings" 
            class="save-btn" 
            :disabled="isSaving"
          >
            {{ isSaving ? '保存中...' : '保存配置' }}
          </button>
          <button @click="closeWindow" class="cancel-btn">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.basic-settings-container {
  width: 100%;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  overflow: hidden;
  padding: 20px;
  box-sizing: border-box;
}

.basic-settings {
  width: 100%;
  max-width: 580px;
  max-height: 500px;
  margin: 0 auto;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eaeaea;
}

.header h2 {
  margin: 0;
  color: #42b883;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.close-btn:hover {
  background-color: #f0f0f0;
  color: #333;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(500px - 160px); /* 减去header高度 */
}

.settings-section {
  background-color: #f9f9f9;
  border-radius: 6px;
  border: 1px solid #eaeaea;
  padding: 16px;
}

h3 {
  margin-top: 0;
  margin-bottom: 16px;
  color: #42b883;
  font-size: 16px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group:last-child {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-weight: bold;
  margin-bottom: 6px;
  color: #333333;
  font-size: 14px;
}

input[type="text"],
input[type="password"] {
  width: 100%;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
  box-sizing: border-box;
  font-size: 14px;
}

input[type="text"]:focus,
input[type="password"]:focus {
  border-color: #42b883;
  outline: none;
  box-shadow: 0 0 0 2px rgba(66, 184, 131, 0.2);
}

.status-bar {
  margin: 8px 0;
  padding: 8px;
  background-color: #f8f8f8;
  border-radius: 4px;
  color: #333;
  font-size: 14px;
}

.actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 8px;
}

button {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.save-btn {
  background-color: #42b883;
  color: white;
}

.save-btn:hover:not(:disabled) {
  background-color: #369e6b;
}

.cancel-btn {
  background-color: #7f8c8d;
  color: white;
}

.cancel-btn:hover:not(:disabled) {
  background-color: #636e72;
}

/* 自定义滚动条 */
.content-area::-webkit-scrollbar {
  width: 8px;
}

.content-area::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 4px;
}

.content-area::-webkit-scrollbar-thumb {
  background: #42b883;
  border-radius: 4px;
}

.content-area::-webkit-scrollbar-thumb:hover {
  background: #369e6b;
}
</style> 
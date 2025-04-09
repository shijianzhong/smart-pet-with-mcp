<script setup>
import { ref, onMounted } from 'vue'

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
})

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

// 处理粘贴事件
const handlePaste = async (event, field) => {
  event.preventDefault()
  
  let pastedText = ''
  
  if (event.clipboardData && event.clipboardData.getData) {
    pastedText = event.clipboardData.getData('text/plain')
  }
  
  if (!pastedText) {
    try {
      pastedText = await window.api.getClipboardText()
    } catch (err) {
      console.error('读取剪贴板失败:', err)
      try {
        pastedText = await window.api.readClipboardText()
      } catch (err2) {
        console.error('通过IPC读取剪贴板失败:', err2)
      }
    }
  }
  
  if (pastedText) {
    switch (field) {
      case 'llmBaseUrl':
        llmBaseUrl.value = pastedText
        break
      case 'llmModel':
        llmModel.value = pastedText
        break
      case 'llmSecretKey':
        llmSecretKey.value = pastedText
        break
      case 'funasrAddress':
        funasrAddress.value = pastedText
        break
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
              v-model="llmBaseUrl" 
              placeholder="请输入API地址，例如：https://api.example.com/v1" 
              @paste="handlePaste($event, 'llmBaseUrl')"
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">模型名称 (Model)</label>
            <input 
              type="text" 
              v-model="llmModel" 
              placeholder="请输入模型名称" 
              @paste="handlePaste($event, 'llmModel')"
            />
          </div>
          
          <div class="form-group">
            <label class="form-label">密钥 (API Key)</label>
            <input 
              type="password" 
              v-model="llmSecretKey" 
              placeholder="请输入API密钥" 
              @paste="handlePaste($event, 'llmSecretKey')"
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
              v-model="funasrAddress" 
              placeholder="请输入FunASR服务地址，例如：http://localhost:10095" 
              @paste="handlePaste($event, 'funasrAddress')"
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
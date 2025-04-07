<template>
  <div class="model-dialog-overlay" v-if="show" @click.self="closeDialog">
    <div class="model-dialog">
      <div class="dialog-header">
        <div>
          <h3>模型换装</h3>
          <small>单击选中模型，双击确认选择</small>
        </div>
        <button class="close-btn" @click="closeDialog">×</button>
      </div>
      <div class="dialog-content">
        <div class="models-grid">
          <div 
            v-for="(model, index) in modelList" 
            :key="index" 
            class="model-item"
            :class="{ 'selected': selectedModel === model.path }"
            @click="selectModel(model.path)"
            @dblclick="confirmModelChange(model.path)"
          >
            <img :src="model.thumbnail" :alt="model.name">
            <div class="model-name">{{ model.name }}</div>
          </div>
        </div>
      </div>
      <div class="dialog-footer">
        <button class="cancel-btn" @click="closeDialog">取消</button>
        <button class="confirm-btn" @click="confirmChange">确认换装</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, defineProps, defineEmits, watch } from 'vue';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  // 添加模型列表属性，从父组件传入
  modelList: {
    type: Array,
    default: () => []
  },
  currentModelPath: {
    type: String,
    default: ''
  }
});

const emit = defineEmits(['close', 'changeModel']);

// 初始化选中的模型
const selectedModel = ref(props.currentModelPath || '');

// 监听当前模型路径变化
watch(() => props.currentModelPath, (newPath) => {
  if (newPath) {
    selectedModel.value = newPath;
  }
});

// 选择模型
const selectModel = (path) => {
  console.log('点击选择模型:', path);
  selectedModel.value = path;
};

// 关闭对话框
const closeDialog = () => {
  emit('close');
};

// 确认换装
const confirmChange = () => {
  if (selectedModel.value) {
    emit('changeModel', selectedModel.value);
    closeDialog();
  } else {
    alert('请选择一个模型');
  }
};

// 双击确认换装
const confirmModelChange = (path) => {
  console.log('双击选择模型:', path);
  emit('changeModel', path);
  closeDialog();
};
</script>

<style scoped>
.model-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999; /* 非常高的z-index，确保在最顶层 */
  -webkit-app-region: no-drag;
  app-region: no-drag;
  pointer-events: auto; /* 确保对话框可以接收鼠标事件 */
}

.model-dialog {
  width: 80%;
  max-width: 600px;
  height: 80vh; /* 固定高度为视口的80% */
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  position: relative;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.dialog-header {
  padding: 15px 20px;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0; /* 防止头部压缩 */
}

.dialog-header h3 {
  margin: 0;
  color: #333;
}

.dialog-header small {
  display: block;
  margin-top: 4px;
  color: #666;
  font-size: 12px;
}

.close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
  padding: 0;
  margin: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.close-btn:hover {
  background-color: #f0f0f0;
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 15px;
}

.model-item {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  border: 2px solid transparent;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.model-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
}

.model-item.selected {
  border-color: #4a90e2;
  background-color: rgba(74, 144, 226, 0.1);
  position: relative;
}

.model-item.selected::after {
  content: '双击确认';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: rgba(74, 144, 226, 0.8);
  color: white;
  font-size: 10px;
  padding: 2px 0;
  text-align: center;
}

.model-item img {
  width: 100%;
  height: 90px;
  object-fit: cover;
  border-radius: 5px;
}

.model-name {
  margin-top: 5px;
  font-size: 12px;
  text-align: center;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  padding: 0 5px;
}

.dialog-footer {
  padding: 15px;
  display: flex;
  justify-content: center; /* 居中显示按钮 */
  gap: 15px;
  border-top: 1px solid #eee;
  background-color: white;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
  z-index: 10000; /* 超高的z-index确保按钮在最顶层 */
  margin-top: 10px; /* 增加与内容区域的间距 */
}

.cancel-btn, .confirm-btn {
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  border: none;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.cancel-btn {
  background-color: #f0f0f0;
  color: #333;
}

.confirm-btn {
  background-color: #4a90e2;
  color: white;
}

.cancel-btn:hover {
  background-color: #e0e0e0;
}

.confirm-btn:hover {
  background-color: #3a80d2;
}

/* 自定义滚动条样式 */
.dialog-content::-webkit-scrollbar {
  width: 6px;
}

.dialog-content::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.dialog-content::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.dialog-content::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 黑暗模式适配 */
@media (prefers-color-scheme: dark) {
  .model-dialog {
    background-color: #222;
  }
  
  .dialog-header {
    border-bottom: 1px solid #333;
  }
  
  .dialog-header h3 {
    color: #f0f0f0;
  }
  
  .dialog-header small {
    color: #aaa;
  }
  
  .close-btn {
    color: #aaa;
  }
  
  .close-btn:hover {
    background-color: #333;
  }
  
  .model-name {
    color: #ddd;
  }
  
  .dialog-footer {
    background-color: #222;
    border-top: 1px solid #333;
  }
  
  .cancel-btn {
    background-color: #333;
    color: #ddd;
  }
  
  .cancel-btn:hover {
    background-color: #444;
  }
}

/* 响应式设计 */
@media (max-width: 480px) {
  .model-dialog {
    width: 95%;
    height: 90vh;
  }
  
  .models-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 10px;
  }
  
  .model-item img {
    height: 70px;
  }
  
  .model-name {
    font-size: 11px;
  }
  
  .dialog-header h3 {
    font-size: 16px;
  }
  
  .dialog-content {
    padding: 10px;
  }
  
  .dialog-footer {
    padding: 10px;
  }
  
  .cancel-btn, .confirm-btn {
    padding: 6px 12px;
    font-size: 13px;
  }
}
</style>
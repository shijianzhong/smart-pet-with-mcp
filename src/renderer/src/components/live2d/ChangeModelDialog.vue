<template>
  <div class="model-dialog-overlay" v-if="show" @click.self="closeDialog">
    <div class="model-dialog">
      <div class="dialog-header">
        <h3>模型换装</h3>
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
import { ref, defineProps, defineEmits } from 'vue';

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['close', 'changeModel']);

// 示例模型列表，实际使用时可以从外部传入或从配置文件读取
const modelList = ref([
  {
    name: '拉菲',
    path: 'models/lafei/lafei.model3.json',
    thumbnail: 'models/lafei/thumbnail.png'
  },
  {
    name: '爱尔德里奇5',
    path: 'models/aierdeliqi_5/aierdeliqi_5.model3.json',
    thumbnail: 'models/aierdeliqi_5/thumbnail.png'
  },
  {
    name: '爱尔德里奇4',
    path: 'models/aierdeliqi_4/aierdeliqi_4.model3.json',
    thumbnail: 'models/aierdeliqi_4/thumbnail.png'
  },
  {
    name: '爱丹2',
    path: 'models/aidang_2/aidang_2.model3.json',
    thumbnail: 'models/aidang_2/thumbnail.png'
  },
  // 下面添加更多测试数据以验证滚动效果
  {
    name: '模型5',
    path: 'models/lafei/lafei.model3.json',
    thumbnail: 'models/lafei/thumbnail.png'
  },
  {
    name: '模型6',
    path: 'models/aierdeliqi_5/aierdeliqi_5.model3.json',
    thumbnail: 'models/aierdeliqi_5/thumbnail.png'
  },
  {
    name: '模型7',
    path: 'models/aierdeliqi_4/aierdeliqi_4.model3.json',
    thumbnail: 'models/aierdeliqi_4/thumbnail.png'
  },
  {
    name: '模型8',
    path: 'models/aidang_2/aidang_2.model3.json',
    thumbnail: 'models/aidang_2/thumbnail.png'
  }
]);

const selectedModel = ref('');

const selectModel = (path) => {
  selectedModel.value = path;
};

const closeDialog = () => {
  emit('close');
};

const confirmChange = () => {
  if (selectedModel.value) {
    emit('changeModel', selectedModel.value);
    closeDialog();
  }
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
  z-index: 1000;
  -webkit-app-region: no-drag;
  app-region: no-drag;
}

.model-dialog {
  width: 80%;
  max-width: 600px;
  max-height: 80vh; /* 限制最大高度为视口的80% */
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  display: flex;
  flex-direction: column; /* 确保弹窗内容垂直排列 */
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  border-bottom: 1px solid #eee;
}

.dialog-header h3 {
  margin: 0;
  color: #333;
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
}

.close-btn:hover {
  background-color: #f0f0f0;
}

.dialog-content {
  padding: 15px;
  overflow-y: auto;
  flex: 1;
  max-height: 60vh;
}

.models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 10px;
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
}

.model-item:hover {
  transform: translateY(-3px);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1);
}

.model-item.selected {
  border-color: #4a90e2;
  background-color: rgba(74, 144, 226, 0.1);
}

.model-item img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 5px;
}

.model-name {
  margin-top: 3px;
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
  padding: 12px 15px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #eee;
  position: sticky;
  bottom: 0;
  background-color: white;
  z-index: 10;
}

.cancel-btn, .confirm-btn {
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  border: none;
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
  
  .dialog-content::-webkit-scrollbar-track {
    background: #333;
  }
  
  .dialog-content::-webkit-scrollbar-thumb {
    background: #666;
  }
  
  .dialog-content::-webkit-scrollbar-thumb:hover {
    background: #888;
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
    max-height: 90vh;
  }
  
  .models-grid {
    grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
    gap: 8px;
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
}
</style> 
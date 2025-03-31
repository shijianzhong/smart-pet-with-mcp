<script setup>
// 不需要导入Versions组件，因为子路由组件中已经导入了
import { onMounted, onBeforeUnmount, ref } from 'vue';

// 记录鼠标状态
const isDragging = ref(false);
const mouseStartY = ref(0);

// 阻止双击行为
const preventDoubleClick = (e) => {
  // 阻止双击默认行为
  if (e.detail === 2) { // 检查是否为双击
    e.preventDefault();
  }
};

// 监听鼠标按下
const handleMouseDown = (e) => {
  preventDoubleClick(e);
  
  // 如果是在拖拽区域按下鼠标
  if (e.target.closest('.title-bar') || e.target.closest('.canvasWrap')) {
    isDragging.value = true;
    mouseStartY.value = e.clientY;
  }
};

// 监听鼠标移动
const handleMouseMove = (e) => {
  if (isDragging.value) {
    // 检测是否接近屏幕上边缘
    if (e.clientY < 10) {
      // 阻止继续向上拖拽
      isDragging.value = false;
    }
  }
};

// 监听鼠标松开
const handleMouseUp = () => {
  isDragging.value = false;
};

onMounted(() => {
  // 添加鼠标事件监听
  document.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
});

onBeforeUnmount(() => {
  // 移除事件监听
  document.removeEventListener('mousedown', handleMouseDown);
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
});
</script>

<template>
  <div class="app-container">
    <div class="title-bar"></div>
    <router-view />
  </div>
</template>

<style>
body {
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
  background-color: transparent; /* 透明背景 */
  overflow: hidden; /* 防止滚动条出现 */
  /* 禁用双击选中文本 */
  -webkit-user-select: none;
  user-select: none;
}

html {
  background-color: transparent; /* 确保html也是透明的 */
}

.app-container {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  background-color: transparent; /* 确保容器也是透明的 */
  /* 禁用双击事件 */
  -webkit-user-select: none;
  user-select: none;
}

.title-bar {
  height: 22px; /* 标准标题栏高度 */
  width: calc(100% - 200px); /* 减少宽度，避免干扰菜单 */
  -webkit-app-region: drag; /* 允许拖动 */
  app-region: drag;
  position: fixed;
  top: 0;
  left: 100px; /* 居中放置 */
  z-index: 9999;
  background-color: transparent;
  pointer-events: auto; /* 确保可点击 */
}

/* 全局颜色变量 */
:root {
  --primary-color: #42b883;
  --primary-color-hover: #369e6b;
  --error-color: #e74c3c;
  --error-color-hover: #c0392b;
  --text-color: #333;
  --background-light: #f8f8f8;
  --border-color: #ccc;
}
</style>

<script setup>
// 不需要导入Versions组件，因为子路由组件中已经导入了
</script>

<template>
  <div class="app-container">
    <router-view />
  </div>
</template>

<style>
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
}

.app-container {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
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

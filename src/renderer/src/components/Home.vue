<script setup>
import Versions from './Versions.vue'

const ipcHandle = () => window.electron.ipcRenderer.send('ping')
</script>

<template>
  <div class="home-container">
    <img alt="logo" class="logo" src="../assets/electron.svg" />
    <div class="creator">Powered by electron-vite</div>
    <div class="text">
      智能宠物伴侣
      <span class="vue">MCP</span>
    </div>
    <p class="tip">您可以通过菜单 "设置 > MCP" 配置MCP服务器</p>
    <div class="actions">
      <div class="action">
        <a href="https://electron-vite.org/" target="_blank" rel="noreferrer">文档</a>
      </div>
      <div class="action">
        <a @click="ipcHandle">发送IPC测试</a>
      </div>
    </div>
    <Versions />
  </div>
</template>

<style scoped>
.home-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 20px;
}
.logo {
  width: 150px;
  margin: 0 auto;
}
.creator {
  font-size: 14px;
  color: #666;
  margin-top: 10px;
}
.text {
  font-size: 24px;
  font-weight: bold;
  margin: 20px 0;
}
.vue {
  color: #42b883;
}
.tip {
  background-color: #f8f8f8;
  padding: 8px 16px;
  border-radius: 4px;
  border-left: 4px solid #42b883;
}
.actions {
  display: flex;
  gap: 20px;
  margin-top: 20px;
}
.action a {
  display: inline-block;
  padding: 8px 16px;
  background-color: #42b883;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  cursor: pointer;
}
.action a:hover {
  background-color: #369e6b;
}
</style> 
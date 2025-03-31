import { createRouter, createWebHashHistory } from 'vue-router'
import Home from '../components/Home.vue'
import MCPSettings from '../components/MCPSettings.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  },
  {
    path: '/mcp-settings',
    name: 'MCPSettings',
    component: MCPSettings
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router

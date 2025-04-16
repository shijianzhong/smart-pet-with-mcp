<template>
  <div class="chat-interface">
    <div class="conversation-selector">
      <el-select v-model="currentConversationId" placeholder="选择对话" @change="onConversationChange">
        <el-option 
          v-for="conv in conversations" 
          :key="conv.id" 
          :label="conv.name" 
          :value="conv.id" 
        />
        <el-button @click="createNewConversation">新建对话</el-button>
      </el-select>
      
      <el-button @click="showServerManager" :disabled="!currentConversationId">
        管理服务器
      </el-button>
    </div>
    
    <!-- 对话区域 -->
    <div class="chat-messages">
      <div v-for="(message, index) in chatMessages" :key="index" :class="['message', message.role]">
        <div class="message-content" v-html="formatMessage(message.content)"></div>
      </div>
    </div>
    
    <!-- 输入区域 -->
    <div class="chat-input">
      <el-input 
        v-model="userInput" 
        type="textarea" 
        :rows="3" 
        placeholder="输入消息..."
        @keyup.ctrl.enter="sendMessage"
      ></el-input>
      <el-button type="primary" @click="sendMessage" :disabled="isProcessing">
        发送
      </el-button>
    </div>
    
    <!-- 服务器管理对话框 -->
    <el-dialog title="管理MCP服务器" v-model="showServerManagerDialog" width="80%">
      <div class="server-manager">
        <h3>当前对话已连接服务器</h3>
        <el-table :data="conversationServers">
          <el-table-column prop="name" label="服务器名称" />
          <el-table-column prop="type" label="类型" />
          <el-table-column prop="status" label="状态" />
          <el-table-column label="操作">
            <template #default="scope">
              <el-button 
                type="danger" 
                size="small" 
                @click="removeServerFromConversation(scope.row.id)"
              >
                移除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        
        <h3>所有可用服务器</h3>
        <el-table :data="availableServers">
          <el-table-column prop="name" label="服务器名称" />
          <el-table-column prop="type" label="类型" />
          <el-table-column prop="status" label="状态" />
          <el-table-column label="操作">
            <template #default="scope">
              <el-button 
                type="primary" 
                size="small" 
                @click="addServerToConversation(scope.row.id)"
                :disabled="isServerInConversation(scope.row.id)"
              >
                添加到对话
              </el-button>
              <el-button 
                type="success" 
                size="small" 
                @click="toggleServer(scope.row)"
                :disabled="scope.row.isRunning && !scope.row.isConnected"
              >
                {{ scope.row.isRunning ? '停止' : '启动' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script>
export default {
  data() {
    return {
      conversations: [],
      currentConversationId: null,
      userInput: '',
      isProcessing: false,
      showServerManagerDialog: false,
      conversationServers: [],
      availableServers: [],
      chatMessages: []
    };
  },
  
  async created() {
    // 加载对话列表
    await this.loadConversations();
    
    // 如果有对话，默认选择第一个
    if (this.conversations.length > 0) {
      this.currentConversationId = this.conversations[0].id;
      await this.loadConversationServers();
      await this.loadChatHistory();
    } else {
      // 如果没有对话，创建一个新对话
      await this.createNewConversation();
    }
  },
  
  methods: {
    async loadConversations() {
      try {
        this.conversations = await window.electronAPI.getConversations();
      } catch (error) {
        console.error('加载对话列表失败:', error);
        this.$message.error('加载对话列表失败');
      }
    },
    
    async createNewConversation() {
      try {
        const name = await this.$prompt('输入对话名称', '新建对话', {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          inputValue: `对话 ${this.conversations.length + 1}`
        });
        
        if (name.value) {
          const id = await window.electronAPI.createConversation(name.value);
          
          if (id) {
            await this.loadConversations();
            this.currentConversationId = id;
            await this.loadConversationServers();
            this.chatMessages = []; // 清空消息历史
          }
        }
      } catch (error) {
        // 用户取消操作
        if (error !== 'cancel') {
          console.error('创建对话失败:', error);
          this.$message.error('创建对话失败');
        }
      }
    },
    
    async onConversationChange() {
      await this.loadConversationServers();
      await this.loadChatHistory();
    },
    
    async loadConversationServers() {
      if (!this.currentConversationId) return;
      
      try {
        this.conversationServers = await window.electronAPI.getConversationServers(
          this.currentConversationId
        );
      } catch (error) {
        console.error('加载对话服务器失败:', error);
        this.$message.error('加载对话服务器失败');
      }
    },
    
    async loadChatHistory() {
      if (!this.currentConversationId) return;
      
      try {
        this.chatMessages = await window.electronAPI.getChatHistory(
          this.currentConversationId
        );
      } catch (error) {
        console.error('加载聊天历史失败:', error);
        this.$message.error('加载聊天历史失败');
      }
    },
    
    async showServerManager() {
      // 加载所有服务器
      try {
        this.availableServers = await window.electronAPI.getAllServers();
        this.showServerManagerDialog = true;
      } catch (error) {
        console.error('加载服务器列表失败:', error);
        this.$message.error('加载服务器列表失败');
      }
    },
    
    isServerInConversation(serverId) {
      return this.conversationServers.some(server => server.id === serverId);
    },
    
    async addServerToConversation(serverId) {
      try {
        await window.electronAPI.addServerToConversation({
          conversationId: this.currentConversationId,
          serverId
        });
        
        this.$message.success('服务器已添加到对话');
        await this.loadConversationServers();
      } catch (error) {
        console.error('添加服务器到对话失败:', error);
        this.$message.error('添加服务器到对话失败');
      }
    },
    
    async removeServerFromConversation(serverId) {
      try {
        await window.electronAPI.removeServerFromConversation({
          conversationId: this.currentConversationId,
          serverId
        });
        
        this.$message.success('服务器已从对话中移除');
        await this.loadConversationServers();
      } catch (error) {
        console.error('从对话中移除服务器失败:', error);
        this.$message.error('从对话中移除服务器失败');
      }
    },
    
    async toggleServer(server) {
      try {
        if (server.isRunning) {
          // 停止服务器
          await window.electronAPI.stopMcpServer(server.id);
          this.$message.success(`${server.name}服务器已停止`);
        } else {
          // 启动服务器
          await window.electronAPI.startMcpServer(server);
          this.$message.success(`${server.name}服务器已启动`);
        }
        
        // 刷新服务器列表
        this.availableServers = await window.electronAPI.getAllServers();
        await this.loadConversationServers();
      } catch (error) {
        console.error('切换服务器状态失败:', error);
        this.$message.error(`切换服务器状态失败: ${error.message}`);
      }
    },
    
    async sendMessage() {
      if (!this.userInput.trim() || this.isProcessing) return;
      
      try {
        this.isProcessing = true;
        
        // 添加用户消息到聊天
        this.chatMessages.push({
          role: 'user',
          content: this.userInput
        });
        
        // 保存聊天消息
        await window.electronAPI.saveChatMessage({
          conversationId: this.currentConversationId,
          role: 'user',
          content: this.userInput
        });
        
        const userMessage = this.userInput;
        this.userInput = '';
        
        // 处理查询
        const response = await window.electronAPI.processQuery({
          query: userMessage,
          conversationId: this.currentConversationId
        });
        
        // 添加响应到聊天
        this.chatMessages.push({
          role: 'assistant',
          content: response.text
        });
        
        // 保存聊天消息
        await window.electronAPI.saveChatMessage({
          conversationId: this.currentConversationId,
          role: 'assistant',
          content: response.text
        });
        
      } catch (error) {
        console.error('处理消息失败:', error);
        this.$message.error('处理消息失败');
        
        // 添加错误消息
        this.chatMessages.push({
          role: 'system',
          content: `错误: ${error.message}`
        });
      } finally {
        this.isProcessing = false;
      }
    },
    
    formatMessage(content) {
      // 实现简单的Markdown格式化
      // 可以替换为更复杂的Markdown解析器
      return content
        .replace(/\n/g, '<br>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>');
    }
  }
}
</script>

<style scoped>
.chat-interface {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 20px;
}

.conversation-selector {
  display: flex;
  margin-bottom: 20px;
}

.conversation-selector .el-select {
  flex-grow: 1;
  margin-right: 10px;
}

.chat-messages {
  flex-grow: 1;
  overflow-y: auto;
  margin-bottom: 20px;
  border: 1px solid #e6e6e6;
  border-radius: 4px;
  padding: 10px;
}

.message {
  margin-bottom: 15px;
  padding: 10px;
  border-radius: 8px;
}

.message.user {
  background-color: #e6f7ff;
  text-align: right;
}

.message.assistant {
  background-color: #f6f6f6;
}

.message.system {
  background-color: #fff2f0;
  color: #ff4d4f;
}

.chat-input {
  display: flex;
}

.chat-input .el-input {
  flex-grow: 1;
  margin-right: 10px;
}

.server-manager h3 {
  margin-top: 20px;
  margin-bottom: 10px;
}
</style> 
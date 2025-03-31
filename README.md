# smart-pet-with-mcp

An Electron application with Vue

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) + [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar)

## Project Setup

### Install

```bash
$ pnpm install
```

### Development

```bash
$ pnpm dev
```

### Build

```bash
# For windows
$ pnpm build:win

# For macOS
$ pnpm build:mac

# For Linux
$ pnpm build:linux
```

## 新功能: GUI聊天界面

我们为应用添加了一个GUI聊天界面，允许用户直接在应用中与MCP客户端进行对话，而不是使用命令行。

主要更改：

1. 在Home.vue中添加了聊天输入框和聊天历史显示区域
2. 修改了main/index.js，通过IPC处理消息查询，而不是使用命令行chatLoop
3. 保留e-mcp-client.js中的chatLoop函数以保持兼容性，但在GUI模式下不再调用它

这些更改使应用更加用户友好，让用户可以直接在图形界面中与AI助手交互。

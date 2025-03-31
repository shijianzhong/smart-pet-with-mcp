import { Anthropic } from "@anthropic-ai/sdk";
// 替换静态导入为动态导入，稍后在代码中使用
// import {
//   MessageParam,
//   Tool,
// } from "@anthropic-ai/sdk/resources/messages/messages.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import readline from "readline/promises";
import dotenv from "dotenv";

dotenv.config();

// const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// if (!ANTHROPIC_API_KEY) {
//   throw new Error("ANTHROPIC_API_KEY is not set");
// }

class MCPClient {
   mcp;
   anthropic;
   transport = null;
   tools = [];
   MessageParam;
   Tool;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: "sk-fastgpt",
      baseURL: "http://localhost:3001/v1",
    });
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
    
    // 使用动态导入初始化MessageParam和Tool
    this.initializeTypes();
  }
  
  async initializeTypes() {
    try {
      const messagesModule = await import("@anthropic-ai/sdk/resources/messages/messages.mjs");
      this.MessageParam = messagesModule.MessageParam;
      this.Tool = messagesModule.Tool;
    } catch (error) {
      console.error("Failed to import message types:", error);
    }
  }

  // methods will go here
  async connectToServer(serverScriptPath) {
    try {
      const isJs = serverScriptPath.endsWith(".js");
      const isPy = serverScriptPath.endsWith(".py");
      if (!isJs && !isPy) {
        throw new Error("Server script must be a .js or .py file");
      }
      const command = isPy
        ? process.platform === "win32"
          ? "python"
          : "python3"
        : process.execPath;
      
      this.transport = new StdioClientTransport({
        command,
        args: [serverScriptPath],
      });
      this.mcp.connect(this.transport);
      
      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          name: tool.name,
          description: tool.description,
          input_schema: tool.inputSchema,
        };
      });
      console.log(
        "Connected to server with tools:",
        this.tools.map(({ name }) => name)
      );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }
  async processQuery(query) {
    const messages = [
      {
        role: "user",
        content: query,
      },
    ];
  
    const response = await this.anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1000,
      messages,
      tools: this.tools,
    });
  
    const finalText = [];
    const toolResults = [];
  
    for (const content of response.content) {
      if (content.type === "text") {
        finalText.push(content.text);
      } else if (content.type === "tool_use") {
        const toolName = content.name;
        const toolArgs = content.input ;
  
        // 处理没有MCP服务器的情况
        let result;
        if (this.mcp && this.transport) {
          // 正常通过MCP调用工具
          result = await this.mcp.callTool({
            name: toolName,
            arguments: toolArgs,
          });
        } else {
          // 提供模拟响应
          result = {
            content: `模拟工具${toolName}调用，参数: ${JSON.stringify(toolArgs)}。在没有MCP服务器的情况下，这是一个模拟响应。`,
          };
        }
        
        toolResults.push(result);
        finalText.push(
          `[调用工具 ${toolName} 参数 ${JSON.stringify(toolArgs)}]`
        );
  
        messages.push({
          role: "user",
          content: result.content,
        });
  
        const response = await this.anthropic.messages.create({
          model: "gpt-4o",
          max_tokens: 1000,
          messages,
        });
  
        finalText.push(
          response.content[0].type === "text" ? response.content[0].text : ""
        );
      }
    }
  
    return finalText.join("\n");
  }
  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  
    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");
  
      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        const response = await this.processQuery(message);
        console.log("\n" + response);
      }
    } finally {
      rl.close();
    }
  }
  
  async cleanup() {
    await this.mcp.close();
  }
  
  // 添加内置工具列表，无需连接到外部服务器
  setupBuiltinTools() {
    this.tools = [
      {
        name: "mcp__read_file",
        description: "读取文件内容",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string" }
          },
          required: ["path"]
        }
      },
      {
        name: "mcp__write_file",
        description: "写入文件内容",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" }
          },
          required: ["path", "content"]
        }
      },
      {
        name: "mcp__list_directory",
        description: "列出目录内容",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string" }
          },
          required: ["path"]
        }
      }
    ];
    
    console.log("已设置内置工具:", this.tools.map(({ name }) => name));
  }
}

export default MCPClient;
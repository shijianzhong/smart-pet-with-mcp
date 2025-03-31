<template>
    <div class="canvasWrap">
      <canvas id="myCanvas" />
      <ChangeModelDialog 
        :show="showChangeModelDialog" 
        @close="showChangeModelDialog = false"
        @changeModel="changeModel"
      />
    </div>
  </template>
  
  <script setup>
  import { onMounted, onBeforeUnmount, ref } from "vue";
  import ChangeModelDialog from './ChangeModelDialog.vue';
  
  import * as PIXI from "pixi.js";
  import { Live2DModel } from "pixi-live2d-display/cubism4"; // 只需要 Cubism 4
  
  window.PIXI = PIXI; // 为了pixi-live2d-display内部调用
  
  let app; // 为了存储pixi实例
  let model; // 为了存储live2d实例
  let animationFrameId = null;
  
  // 当前模型路径 - 修改为正确的路径
  const currentModelPath = ref("models/lafei/lafei.model3.json");
  // 控制换装弹窗显示
  const showChangeModelDialog = ref(false);
  
  // 修改模型缩放比例
  const handleResize = () => {
    if (!app || !model) return;
    
    // 调整画布大小
    app.renderer.resize(window.innerWidth, window.innerHeight);
    
    // 根据模型比例和窗口大小调整模型缩放
    const modelAspect = model.width / model.height;
    const windowAspect = window.innerWidth / window.innerHeight;
    let scale;
    
    if (windowAspect > modelAspect) {
      // 窗口比模型更宽，以高度为基准
      scale = (window.innerHeight / model.height) * 0.99; // 进一步增大系数让模型更贴近边缘
    } else {
      // 窗口比模型更窄，以宽度为基准
      scale = (window.innerWidth / model.width) * 0.99; // 进一步增大系数让模型更贴近边缘
    }
    
    model.scale.set(scale);
    
    // 调整模型位置，使其居中并稍微上移
    model.x = window.innerWidth / 2;
    model.y = window.innerHeight / 2 - 20; // 稍微上移20像素，让模型更居中
  };
  
  onMounted(async () => {
    init();
    window.addEventListener('resize', handleResize);
    
    // 监听来自主进程的换装消息
    window.api.onOpenChangeModelDialog(() => {
      showChangeModelDialog.value = true;
    });
  });
  
  onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    // 不需要手动移除IPC监听器，onOpenChangeModelDialog会返回清理函数
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    app?.destroy(true);
    app = null;
    model = null;
  });
  
  // 换装功能
  const changeModel = async (modelPath) => {
    if (!app || modelPath === currentModelPath.value) return;
    
    try {
      console.log("切换模型到:", modelPath);
      
      // 如果已有模型，先从舞台移除
      if (model) {
        app.stage.removeChild(model);
        model.destroy();
      }
      
      // 加载新模型
      model = await Live2DModel.from(modelPath, {
        autoInteract: false,
      });
      
      console.log("新模型加载成功");
      currentModelPath.value = modelPath;
      
      // 设置模型的原点为中心点
      model.anchor.set(0.5, 0.5);
      
      // 计算并应用缩放
      const modelAspect = model.width / model.height;
      const windowAspect = window.innerWidth / window.innerHeight;
      let scale;
      
      if (windowAspect > modelAspect) {
        scale = (window.innerHeight / model.height) * 0.99;
      } else {
        scale = (window.innerWidth / model.width) * 0.99;
      }
      
      model.scale.set(scale);
      
      // 居中显示
      model.x = window.innerWidth / 2;
      model.y = window.innerHeight / 2 - 20; // 稍微上移20像素，让模型更居中
      
      // 添加到舞台
      app.stage.addChild(model);
    } catch (error) {
      console.error("模型加载失败:", error);
    }
  };
  
  const mouthFn = () => {
    setInterval(() => {
      let n = Math.random();
      console.log("随机数0~1控制嘴巴Y轴高度-->", n);
      model.internalModel.coreModel.setParameterValueById("ParamMouthOpenY", n);
    }, 100);
  };
  
  const init = async () => {
    try {
      console.log("创建PIXI应用...");
      // 创建PIXI实例
      app = new PIXI.Application({
        // 指定PixiJS渲染器使用的HTML <canvas> 元素
        view: document.querySelector("#myCanvas"),
        width: window.innerWidth,
        height: window.innerHeight,
        transparent: true, // 透明背景
        antialias: true, // 抗锯齿
        autoDensity: true, // 自动调整DPI
        resolution: window.devicePixelRatio || 1, // 适应设备像素比
        backgroundAlpha: 0,
      });
      
      console.log("PIXI应用创建成功!");
      
      try {
        // 尝试获取模型的绝对路径
        const modelPath = currentModelPath.value;
        console.log("准备加载模型...");
        console.log("模型路径:", modelPath);
        
        // 检查文件是否可访问
        try {
          const response = await fetch(modelPath);
          if (!response.ok) {
            throw new Error(`模型文件不可访问: ${response.status} ${response.statusText}`);
          }
          console.log("模型文件可访问!");
        } catch (fileError) {
          console.error("模型文件访问失败:", fileError);
        }
        
        console.log("从路径加载模型:", modelPath);
        
        // 从正确的路径加载模型
        model = await Live2DModel.from(modelPath, {
          autoInteract: false, // 关闭眼睛自动跟随功能
        });
        
        console.log("模型加载成功!");
        
        // 设置模型的原点为中心点，便于居中显示
        model.anchor.set(0.5, 0.5);
        
        // 根据模型尺寸和窗口大小计算合适的缩放比例
        const modelAspect = model.width / model.height;
        const windowAspect = window.innerWidth / window.innerHeight;
        let scale;
        
        if (windowAspect > modelAspect) {
          // 窗口比模型更宽，以高度为基准
          scale = (window.innerHeight / model.height) * 0.99; // 进一步增大系数让模型更贴近边缘
        } else {
          // 窗口比模型更窄，以宽度为基准
          scale = (window.innerWidth / model.width) * 0.99; // 进一步增大系数让模型更贴近边缘
        }
        
        // 应用缩放
        model.scale.set(scale);
        
        // 将模型放置在画布中央
        model.x = window.innerWidth / 2;
        model.y = window.innerHeight / 2 - 20; // 稍微上移20像素，让模型更居中
        
        // 把模型添加到舞台上
        app.stage.addChild(model);
        
        console.log("模型已添加到舞台!");
      } catch (modelError) {
        console.error("模型加载或初始化失败:", modelError);
        // 尝试显示一些错误信息在canvas上
        const errorText = new PIXI.Text(`模型加载失败: ${modelError.message}`, {
          fontSize: 18,
          fill: 'red',
          align: 'center'
        });
        errorText.x = app.renderer.width / 2 - errorText.width / 2;
        errorText.y = app.renderer.height / 2;
        app.stage.addChild(errorText);
      }
    } catch (error) {
      console.error("PIXI初始化失败:", error);
    }
  };
  </script>
  
  <style lang="less" scoped>
  .canvasWrap {
    width: 100%;
    height: 100%;
    position: fixed;
    top: 0;
    left: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1;
    -webkit-app-region: drag; /* 允许拖动区域 */
    app-region: drag;
    cursor: move;
    -webkit-user-select: none;
    user-select: none;
    overflow: hidden;
    background-color: transparent;
  }
  
  #myCanvas {
    width: 100% !important;
    height: 100% !important;
    display: block;
    -webkit-user-select: none;
    user-select: none;
    -webkit-app-region: drag;
    app-region: drag;
    cursor: move;
    background-color: transparent;
  }
  
  .model-button {
    position: absolute;
    bottom: 20px;
    right: 20px;
    padding: 8px 16px;
    background-color: rgba(66, 184, 131, 0.8);
    color: white;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    -webkit-app-region: no-drag; /* 按钮不作为拖动区域 */
    app-region: no-drag;
    z-index: 10;
    transition: all 0.3s ease;
    
    &:hover {
      background-color: rgba(66, 184, 131, 1);
      transform: scale(1.05);
    }
  }
  </style>
  
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
  let lastScaleFactor = null; // 用于记忆上一次的缩放比例
  let initialScaleFactor = null; // 用于记住初始缩放比例（用于重置）
  
  // 当前模型路径 - 修改为正确的路径
  const currentModelPath = ref("models/lafei/lafei.model3.json");
  // 控制换装弹窗显示
  const showChangeModelDialog = ref(false);
  
  // 手动缩放模型的函数
  const scaleModel = (factor) => {
    if (!model) return;
    
    // 获取当前缩放
    const currentScale = model.scale.x;
    // 计算新的缩放值
    const newScale = currentScale * factor;
    
    // 应用新的缩放
    model.scale.set(newScale);
    // 更新记忆的缩放因子
    saveScaleFactor(newScale);
    
    console.log(`模型缩放: ${currentScale} -> ${newScale}`);
  };
  
  // 重置模型到初始大小
  const resetScale = () => {
    if (!model || initialScaleFactor === null) return;
    
    // 恢复初始缩放
    const appliedScale = initialScaleFactor * (window.devicePixelRatio || 1);
    model.scale.set(appliedScale);
    // 更新记忆的缩放因子
    lastScaleFactor = initialScaleFactor;
    
    console.log(`重置模型缩放: ${model.scale.x} -> ${appliedScale}`);
  };
  
  // 处理键盘事件
  const handleKeyDown = (event) => {
    // 首先打印出键盘事件信息，帮助调试
    console.log('键盘事件:', {
      key: event.key,
      code: event.code,
      keyCode: event.keyCode,
      which: event.which,
      ctrlKey: event.ctrlKey
    });
    
    // 检查是否按下了Ctrl键
    if (event.ctrlKey && model) {
      // 加号/等号检测
      if (event.key === '+' || event.key === '=' || event.code === 'Equal' || event.keyCode === 187) {
        event.preventDefault(); // 防止浏览器默认缩放行为
        scaleModel(1.1); // 放大10%
      }
      // 减号检测 - 使用多种可能的值
      else if (event.key === '-' || event.code === 'Minus' || event.keyCode === 189 || event.keyCode === 173) {
        event.preventDefault();
        scaleModel(0.9); // 缩小10%
        console.log('执行缩小操作');
      }
      // 数字0检测
      else if (event.key === '0' || event.code === 'Digit0' || event.keyCode === 48) {
        event.preventDefault();
        resetScale(); // 重置大小
      }
    }
  };
  
  // 添加鼠标滚轮事件处理函数
  const handleWheel = (event) => {
    // 防止事件默认行为（页面滚动）
    event.preventDefault();
    
    // 只有按住Ctrl键时才调整大小，避免误操作
    if (event.ctrlKey && model) {
      // 确定缩放方向和大小
      const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
      scaleModel(zoomFactor);
    }
  };
  
  // 添加一个函数用于保存模型的缩放因子，考虑当前DPI
  const saveScaleFactor = (scale) => {
    // 存储与设备像素比无关的缩放因子
    // 这样在不同DPI屏幕上可以换算为相同的视觉大小
    lastScaleFactor = scale / (window.devicePixelRatio || 1);
    console.log('保存缩放因子:', lastScaleFactor, '当前DPI:', window.devicePixelRatio);
    
    // 如果是首次设置缩放，同时保存为初始缩放值
    if (initialScaleFactor === null) {
      initialScaleFactor = lastScaleFactor;
      console.log('保存初始缩放因子:', initialScaleFactor);
    }
  };
  
  // 添加一个函数用于获取实际应用的缩放因子，考虑当前DPI
  const getAppliedScale = () => {
    if (lastScaleFactor === null) return null;
    // 应用的缩放因子需要乘以当前设备的像素比
    // 这样在高DPI屏幕上模型会更清晰，但视觉大小保持不变
    return lastScaleFactor * (window.devicePixelRatio || 1);
  };
  
  // 修改handleResize函数，添加缩放比例记忆功能
  const handleResize = (updateModelScale = true) => {
    if (!app || !model) return;
    
    // 调整画布大小
    app.renderer.resize(window.innerWidth, window.innerHeight);
    
    // 只有需要更新模型缩放时才执行
    if (updateModelScale) {
      // 如果已经有记忆的缩放比例，且当前不是第一次加载模型，则使用记忆的比例
      const appliedScale = getAppliedScale();
      if (appliedScale !== null && !model.isFirstLoad) {
        model.scale.set(appliedScale);
      } else {
        // 根据模型比例和窗口大小调整模型缩放
        const modelAspect = model.width / model.height;
        const windowAspect = window.innerWidth / window.innerHeight;
        
        // 添加额外的安全边距，确保模型完全可见
        // 设置一个较小的系数以确保模型不会贴边
        const safetyFactor = 0.92; // 留出8%的边距
        
        let scale;
        
        if (windowAspect > modelAspect) {
          // 窗口比模型更宽，以高度为基准
          scale = (window.innerHeight / model.height) * safetyFactor;
        } else {
          // 窗口比模型更窄，以宽度为基准
          scale = (window.innerWidth / model.width) * safetyFactor;
        }
        
        // 对于特别大的模型设置最大缩放限制
        // 检查缩放后的尺寸是否超过窗口的90%
        const scaledWidth = model.width * scale;
        const scaledHeight = model.height * scale;
        
        if (scaledWidth > window.innerWidth * 0.95 || scaledHeight > window.innerHeight * 0.95) {
          // 如果模型太大，进一步减小缩放系数
          const widthRatio = (window.innerWidth * 0.9) / scaledWidth;
          const heightRatio = (window.innerHeight * 0.9) / scaledHeight;
          const additionalScale = Math.min(widthRatio, heightRatio);
          scale *= additionalScale;
          console.log('模型较大，应用额外缩小系数:', additionalScale);
        }
        
        // 保存计算的缩放比例
        saveScaleFactor(scale);
        model.scale.set(scale);
        // 标记模型已不是第一次加载
        model.isFirstLoad = false;
      }
    }
    
    // 调整模型位置，使其居中并稍微上移
    model.x = window.innerWidth / 2;
    model.y = window.innerHeight / 2 - 20; // 稍微上移20像素，让模型更居中
  };
  
  // 添加窗口拖动开始和结束的监听
  let isDragging = false;
  const startDragging = () => {
    isDragging = true;
  };
  
  const stopDragging = () => {
    isDragging = false;
    // 确保拖动停止后更新分辨率和位置，但保持相对缩放比例
    updateResolution();
  };
  
  // 添加DPI变化监听
  const updateResolution = () => {
    if (!app) return;
    const canvas = app.view;
    // 获取当前显示设备的DPI信息
    const currentDpi = window.devicePixelRatio || 1;
    console.log('当前设备DPI:', currentDpi);
    
    // 更新渲染器分辨率
    app.renderer.resolution = currentDpi;

    // 如果有模型并且已经保存了缩放因子
    if (model && lastScaleFactor !== null) {
      // 应用适合当前DPI的缩放
      const appliedScale = getAppliedScale();
      model.scale.set(appliedScale);
    }
    
    // 更新位置
    handleResize(false);
  };
  
  onMounted(async () => {
    // 设置canvas的CSS样式以确保高DPI显示
    const canvas = document.querySelector("#myCanvas");
    if (canvas) {
      // 确保canvas在高DPI显示器上正确渲染
      canvas.style.imageRendering = 'high-quality';
      
      // 添加鼠标滚轮事件监听
      canvas.addEventListener('wheel', handleWheel, { passive: false });
    }
    
    // 添加键盘事件监听 - 使用捕获阶段确保最先捕获事件
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    
    // 尝试在渲染进程中通过IPC注册全局快捷键（如果api可用）
    try {
      if (window.api && typeof window.api.registerShortcut === 'function') {
        // 注册Electron层面的快捷键
        console.log('注册Electron全局快捷键');
        window.api.registerShortcut('Ctrl+Plus', () => {
          console.log('触发Ctrl+Plus全局快捷键');
          scaleModel(1.1);
        });
        window.api.registerShortcut('Ctrl+Minus', () => {
          console.log('触发Ctrl+Minus全局快捷键'); 
          scaleModel(0.9);
        });
        window.api.registerShortcut('Ctrl+0', () => {
          console.log('触发Ctrl+0全局快捷键');
          resetScale();
        });
      }
    } catch (error) {
      console.error('注册全局快捷键失败:', error);
    }
    
    init();
    window.addEventListener('resize', handleResize);
    // 添加DPI变化监听
    window.matchMedia('screen and (min-resolution: 1dppx)').addEventListener('change', updateResolution);
    // 添加窗口拖动监听
    window.addEventListener('mousedown', startDragging);
    window.addEventListener('mouseup', stopDragging);
    
    // 监听来自主进程的换装消息
    window.api.onOpenChangeModelDialog(() => {
      showChangeModelDialog.value = true;
    });
  });
  
  onBeforeUnmount(() => {
    // 移除鼠标滚轮事件监听
    const canvas = document.querySelector("#myCanvas");
    if (canvas) {
      canvas.removeEventListener('wheel', handleWheel);
    }
    
    // 移除键盘事件监听 - 确保与添加时使用相同的选项
    window.removeEventListener('keydown', handleKeyDown, { capture: true });
    
    // 注销全局快捷键（如果api可用）
    try {
      if (window.api && typeof window.api.unregisterShortcuts === 'function') {
        window.api.unregisterShortcuts();
      }
    } catch (error) {
      console.error('注销全局快捷键失败:', error);
    }
    
    window.removeEventListener('resize', handleResize);
    // 移除DPI变化监听
    window.matchMedia('screen and (min-resolution: 1dppx)').removeEventListener('change', updateResolution);
    // 移除窗口拖动监听
    window.removeEventListener('mousedown', startDragging);
    window.removeEventListener('mouseup', stopDragging);
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
      
      // 重置初始缩放比例，因为切换了新模型
      initialScaleFactor = null;
      lastScaleFactor = null;
      
      // 加载新模型，添加高质量渲染选项
      model = await Live2DModel.from(modelPath, {
        autoInteract: false,
        // 使用更高质量的渲染设置
        
        // 如果Live2D模型支持，可以设置更高分辨率的纹理
        // 一些Live2D模型可能支持不同分辨率的纹理
        higherResolution: true
      });
      
      console.log("新模型加载成功");
      currentModelPath.value = modelPath;
      
      // 设置模型的原点为中心点
      model.anchor.set(0.5, 0.5);
      
      // 保存原始尺寸，以便在屏幕变化时使用
      model.originalWidth = model.width;
      model.originalHeight = model.height;
      
      // 模型加载后先进行尺寸检查
      console.log(`模型原始尺寸: ${model.width} x ${model.height}`);
      console.log(`窗口尺寸: ${window.innerWidth} x ${window.innerHeight}`);
      
      // 检查模型是否超过窗口尺寸的80%
      const isModelTooLarge = model.width > window.innerWidth * 0.8 || model.height > window.innerHeight * 0.8;
      if (isModelTooLarge) {
        console.log('检测到模型尺寸较大，将应用更保守的缩放');
      }
      
      // 确保模型尺寸不会超过窗口的合理范围
      model.isFirstLoad = true; // 标记为首次加载，以便handleResize计算新的缩放
      
      // 使用handleResize函数计算并应用缩放
      handleResize(true);
      
      // 添加到舞台
      app.stage.addChild(model);
      
      // 提示用户可以调整模型大小的方法
      console.log('提示：可以使用Ctrl+加号放大模型，Ctrl+减号缩小模型，Ctrl+0重置模型大小，或者按住Ctrl键滚动鼠标滚轮缩放模型');
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
        resolution: window.devicePixelRatio || 1, // 使用设备像素比以提高清晰度
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
          // 使用更高质量的渲染设置
          
          // 如果Live2D模型支持，可以设置更高分辨率的纹理
          // 一些Live2D模型可能支持不同分辨率的纹理
          higherResolution: true
        });
        
        console.log("模型加载成功!");
        
        // 设置模型的原点为中心点，便于居中显示
        model.anchor.set(0.5, 0.5);
        
        // 保存原始尺寸，以便在屏幕变化时使用
        model.originalWidth = model.width;
        model.originalHeight = model.height;
        
        // 使用handleResize函数计算并应用缩放
        handleResize(true);
        
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
    
    /* 添加以下属性以提高渲染质量 */
    image-rendering: -webkit-optimize-contrast; /* Chrome, Safari */
    image-rendering: crisp-edges; /* Firefox */
    -ms-interpolation-mode: nearest-neighbor; /* IE/Edge */
    backface-visibility: hidden; /* 减少渲染闪烁 */
    transform: translateZ(0); /* 启用GPU加速 */
    will-change: transform; /* 提示浏览器此元素将频繁变化 */
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
  
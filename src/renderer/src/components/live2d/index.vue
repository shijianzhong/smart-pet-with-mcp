<template>
    <div class="canvasWrap">
      <canvas id="myCanvas" />
      <ChangeModelDialog 
        :show="showChangeModelDialog" 
        :model-list="localModelList"
        :current-model-path="currentModelPath"
        @close="showChangeModelDialog = false"
        @changeModel="changeModel"
      />
      <div class="interaction-area">
        <button class="model-button" @click="toggleInteractionMode">
          {{ interactionMode ? '互动模式' : '拖拽模式' }}
        </button>
      </div>
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
  
  // 创建一个播放login动画的函数
  const playLoginAnimation = (modelInstance, context = '初始化') => {
    if (!modelInstance || !modelInstance.internalModel) return;
    
    try {
      console.log(`${context}时，尝试播放login动画...`);
      // 检查模型是否有login动画
      if (modelInstance.internalModel.motionManager.definitions) {
        const motionGroups = Object.keys(modelInstance.internalModel.motionManager.definitions);
        console.log('可用动作组:', motionGroups);
        
        // 查找默认动作组中的login动画
        if (motionGroups.includes("")) {
          const defaultGroup = modelInstance.internalModel.motionManager.definitions[""];
          if (defaultGroup) {
            // 查找login动画
            const loginMotion = defaultGroup.find(motion => 
              motion.File && motion.File.toLowerCase().includes('login')
            );
            
            if (loginMotion) {
              console.log('找到login动画:', loginMotion);
              // 播放login动画
              modelInstance.motion("", loginMotion.File.split('/').pop().replace('.motion3.json', ''));
              console.log('播放login动画成功');
              return true;
            } else {
              console.log('在默认组中未找到login动画');
              // 如果在context为"切换模型"时找不到login动画，尝试播放其他动画
              if (context === '切换模型' && defaultGroup.length > 0) {
                console.log('使用首个可用动画代替login动画');
                const firstMotion = defaultGroup[0];
                modelInstance.motion("", firstMotion.File.split('/').pop().replace('.motion3.json', ''));
                return true;
              }
            }
          }
        } else {
          console.log('模型没有默认动作组');
          // 如果在context为"切换模型"时没有默认动作组，尝试使用其他动作组
          if (context === '切换模型' && motionGroups.length > 0) {
            console.log('使用其他动作组代替默认动作组');
            const firstGroup = motionGroups[0];
            modelInstance.internalModel.motionManager.startRandomMotion(firstGroup, 'idle');
            console.log('使用动作组动画代替:', firstGroup);
            return true;
          }
        }
      } else {
        console.log('模型没有任何动作定义');
      }
    } catch (error) {
      console.error('播放login动画失败:', error);
    }
    return false;
  };
  
  // 当前模型路径 - 修改为正确的路径
  const currentModelPath = ref("models/lafei/lafei.model3.json");
  // 控制换装弹窗显示
  const showChangeModelDialog = ref(false);
  // 控制互动/拖拽模式
  const interactionMode = ref(false);

  // 模型列表
  const localModelList = ref([
    {
      name: '拉菲',
      path: 'models/lafei/lafei.model3.json',
      thumbnail: 'models/lafei/textures/texture_00.png'
    },
    {
      name: '爱尔德里奇5',
      path: 'models/aierdeliqi_5/aierdeliqi_5.model3.json',
      thumbnail: 'models/aierdeliqi_5/textures/texture_00.png'
    },
    {
      name: '爱尔德里奇4',
      path: 'models/aierdeliqi_4/aierdeliqi_4.model3.json',
      thumbnail: 'models/aierdeliqi_4/textures/texture_00.png'
    },
    {
      name: '爱丹2',
      path: 'models/aidang_2/aidang_2.model3.json',
      thumbnail: 'models/aidang_2/textures/texture_00.png'
    },
    {
      name: 'bisimai_2',
      path: 'models/bisimai_2/bisimai_2.model3.json',
      thumbnail: 'models/bisimai_2/textures/texture_00.png'
    },
    {
      name: '扎拉2',
      path: 'models/zhala_2/zhala_2.model3.json',
      thumbnail: 'models/zhala_2/textures/texture_00.png'
    },
    {
      name: 'Z46',
      path: 'models/z46_2/z46_2.model3.json',
      thumbnail: 'models/z46_2/textures/texture_00.png'
    },
    {
      name: 'Z23',
      path: 'models/z23/z23.model3.json',
      thumbnail: 'models/z23/textures/texture_00.png'
    },
    {
      name: '伊吹2',
      path: 'models/yichui_2/yichui_2.model3.json',
      thumbnail: 'models/yichui_2/textures/texture_00.png'
    },
    {
      name: '雪风',
      path: 'models/xuefeng/xuefeng.model3.json',
      thumbnail: 'models/xuefeng/textures/texture_00.png'
    },
    {
      name: '吸血鬼4',
      path: 'models/xixuegui_4/xixuegui_4.model3.json',
      thumbnail: 'models/xixuegui_4/textures/texture_00.png'
    },
    {
      name: '翔鹤2',
      path: 'models/xianghe_2/xianghe_2.model3.json',
      thumbnail: 'models/xianghe_2/textures/texture_00.png'
    },
    {
      name: '提尔比茨2',
      path: 'models/tierbici_2/tierbici_2.model3.json',
      thumbnail: 'models/tierbici_2/textures/texture_00.png'
    },
    {
      name: '天狼星3',
      path: 'models/tianlangxing_3/tianlangxing_3.model3.json',
      thumbnail: 'models/tianlangxing_3/textures/texture_00.png'
    },
    {
      name: '太原2',
      path: 'models/taiyuan_2/taiyuan_2.model3.json',
      thumbnail: 'models/taiyuan_2/textures/texture_00.png'
    },
    {
      name: '斯佩伯爵5',
      path: 'models/sipeibojue_5/sipeibojue_5.model3.json',
      thumbnail: 'models/sipeibojue_5/textures/texture_00.png'
    },
    {
      name: '圣路易斯3',
      path: 'models/shengluyisi_3/shengluyisi_3.model3.json',
      thumbnail: 'models/shengluyisi_3/textures/texture_00.png'
    },
    {
      name: '圣路易斯2',
      path: 'models/shengluyisi_2/shengluyisi_2.model3.json',
      thumbnail: 'models/shengluyisi_2/textures/texture_00.png'
    },
    {
      name: '齐柏林2',
      path: 'models/qibolin_2/qibolin_2.model3.json',
      thumbnail: 'models/qibolin_2/textures/texture_00.png'
    },
    {
      name: '平海4',
      path: 'models/pinghai_4/pinghai_4.model3.json',
      thumbnail: 'models/pinghai_4/textures/texture_00.png'
    },
    {
      name: '宁海4',
      path: 'models/ninghai_4/ninghai_4.model3.json',
      thumbnail: 'models/ninghai_4/textures/texture_00.png'
    },
    {
      name: '明石',
      path: 'models/mingshi/mingshi.model3.json',
      thumbnail: 'models/mingshi/textures/texture_00.png'
    },
    {
      name: '凌波',
      path: 'models/lingbo/lingbo.model3.json',
      thumbnail: 'models/lingbo/textures/texture_00.png'
    },
    {
      name: '拉菲4',
      path: 'models/lafei_4/lafei_4.model3.json',
      thumbnail: 'models/lafei_4/textures/texture_00.png'
    },
    {
      name: '克利夫兰3',
      path: 'models/kelifulan_3/kelifulan_3.model3.json',
      thumbnail: 'models/kelifulan_3/textures/texture_00.png'
    },
    {
      name: '火奴鲁鲁5',
      path: 'models/huonululu_5/huonululu_5.model3.json',
      thumbnail: 'models/huonululu_5/textures/texture_00.png'
    },
    {
      name: '火奴鲁鲁3',
      path: 'models/huonululu_3/huonululu_3.model3.json',
      thumbnail: 'models/huonululu_3/textures/texture_00.png'
    },
    {
      name: '黄金方舟3',
      path: 'models/huangjiafangzhou_3/huangjiafangzhou_3.model3.json',
      thumbnail: 'models/huangjiafangzhou_3/textures/texture_00.png'
    },
    {
      name: '黑太子2',
      path: 'models/heitaizi_2/heitaizi_2.model3.json',
      thumbnail: 'models/heitaizi_2/textures/texture_00.png'
    },
    {
      name: '根艾森瑙2',
      path: 'models/genaisennao_2/genaisennao_2.model3.json',
      thumbnail: 'models/genaisennao_2/textures/texture_00.png'
    },
    {
      name: '敦刻尔克2',
      path: 'models/dunkeerke_2/dunkeerke_2.model3.json',
      thumbnail: 'models/dunkeerke_2/textures/texture_00.png'
    },
    {
      name: '独角兽4',
      path: 'models/dujiaoshou_4/dujiaoshou_4.model3.json',
      thumbnail: 'models/dujiaoshou_4/textures/texture_00.png'
    },
    {
      name: '德意志3',
      path: 'models/deyizhi_3/deyizhi_3.model3.json',
      thumbnail: 'models/deyizhi_3/textures/texture_00.png'
    },
    {
      name: '大凤2',
      path: 'models/dafeng_2/dafeng_2.model3.json',
      thumbnail: 'models/dafeng_2/textures/texture_00.png'
    },
    {
      name: '吹雪3',
      path: 'models/chuixue_3/chuixue_3.model3.json',
      thumbnail: 'models/chuixue_3/textures/texture_00.png'
    },
    {
      name: '标枪3',
      path: 'models/biaoqiang_3/biaoqiang_3.model3.json',
      thumbnail: 'models/biaoqiang_3/textures/texture_00.png'
    },
    {
      name: '标枪',
      path: 'models/biaoqiang/biaoqiang.model3.json',
      thumbnail: 'models/biaoqiang/textures/texture_00.png'
    },
    {
      name: '贝尔法斯特2',
      path: 'models/beierfasite_2/beierfasite_2.model3.json',
      thumbnail: 'models/beierfasite_2/textures/texture_00.png'
    },
    {
      name: '半人马2',
      path: 'models/banrenma_2/banrenma_2.model3.json',
      thumbnail: 'models/banrenma_2/textures/texture_00.png'
    },
    {
      name: '埃米尔贝尔丁2',
      path: 'models/aimierbeierding_2/aimierbeierding_2.model3.json',
      thumbnail: 'models/aimierbeierding_2/textures/texture_00.png'
    }
  ]);
  
  // 切换互动/拖拽模式
  const toggleInteractionMode = () => {
    interactionMode.value = !interactionMode.value;
    console.log(`切换到${interactionMode.value ? '互动' : '拖拽'}模式`);
  };
  
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
    
    // 清理所有可能设置的定时器
    document.querySelectorAll('*').forEach(element => {
      const timers = element.getAttribute('data-timers');
      if (timers) {
        timers.split(',').forEach(timer => clearInterval(parseInt(timer)));
      }
    });
    
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
      
      // 添加模型动画功能
      
      // 启用自动眨眼
      if (model.internalModel.eyeBlink) {
        model.internalModel.eyeBlink = true;
      }
      
      // 启用自动呼吸效果
      if (model.internalModel.breathing) {
        model.internalModel.breathing = true;
      }
      
      // 把模型添加到舞台上
      app.stage.addChild(model);
      
      // 播放login动画（模型切换时）
      playLoginAnimation(model, '切换模型');
      
      console.log("模型切换完成!");
      
      // 检查并播放空闲动作
      try {
        const availableGroups = Object.keys(model.internalModel.motionManager.definitions || {});
        console.log('可用动作组:', availableGroups);
        
        if (model.internalModel.motionManager.definitions.idle) {
          // 随机播放一个idle动作组的动作
          model.internalModel.motionManager.startRandomMotion('idle', 'idle');
          console.log('启动idle动作组动画');
        } else if (model.internalModel.motionManager.definitions.Idle) {
          // Cubism 4模型使用"Idle"（首字母大写）
          model.internalModel.motionManager.startRandomMotion('Idle', 'idle');
          console.log('启动Idle动作组动画');
        } else if (availableGroups.includes("")) {
          // 使用空名称动作组
          model.internalModel.motionManager.startRandomMotion("", 'idle');
          console.log('启动空名称动作组动画');
        } else if (availableGroups.length > 0) {
          // 使用任何可用的第一个动作组
          const firstGroup = availableGroups[0];
          model.internalModel.motionManager.startRandomMotion(firstGroup, 'idle');
          console.log(`启动动作组动画: ${firstGroup}`);
        } else {
          console.log('模型没有找到任何动作组');
        }
      } catch (motionError) {
        console.error('启动动作失败:', motionError);
      }
      
      // 添加模型互动功能
      model.on('hit', (hitAreas) => {
        console.log('点击了模型的区域:', hitAreas);
        
        // 根据点击区域播放不同动作
        try {
          // 只有在互动模式下或非拖拽状态才触发动作
          if (interactionMode.value || !isDragging) {
            if (hitAreas.includes('body')) {
              model.motion('tap_body');
            } else if (hitAreas.includes('head')) {
              model.motion('tap_head');
            } else {
              // 如果没有特定区域，尝试播放随机动作
              const groups = Object.keys(model.internalModel.motionManager.definitions || {});
              if (groups.length > 0) {
                const randomGroup = groups[Math.floor(Math.random() * groups.length)];
                model.internalModel.motionManager.startRandomMotion(randomGroup, 'idle');
              }
            }
            
            // 如果有表情定义，也可以随机播放表情
            const expressions = Object.keys(model.internalModel.expressionManager?.definitions || {});
            if (expressions.length > 0) {
              const randomExpression = expressions[Math.floor(Math.random() * expressions.length)];
              model.expression(randomExpression);
            }
          }
        } catch (hitError) {
          console.error('处理点击事件失败:', hitError);
        }
      });
      
      // 添加自动随机动作
      setInterval(() => {
        if (model && model.internalModel) {
          try {
            // 每15-25秒随机播放一个动作，不管是什么模式都播放
            const groups = Object.keys(model.internalModel.motionManager.definitions || {});
            if (groups.length > 0) {
              const randomGroup = groups[Math.floor(Math.random() * groups.length)];
              model.internalModel.motionManager.startRandomMotion(randomGroup, 'idle');
              console.log('播放随机动作:', randomGroup);
            }
          } catch (error) {
            console.error('播放随机动作失败:', error);
          }
        }
      }, 15000 + Math.random() * 1000);
      
      // 添加鼠标跟随功能
      document.addEventListener('mousemove', (e) => {
        // 只有在互动模式下或非拖拽状态才跟随鼠标
        if ((interactionMode.value || !isDragging) && model && model.internalModel) {
          try {
            const rect = app.view.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) / rect.width;
            const mouseY = (e.clientY - rect.top) / rect.height;
            
            // 将鼠标位置转换为模型的视线方向参数
            // Cubism 4 模型参数名
            model.internalModel.coreModel.setParameterValueById('ParamAngleX', (mouseX - 0.5) * 30);
            model.internalModel.coreModel.setParameterValueById('ParamAngleY', (mouseY - 0.5) * 30);
            model.internalModel.coreModel.setParameterValueById('ParamEyeBallX', (mouseX - 0.5) * 2);
            model.internalModel.coreModel.setParameterValueById('ParamEyeBallY', (mouseY - 0.5) * 2);
          } catch (e) {
            // 忽略参数设置错误，可能是模型不支持这些参数
          }
        }
      });
      
      // 定期更新嘴巴动画
      setInterval(() => {
        if (model && model.internalModel) {
          try {
            let n = Math.random() * 0.8; // 控制最大开口度
            model.internalModel.coreModel.setParameterValueById("ParamMouthOpenY", n);
          } catch (error) {
            // 忽略参数设置错误
          }
        }
      }, 200); // 更新频率降低，避免过于频繁的日志
      
      console.log("模型已添加到舞台!");
    } catch (error) {
      console.error("模型加载失败:", error);
    }
  };
  
  const mouthFn = () => {
    // 不再使用这个函数，已在更智能的方式中实现
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
          autoInteract: false, // 关闭自动互动功能，我们将手动实现
          // 使用更高质量的渲染设置
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
        
        // 添加模型动画功能
        
        // 启用自动眨眼
        if (model.internalModel.eyeBlink) {
          model.internalModel.eyeBlink = true;
        }
        
        // 启用自动呼吸效果
        if (model.internalModel.breathing) {
          model.internalModel.breathing = true;
        }
        
        // 把模型添加到舞台上
        app.stage.addChild(model);
        
        // 播放login动画（应用初始化时）
        playLoginAnimation(model, '初始化');
        
        console.log("模型已添加到舞台!");
        
        // 检查并播放空闲动作
        try {
          const availableGroups = Object.keys(model.internalModel.motionManager.definitions || {});
          console.log('可用动作组:', availableGroups);
          
          if (model.internalModel.motionManager.definitions.idle) {
            // 随机播放一个idle动作组的动作
            model.internalModel.motionManager.startRandomMotion('idle', 'idle');
            console.log('启动idle动作组动画');
          } else if (model.internalModel.motionManager.definitions.Idle) {
            // Cubism 4模型使用"Idle"（首字母大写）
            model.internalModel.motionManager.startRandomMotion('Idle', 'idle');
            console.log('启动Idle动作组动画');
          } else if (availableGroups.includes("")) {
            // 使用空名称动作组
            model.internalModel.motionManager.startRandomMotion("", 'idle');
            console.log('启动空名称动作组动画');
          } else if (availableGroups.length > 0) {
            // 使用任何可用的第一个动作组
            const firstGroup = availableGroups[0];
            model.internalModel.motionManager.startRandomMotion(firstGroup, 'idle');
            console.log(`启动动作组动画: ${firstGroup}`);
          } else {
            console.log('模型没有找到任何动作组');
          }
        } catch (motionError) {
          console.error('启动动作失败:', motionError);
        }
        
        // 添加模型互动功能
        model.on('hit', (hitAreas) => {
          console.log('点击了模型的区域:', hitAreas);
          
          // 根据点击区域播放不同动作
          try {
            // 只有在互动模式下或非拖拽状态才触发动作
            if (interactionMode.value || !isDragging) {
              if (hitAreas.includes('body')) {
                model.motion('tap_body');
              } else if (hitAreas.includes('head')) {
                model.motion('tap_head');
              } else {
                // 如果没有特定区域，尝试播放随机动作
                const groups = Object.keys(model.internalModel.motionManager.definitions || {});
                if (groups.length > 0) {
                  const randomGroup = groups[Math.floor(Math.random() * groups.length)];
                  model.internalModel.motionManager.startRandomMotion(randomGroup, 'idle');
                }
              }
              
              // 如果有表情定义，也可以随机播放表情
              const expressions = Object.keys(model.internalModel.expressionManager?.definitions || {});
              if (expressions.length > 0) {
                const randomExpression = expressions[Math.floor(Math.random() * expressions.length)];
                model.expression(randomExpression);
              }
            }
          } catch (hitError) {
            console.error('处理点击事件失败:', hitError);
          }
        });
        
        // 添加自动随机动作
        setInterval(() => {
          if (model && model.internalModel) {
            try {
              // 每15-25秒随机播放一个动作，不管是什么模式都播放
              const groups = Object.keys(model.internalModel.motionManager.definitions || {});
              if (groups.length > 0) {
                const randomGroup = groups[Math.floor(Math.random() * groups.length)];
                model.internalModel.motionManager.startRandomMotion(randomGroup, 'idle');
                console.log('播放随机动作:', randomGroup);
              }
            } catch (error) {
              console.error('播放随机动作失败:', error);
            }
          }
        }, 15000 + Math.random() * 10000);
        
        // 添加鼠标跟随功能
        document.addEventListener('mousemove', (e) => {
          // 只有在互动模式下或非拖拽状态才跟随鼠标
          if ((interactionMode.value || !isDragging) && model && model.internalModel) {
            try {
              const rect = app.view.getBoundingClientRect();
              const mouseX = (e.clientX - rect.left) / rect.width;
              const mouseY = (e.clientY - rect.top) / rect.height;
              
              // 将鼠标位置转换为模型的视线方向参数
              // Cubism 4 模型参数名
              model.internalModel.coreModel.setParameterValueById('ParamAngleX', (mouseX - 0.5) * 30);
              model.internalModel.coreModel.setParameterValueById('ParamAngleY', (mouseY - 0.5) * 30);
              model.internalModel.coreModel.setParameterValueById('ParamEyeBallX', (mouseX - 0.5) * 2);
              model.internalModel.coreModel.setParameterValueById('ParamEyeBallY', (mouseY - 0.5) * 2);
            } catch (e) {
              // 忽略参数设置错误，可能是模型不支持这些参数
            }
          }
        });
        
        // 定期更新嘴巴动画
        setInterval(() => {
          if (model && model.internalModel) {
            try {
              let n = Math.random() * 0.8; // 控制最大开口度
              model.internalModel.coreModel.setParameterValueById("ParamMouthOpenY", n);
            } catch (error) {
              // 忽略参数设置错误
            }
          }
        }, 200); // 更新频率降低，避免过于频繁的日志
        
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
    -webkit-app-region: drag; /* 恢复为drag允许窗口拖动 */
    app-region: drag;
    cursor: move;
    -webkit-user-select: none;
    user-select: none;
    overflow: hidden;
    background-color: transparent;
    pointer-events: none; /* 使容器不拦截鼠标事件 */
  }
  
  #myCanvas {
    width: 100% !important;
    height: 100% !important;
    display: block;
    -webkit-user-select: none;
    user-select: none;
    -webkit-app-region: drag; /* 恢复为drag允许窗口拖动 */
    app-region: drag;
    cursor: move;
    background-color: transparent;
    pointer-events: auto; /* 仅在canvas上启用鼠标事件 */
    
    /* 添加以下属性以提高渲染质量 */
    image-rendering: -webkit-optimize-contrast; /* Chrome, Safari */
    image-rendering: crisp-edges; /* Firefox */
    -ms-interpolation-mode: nearest-neighbor; /* IE/Edge */
    backface-visibility: hidden; /* 减少渲染闪烁 */
    transform: translateZ(0); /* 启用GPU加速 */
    will-change: transform; /* 提示浏览器此元素将频繁变化 */
  }
  
  .interaction-area {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 100;
    pointer-events: auto; /* 确保可以接收鼠标事件 */
  }
  
  .model-button {
    padding: 8px 16px;
    background-color: rgba(66, 184, 131, 0.8);
    color: white;
    border: none;
    border-radius: 20px;
    cursor: pointer;
    -webkit-app-region: no-drag; /* 按钮不作为拖动区域 */
    app-region: no-drag;
    transition: all 0.3s ease;
    
    &:hover {
      background-color: rgba(66, 184, 131, 1);
      transform: scale(1.05);
    }
  }
  </style>
  
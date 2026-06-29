/**
 * UIManager.js — UI 面板管理器
 * 创建企业级数字孪生大屏 UI（深蓝科技风 + Glassmorphism 玻璃拟态）。
 *
 * 布局：
 *   - 顶部栏  #top-bar   : LOGO + 标题 / 实时时间 / WS 状态 + AI 状态 + FPS
 *   - 左侧面板 #left-panel : AI 检测统计 / 人员统计 / 今日报警 / 风险等级
 *   - 右侧面板 #right-panel: 视频监控 / 摄像头列表 / AI 识别结果 / 实时事件
 *   - 底部面板 #bottom-panel: 图表容器（ChartManager 用）+ 系统状态
 *   - 中间 3D 画布全屏铺底
 *
 * 所有 DOM 用 createElement 创建，所有 CSS 通过 JS 动态注入 style 标签。
 */

import { CONFIG } from '../config/Config.js';

export class UIManager {
    /**
     * 构造函数：初始化引用与事件表
     */
    constructor() {
        // 元素引用集合（init 后填充）
        this.els = {};
        // UI 事件监听表：event -> Set<callback>
        this.listeners = new Map();
        // 时间更新定时器句柄
        this.timeTimer = null;
        // 当前选中的摄像头 ID
        this.selectedCameraId = null;
    }

    /**
     * 初始化：注入样式 + 创建所有 UI 面板 + 启动时间更新
     */
    init() {
        // 1. 注入全局样式
        this._injectStyles();
        // 2. 创建各面板
        this._createTopBar();
        this._createLeftPanel();
        this._createRightPanel();
        this._createBottomPanel();
        // 3. 启动顶部时间实时刷新（每秒一次）
        this.updateTime();
        this.timeTimer = setInterval(() => this.updateTime(), 1000);
    }

    // ==================== 样式注入 ====================

    /**
     * 动态创建 style 标签注入全部 CSS
     * 所有颜色取自 CONFIG.colors
     * @private
     */
    _injectStyles() {
        const c = CONFIG.colors;
        const css = `
        /* ===== 全局重置 ===== */
        * { box-sizing: border-box; }
        body {
            margin: 0;
            overflow: hidden;
            font-family: 'Segoe UI', 'Microsoft YaHei', Tahoma, sans-serif;
            background: ${c.bgDeep};
            color: ${c.textPrimary};
        }

        /* ===== 中间 3D 画布全屏铺底 ===== */
        canvas {
            position: absolute;
            top: 0;
            left: 0;
            width: 100vw !important;
            height: 100vh !important;
            z-index: 1;
            display: block;
        }

        /* ===== 通用面板样式（Glassmorphism 玻璃拟态） ===== */
        .glass-panel {
            position: absolute;
            background: ${c.bgPanel};
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border: 1px solid ${c.border};
            border-radius: 12px;
            color: ${c.textPrimary};
            z-index: 10;
            /* 渐入动画 */
            opacity: 0;
            transform: translateY(20px);
            animation: ui-fade-in ${CONFIG.animation.panelFadeIn}ms ease-out forwards;
        }
        @keyframes ui-fade-in {
            to { opacity: 1; transform: translateY(0); }
        }

        /* ===== 顶部栏 ===== */
        #top-bar {
            top: 0; left: 0; right: 0;
            height: 60px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            border-radius: 0 0 12px 12px;
        }
        .top-left { display: flex; align-items: center; gap: 12px; }
        .top-logo {
            width: 34px; height: 34px;
            border-radius: 8px;
            background: linear-gradient(135deg, ${c.accent}, ${c.info});
            display: flex; align-items: center; justify-content: center;
            font-size: 18px;
            box-shadow: 0 0 12px ${c.accent};
        }
        .top-title {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 2px;
            background: linear-gradient(90deg, ${c.accent}, ${c.textPrimary});
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .top-center { font-size: 18px; font-family: 'Consolas', 'Courier New', monospace; color: ${c.textPrimary}; letter-spacing: 1px; }
        .top-right { display: flex; align-items: center; gap: 18px; font-size: 13px; }
        .status-item { display: flex; align-items: center; gap: 6px; color: ${c.textSecondary}; }
        .status-dot {
            width: 10px; height: 10px; border-radius: 50%;
            background: ${c.textSecondary};
            box-shadow: 0 0 6px currentColor;
            transition: background 0.3s, box-shadow 0.3s;
        }
        .status-dot.online { background: ${c.success}; box-shadow: 0 0 8px ${c.success}; }
        .status-dot.offline { background: ${c.danger}; box-shadow: 0 0 8px ${c.danger}; }
        .status-dot.ai-on { background: ${c.accent}; box-shadow: 0 0 8px ${c.accent}; animation: ai-blink 1.5s infinite; }
        .status-dot.ai-off { background: ${c.textSecondary}; }
        @keyframes ai-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        .mono { font-family: 'Consolas', 'Courier New', monospace; }
        .num-accent { color: ${c.accent}; font-weight: 700; }
        .num-danger { color: ${c.danger}; font-weight: 700; }

        /* ===== 左侧 / 右侧面板滚动条美化 ===== */
        #left-panel, #right-panel {
            max-height: calc(100vh - 70px - 160px); /* 避开顶部70px + 底部面板区域150px */
            overflow-y: auto;
            padding: 14px;
        }
        #left-panel::-webkit-scrollbar, #right-panel::-webkit-scrollbar { width: 5px; }
        #left-panel::-webkit-scrollbar-thumb, #right-panel::-webkit-scrollbar-thumb { background: ${c.accentDim}; border-radius: 3px; }

        /* ===== 左侧面板定位 ===== */
        #left-panel { left: 10px; top: 70px; width: 260px; }

        /* ===== 右侧面板定位 ===== */
        #right-panel { right: 10px; top: 70px; width: 280px; }

        /* ===== 底部面板定位（避开左右面板） ===== */
        #bottom-panel {
            bottom: 10px;
            left: 280px;        /* 避开左侧面板（260+10+10） */
            right: 300px;       /* 避开右侧面板（280+10+10） */
            height: 140px;
            display: flex;
            align-items: stretch;
            padding: 8px 12px;
            gap: 10px;
            border-radius: 12px;
        }

        /* ===== 卡片通用样式 ===== */
        .ui-card {
            background: rgba(0, 30, 70, 0.4);
            border: 1px solid ${c.border};
            border-radius: 8px;
            padding: 10px 12px;
            margin-bottom: 10px;
        }
        .card-title {
            font-size: 12px;
            color: ${c.textSecondary};
            margin-bottom: 8px;
            letter-spacing: 1px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .card-title::before {
            content: '';
            width: 3px; height: 12px;
            background: ${c.accent};
            border-radius: 2px;
        }
        .card-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin: 4px 0;
            font-size: 13px;
        }
        .card-label { color: ${c.textSecondary}; }
        .card-value {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 16px;
            font-weight: 700;
            transition: color 0.3s, transform 0.3s;
        }
        /* 数字滚动动画：更新时短暂放大变色 */
        .card-value.roll { transform: scale(1.25); color: ${c.accent}; }

        /* ===== 风险等级条 ===== */
        .risk-bar {
            height: 8px;
            border-radius: 4px;
            background: ${c.accentDim};
            margin-top: 6px;
            overflow: hidden;
        }
        .risk-fill {
            height: 100%;
            width: 25%;
            border-radius: 4px;
            background: ${c.success};
            transition: width 0.5s, background 0.5s;
        }
        .risk-text { font-family: 'Consolas', monospace; font-size: 18px; font-weight: 700; }

        /* ===== 视频监控面板 ===== */
        .video-wrap {
            background: #000;
            border-radius: 6px;
            overflow: hidden;
            border: 1px solid ${c.border};
            margin-bottom: 8px;
        }
        #video-img {
            width: 100%;
            height: 120px;
            object-fit: cover;
            display: block;
            background: #111;
        }
        .video-name {
            font-size: 12px;
            color: ${c.accent};
            padding: 4px 8px;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: space-between;
        }

        /* ===== 摄像头按钮 2x2 网格 ===== */
        .cam-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
            margin-bottom: 8px;
        }
        .cam-btn {
            background: rgba(0, 30, 70, 0.5);
            border: 1px solid ${c.border};
            border-radius: 6px;
            color: ${c.textSecondary};
            padding: 8px 6px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.25s;
            text-align: center;
        }
        .cam-btn:hover { border-color: ${c.accent}; color: ${c.textPrimary}; }
        .cam-btn.selected {
            border: 1px solid ${c.accent};
            color: ${c.accent};
            background: rgba(0, 212, 255, 0.15);
            box-shadow: 0 0 8px ${c.accentDim};
        }

        /* ===== 列表（AI 结果 / 事件流） ===== */
        .ui-list {
            max-height: 130px;
            overflow-y: auto;
            font-size: 12px;
        }
        .ui-list::-webkit-scrollbar { width: 4px; }
        .ui-list::-webkit-scrollbar-thumb { background: ${c.accentDim}; border-radius: 2px; }
        .list-item {
            padding: 5px 8px;
            margin-bottom: 4px;
            border-radius: 4px;
            color: ${c.textSecondary};
            border-left: 3px solid ${c.accentDim};
            background: rgba(0, 30, 70, 0.3);
        }

        /* ===== 报警条目：左侧红色竖线 + 滑入动画 ===== */
        .alert-item {
            padding: 6px 8px;
            margin-bottom: 5px;
            border-radius: 4px;
            border-left: 3px solid ${c.danger};
            background: rgba(255, 51, 102, 0.08);
            color: ${c.textPrimary};
            font-size: 12px;
            cursor: pointer;
            transition: background 0.25s, transform 0.25s;
            /* 从顶部滑入 */
            animation: alert-slide-in 0.4s ease-out;
        }
        .alert-item:hover {
            background: rgba(255, 51, 102, 0.2);
            transform: translateX(2px);
        }
        @keyframes alert-slide-in {
            from { opacity: 0; transform: translateY(-12px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .alert-time { color: ${c.textSecondary}; font-size: 11px; margin-right: 4px; }
        .alert-type { font-weight: 700; }
        .alert-cam { color: ${c.warning}; font-size: 11px; }

        /* ===== 底部图表容器 + 系统状态 ===== */
        .chart-cell {
            flex: 1;
            min-width: 0;
            height: 100%;
            display: flex;
            flex-direction: column;
            background: rgba(0, 30, 70, 0.3);
            border: 1px solid ${c.border};
            border-radius: 8px;
            padding: 6px;
            overflow: hidden;
            position: relative;
        }
        .chart-cell-title {
            font-size: 11px;
            color: ${c.textSecondary};
            padding: 0 4px 4px;
            flex-shrink: 0;
        }
        .chart-cell-body {
            flex: 1;
            min-height: 0;
            width: 100%;
        }
        .sys-status {
            width: 150px;
            flex-shrink: 0;
            height: 100%;
            background: rgba(0, 30, 70, 0.4);
            border: 1px solid ${c.border};
            border-radius: 8px;
            padding: 8px 10px;
            font-size: 12px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 5px;
        }
        .sys-row { display: flex; justify-content: space-between; }
        `;

        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ==================== 顶部栏 ====================

    /**
     * 创建顶部栏
     * @private
     */
    _createTopBar() {
        const c = CONFIG.colors;

        const bar = document.createElement('div');
        bar.id = 'top-bar';
        bar.className = 'glass-panel';

        // ---- 左侧：LOGO + 标题 ----
        const left = document.createElement('div');
        left.className = 'top-left';

        const logo = document.createElement('div');
        logo.className = 'top-logo';
        logo.textContent = '🏗';

        const title = document.createElement('div');
        title.className = 'top-title';
        title.textContent = '智慧工地数字孪生监控平台';

        left.appendChild(logo);
        left.appendChild(title);

        // ---- 中间：实时时间 ----
        const center = document.createElement('div');
        center.className = 'top-center';
        center.id = 'time-display';
        center.textContent = '--';

        // ---- 右侧：WS 状态 + AI 状态 + FPS ----
        const right = document.createElement('div');
        right.className = 'top-right';

        // WebSocket 状态
        const wsItem = document.createElement('div');
        wsItem.className = 'status-item';
        const wsDot = document.createElement('span');
        wsDot.className = 'status-dot offline';
        wsDot.id = 'ws-dot';
        const wsText = document.createElement('span');
        wsText.id = 'ws-text';
        wsText.textContent = 'WS 离线';
        wsItem.appendChild(wsDot);
        wsItem.appendChild(wsText);

        // AI 运行状态
        const aiItem = document.createElement('div');
        aiItem.className = 'status-item';
        const aiDot = document.createElement('span');
        aiDot.className = 'status-dot ai-off';
        aiDot.id = 'ai-dot';
        const aiText = document.createElement('span');
        aiText.id = 'ai-text';
        aiText.textContent = 'AI 待机';
        aiItem.appendChild(aiDot);
        aiItem.appendChild(aiText);

        // FPS
        const fpsItem = document.createElement('div');
        fpsItem.className = 'status-item';
        const fpsLabel = document.createElement('span');
        fpsLabel.textContent = 'FPS';
        const fpsVal = document.createElement('span');
        fpsVal.className = 'mono num-accent';
        fpsVal.id = 'top-fps';
        fpsVal.textContent = '0';
        fpsItem.appendChild(fpsLabel);
        fpsItem.appendChild(fpsVal);

        right.appendChild(wsItem);
        right.appendChild(aiItem);
        right.appendChild(fpsItem);

        bar.appendChild(left);
        bar.appendChild(center);
        bar.appendChild(right);

        document.body.appendChild(bar);

        // 缓存引用
        this.els.timeDisplay = center;
        this.els.wsDot = wsDot;
        this.els.wsText = wsText;
        this.els.aiDot = aiDot;
        this.els.aiText = aiText;
        this.els.topFps = fpsVal;
    }

    // ==================== 左侧面板 ====================

    /**
     * 创建左侧面板：AI 检测统计 / 人员统计 / 今日报警 / 风险等级
     * @private
     */
    _createLeftPanel() {
        const panel = document.createElement('div');
        panel.id = 'left-panel';
        panel.className = 'glass-panel';

        // ---- AI 检测统计卡片 ----
        const aiCard = this._makeCard('AI 检测统计');
        aiCard.body.appendChild(this._makeRow('总检测次数', 'ai-total', '0'));
        aiCard.body.appendChild(this._makeRow('检测速度', 'ai-speed', '-- 次/s'));
        panel.appendChild(aiCard.root);

        // ---- 人员统计卡片 ----
        const workerCard = this._makeCard('人员统计');
        workerCard.body.appendChild(this._makeRow('当前在场人数', 'worker-current', '0'));
        workerCard.body.appendChild(this._makeRow('累计人数', 'worker-total', '0'));
        panel.appendChild(workerCard.root);

        // ---- 今日报警卡片 ----
        const alertCard = this._makeCard('今日报警');
        alertCard.body.appendChild(this._makeRow('报警总数', 'alert-total', '0', 'num-danger'));
        alertCard.body.appendChild(this._makeRow('未戴安全帽', 'alert-no_helmet', '0'));
        alertCard.body.appendChild(this._makeRow('未穿反光衣', 'alert-no_vest', '0'));
        alertCard.body.appendChild(this._makeRow('吸烟检测', 'alert-smoke', '0'));
        alertCard.body.appendChild(this._makeRow('区域入侵', 'alert-intrusion', '0'));
        alertCard.body.appendChild(this._makeRow('人员跌倒', 'alert-fall', '0'));
        panel.appendChild(alertCard.root);

        // ---- 风险等级卡片 ----
        const riskCard = this._makeCard('当前风险等级');
        const riskText = document.createElement('div');
        riskText.className = 'risk-text';
        riskText.id = 'risk-text';
        riskText.textContent = '低';
        riskText.style.color = CONFIG.colors.success;
        const riskBar = document.createElement('div');
        riskBar.className = 'risk-bar';
        const riskFill = document.createElement('div');
        riskFill.className = 'risk-fill';
        riskFill.id = 'risk-fill';
        riskBar.appendChild(riskFill);
        riskCard.body.appendChild(riskText);
        riskCard.body.appendChild(riskBar);
        panel.appendChild(riskCard.root);

        document.body.appendChild(panel);

        // 缓存引用
        this.els.aiTotal = aiCard.body.querySelector('#ai-total');
        this.els.aiSpeed = aiCard.body.querySelector('#ai-speed');
        this.els.workerCurrent = workerCard.body.querySelector('#worker-current');
        this.els.workerTotal = workerCard.body.querySelector('#worker-total');
        this.els.alertTotal = alertCard.body.querySelector('#alert-total');
        this.els.alertCounts = {
            no_helmet: alertCard.body.querySelector('#alert-no_helmet'),
            no_vest: alertCard.body.querySelector('#alert-no_vest'),
            smoke: alertCard.body.querySelector('#alert-smoke'),
            intrusion: alertCard.body.querySelector('#alert-intrusion'),
            fall: alertCard.body.querySelector('#alert-fall'),
        };
        this.els.riskText = riskText;
        this.els.riskFill = riskFill;
    }

    // ==================== 右侧面板 ====================

    /**
     * 创建右侧面板：视频监控 / 摄像头列表 / AI 识别结果 / 实时事件
     * @private
     */
    _createRightPanel() {
        const panel = document.createElement('div');
        panel.id = 'right-panel';
        panel.className = 'glass-panel';

        // ---- 视频监控面板 ----
        const videoCard = this._makeCard('视频监控');
        const videoWrap = document.createElement('div');
        videoWrap.className = 'video-wrap';
        const img = document.createElement('img');
        img.id = 'video-img';
        img.alt = '等待视频流...';
        img.src = '';
        const videoName = document.createElement('div');
        videoName.className = 'video-name';
        const vNameLeft = document.createElement('span');
        vNameLeft.id = 'video-name';
        vNameLeft.textContent = '未连接';
        const vNameRight = document.createElement('span');
        vNameRight.textContent = '● LIVE';
        vNameRight.style.color = CONFIG.colors.danger;
        videoName.appendChild(vNameLeft);
        videoName.appendChild(vNameRight);
        videoWrap.appendChild(img);
        videoWrap.appendChild(videoName);
        videoCard.body.appendChild(videoWrap);
        panel.appendChild(videoCard.root);

        // ---- 摄像头列表（2x2 网格） ----
        const camCard = this._makeCard('摄像头列表');
        const camGrid = document.createElement('div');
        camGrid.className = 'cam-grid';
        // 遍历 CONFIG.cameras 创建按钮
        CONFIG.cameras.forEach((cam) => {
            const btn = document.createElement('button');
            btn.className = 'cam-btn';
            btn.dataset.cameraId = cam.id;
            btn.textContent = cam.name;
            btn.addEventListener('click', () => this._onSelectCamera(cam.id));
            camGrid.appendChild(btn);
        });
        camCard.body.appendChild(camGrid);

        // 视频源导入：选择摄像头 ID + 填写 source（文件路径 / RTSP / 摄像头索引）
        const importWrap = document.createElement('div');
        importWrap.style.cssText = 'margin-top:10px;display:flex;flex-direction:column;gap:6px;';

        const importTitle = document.createElement('div');
        importTitle.style.cssText = `font-size:11px;color:${CONFIG.colors.textSecondary};letter-spacing:1px;`;
        importTitle.textContent = '导入视频源';
        importWrap.appendChild(importTitle);

        // 第一行：摄像头 ID 下拉 + source 输入框
        const row1 = document.createElement('div');
        row1.style.cssText = 'display:flex;gap:6px;';
        const camSelect = document.createElement('select');
        camSelect.id = 'import-cam-id';
        camSelect.style.cssText = `flex:0 0 70px;background:${CONFIG.colors.bgPanelSolid};border:1px solid ${CONFIG.colors.border};color:${CONFIG.colors.textPrimary};border-radius:4px;padding:4px;font-size:12px;`;
        CONFIG.cameras.forEach((cam) => {
            const opt = document.createElement('option');
            opt.value = cam.id;
            opt.textContent = `Cam${cam.id}`;
            camSelect.appendChild(opt);
        });
        const sourceInput = document.createElement('input');
        sourceInput.id = 'import-source';
        sourceInput.placeholder = '路径/RTSP/摄像头索引';
        sourceInput.style.cssText = `flex:1;background:${CONFIG.colors.bgPanelSolid};border:1px solid ${CONFIG.colors.border};color:${CONFIG.colors.textPrimary};border-radius:4px;padding:4px 6px;font-size:12px;outline:none;`;
        sourceInput.addEventListener('focus', () => { sourceInput.style.borderColor = CONFIG.colors.accent; });
        sourceInput.addEventListener('blur', () => { sourceInput.style.borderColor = CONFIG.colors.border; });
        row1.appendChild(camSelect);
        row1.appendChild(sourceInput);
        importWrap.appendChild(row1);

        // 第二行：添加 / 移除按钮 + 提示
        const row2 = document.createElement('div');
        row2.style.cssText = 'display:flex;gap:6px;';
        const addBtn = document.createElement('button');
        addBtn.textContent = '添加视频源';
        addBtn.style.cssText = `flex:1;background:rgba(74,158,216,0.2);border:1px solid ${CONFIG.colors.accent};color:${CONFIG.colors.accent};border-radius:4px;padding:5px;font-size:12px;cursor:pointer;transition:all 0.2s;`;
        addBtn.addEventListener('mouseenter', () => { addBtn.style.background = 'rgba(74,158,216,0.35)'; });
        addBtn.addEventListener('mouseleave', () => { addBtn.style.background = 'rgba(74,158,216,0.2)'; });
        addBtn.addEventListener('click', () => this._onAddVideoSource());
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '移除';
        removeBtn.style.cssText = `flex:0 0 60px;background:rgba(200,74,106,0.15);border:1px solid ${CONFIG.colors.danger};color:${CONFIG.colors.danger};border-radius:4px;padding:5px;font-size:12px;cursor:pointer;transition:all 0.2s;`;
        removeBtn.addEventListener('mouseenter', () => { removeBtn.style.background = 'rgba(200,74,106,0.3)'; });
        removeBtn.addEventListener('mouseleave', () => { removeBtn.style.background = 'rgba(200,74,106,0.15)'; });
        removeBtn.addEventListener('click', () => this._onRemoveVideoSource());
        row2.appendChild(addBtn);
        row2.appendChild(removeBtn);
        importWrap.appendChild(row2);

        const importHint = document.createElement('div');
        importHint.id = 'import-hint';
        importHint.style.cssText = 'font-size:10px;color:#5a7a9a;margin-top:2px;min-height:14px;';
        importWrap.appendChild(importHint);

        camCard.body.appendChild(importWrap);
        panel.appendChild(camCard.root);

        // ---- AI 识别结果 ----
        const aiResultCard = this._makeCard('AI 识别结果');
        const aiList = document.createElement('div');
        aiList.className = 'ui-list';
        aiList.id = 'ai-results-list';
        aiResultCard.body.appendChild(aiList);
        panel.appendChild(aiResultCard.root);

        // ---- 实时事件列表（报警事件流） ----
        const eventCard = this._makeCard('实时事件');
        const eventList = document.createElement('div');
        eventList.className = 'ui-list';
        eventList.id = 'event-list';
        eventCard.body.appendChild(eventList);
        panel.appendChild(eventCard.root);

        document.body.appendChild(panel);

        // 缓存引用
        this.els.videoImg = img;
        this.els.videoName = vNameLeft;
        this.els.camButtons = camGrid;
        this.els.aiResultsList = aiList;
        this.els.eventList = eventList;
    }

    // ==================== 底部面板 ====================

    /**
     * 创建底部面板：图表容器（给 ChartManager）+ 系统状态
     * @private
     */
    _createBottomPanel() {
        const panel = document.createElement('div');
        panel.id = 'bottom-panel';
        panel.className = 'glass-panel';

        // 三个图表容器单元（ChartManager 会在内部创建具体 div）
        const chartTitles = ['报警趋势', '人员数量', '安全帽佩戴率'];
        chartTitles.forEach((t, i) => {
            const cell = document.createElement('div');
            cell.className = 'chart-cell';
            const title = document.createElement('div');
            title.className = 'chart-cell-title';
            title.textContent = t;
            // 用 body 容器自适应剩余高度，避免固定 px 导致溢出
            const body = document.createElement('div');
            body.className = 'chart-cell-body';
            const chartDiv = document.createElement('div');
            // 给 ChartManager 用的容器 ID
            chartDiv.id = ['chart-alert', 'chart-workers', 'chart-helmet'][i];
            chartDiv.style.width = '100%';
            chartDiv.style.height = '100%';
            body.appendChild(chartDiv);
            cell.appendChild(title);
            cell.appendChild(body);
            panel.appendChild(cell);
        });

        // 系统状态：FPS + 延迟
        const sys = document.createElement('div');
        sys.className = 'sys-status';
        const sysTitle = document.createElement('div');
        sysTitle.className = 'card-title';
        sysTitle.style.marginBottom = '4px';
        sysTitle.textContent = '系统状态';

        const fpsRow = document.createElement('div');
        fpsRow.className = 'sys-row';
        const fpsLab = document.createElement('span');
        fpsLab.textContent = 'FPS';
        const fpsVal = document.createElement('span');
        fpsVal.className = 'mono num-accent';
        fpsVal.id = 'sys-fps';
        fpsVal.textContent = '0';
        fpsRow.appendChild(fpsLab);
        fpsRow.appendChild(fpsVal);

        const latRow = document.createElement('div');
        latRow.className = 'sys-row';
        const latLab = document.createElement('span');
        latLab.textContent = '延迟';
        const latVal = document.createElement('span');
        latVal.className = 'mono num-accent';
        latVal.id = 'sys-latency';
        latVal.textContent = '0 ms';
        latRow.appendChild(latLab);
        latRow.appendChild(latVal);

        sys.appendChild(sysTitle);
        sys.appendChild(fpsRow);
        sys.appendChild(latRow);
        panel.appendChild(sys);

        document.body.appendChild(panel);

        // 缓存引用
        this.els.sysFps = fpsVal;
        this.els.sysLatency = latVal;
    }

    // ==================== DOM 辅助方法 ====================

    /**
     * 创建一张卡片（标题 + 内容容器）
     * @param {string} title 卡片标题
     * @returns {{root: HTMLElement, body: HTMLElement}}
     * @private
     */
    _makeCard(title) {
        const root = document.createElement('div');
        root.className = 'ui-card';
        const titleEl = document.createElement('div');
        titleEl.className = 'card-title';
        titleEl.textContent = title;
        const body = document.createElement('div');
        root.appendChild(titleEl);
        root.appendChild(body);
        return { root, body };
    }

    /**
     * 创建一行（标签 + 数值）
     * @param {string} label 标签文字
     * @param {string} id 数值元素 ID
     * @param {string} initVal 初始值
     * @param {string} extraClass 额外类名
     * @returns {HTMLElement}
     * @private
     */
    _makeRow(label, id, initVal, extraClass = '') {
        const row = document.createElement('div');
        row.className = 'card-row';
        const lab = document.createElement('span');
        lab.className = 'card-label';
        lab.textContent = label;
        const val = document.createElement('span');
        val.className = 'card-value ' + extraClass;
        val.id = id;
        val.textContent = initVal;
        row.appendChild(lab);
        row.appendChild(val);
        return row;
    }

    /**
     * 触发数字滚动动画（短暂放大变色后恢复）
     * @param {HTMLElement} el 数值元素
     * @private
     */
    _rollNumber(el) {
        if (!el) return;
        el.classList.add('roll');
        setTimeout(() => el.classList.remove('roll'), 300);
    }

    // ==================== 对外 API ====================

    /**
     * 添加报警到报警面板（实时事件列表）
     * @param {string} time 时间字符串
     * @param {string} type 报警类型（no_helmet / no_vest / smoke / intrusion / fall / fire）
     * @param {string} cameraName 摄像头名称
     * @param {Function} onClick 点击回调
     */
    addAlert(time, type, cameraName, onClick) {
        const list = this.els.eventList;
        if (!list) return;

        const item = document.createElement('div');
        item.className = 'alert-item';

        // 报警类型中文标签（取自 CONFIG.alert.labels，未知则原样显示）
        const label = (CONFIG.alert.labels && CONFIG.alert.labels[type]) || type;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'alert-time';
        timeSpan.textContent = time;

        const typeSpan = document.createElement('span');
        typeSpan.className = 'alert-type';
        typeSpan.textContent = `[${label}]`;
        // 按类型上色
        const typeColor = CONFIG.alert.colors && CONFIG.alert.colors[type];
        if (typeColor !== undefined) {
            typeSpan.style.color = '#' + typeColor.toString(16).padStart(6, '0');
        }

        const camSpan = document.createElement('span');
        camSpan.className = 'alert-cam';
        camSpan.textContent = ` ${cameraName}`;

        item.appendChild(timeSpan);
        item.appendChild(typeSpan);
        item.appendChild(camSpan);

        if (typeof onClick === 'function') {
            item.addEventListener('click', onClick);
        }

        // 新报警插入到顶部
        list.insertBefore(item, list.firstChild);

        // 限制最多保留 30 条
        while (list.children.length > 30) {
            list.removeChild(list.lastChild);
        }
    }

    /**
     * 更新统计数字
     * @param {object} stats { total, no_helmet, no_vest, smoke, intrusion, fall }
     */
    updateStats(stats) {
        // 报警总数
        if (stats.total !== undefined) {
            this._setText(this.els.alertTotal, stats.total);
            this._rollNumber(this.els.alertTotal);
            // AI 检测统计卡的总检测次数同步显示
            this._setText(this.els.aiTotal, stats.total);
        }
        // 各类型分布
        ['no_helmet', 'no_vest', 'smoke', 'intrusion', 'fall'].forEach((key) => {
            if (stats[key] !== undefined && this.els.alertCounts[key]) {
                this._setText(this.els.alertCounts[key], stats[key]);
            }
        });
        // 根据总数刷新风险等级
        this._updateRiskLevel(stats.total || 0);
    }

    /**
     * 根据报警总数计算并刷新风险等级
     * 低 / 中 / 高 / 极高，带颜色与进度条
     * @param {number} total 报警总数
     * @private
     */
    _updateRiskLevel(total) {
        const c = CONFIG.colors;
        let level, color, percent;
        if (total <= 5) {
            level = '低'; color = c.success; percent = 25;
        } else if (total <= 15) {
            level = '中'; color = c.warning; percent = 50;
        } else if (total <= 30) {
            level = '高'; color = c.warningGlow; percent = 75;
        } else {
            level = '极高'; color = c.danger; percent = 100;
        }
        if (this.els.riskText) {
            this.els.riskText.textContent = level;
            this.els.riskText.style.color = color;
        }
        if (this.els.riskFill) {
            this.els.riskFill.style.width = percent + '%';
            this.els.riskFill.style.background = color;
        }
    }

    /**
     * 更新视频画面
     * @param {string} frameData 视频帧数据（base64 / URL）
     * @param {string} cameraName 摄像头名称
     */
    updateVideoFrame(frameData, cameraName) {
        if (this.els.videoImg) {
            if (frameData) {
                this.els.videoImg.src = frameData;
            } else {
                // 空数据：清除画面，避免残留或 broken image
                this.els.videoImg.removeAttribute('src');
                this.els.videoImg.alt = '无视频信号';
            }
        }
        if (this.els.videoName && cameraName) {
            this.els.videoName.textContent = cameraName;
        }
    }

    /**
     * 更新 WebSocket 连接状态
     * @param {boolean} connected 是否已连接
     */
    updateConnectionStatus(connected) {
        if (!this.els.wsDot) return;
        if (connected) {
            this.els.wsDot.className = 'status-dot online';
            this.els.wsText.textContent = 'WS 在线';
            this.els.wsText.style.color = CONFIG.colors.success;
        } else {
            this.els.wsDot.className = 'status-dot offline';
            this.els.wsText.textContent = 'WS 离线';
            this.els.wsText.style.color = CONFIG.colors.danger;
        }
    }

    /**
     * 更新 FPS 显示（顶部 + 底部系统状态同步）
     * @param {number} fps 帧率
     */
    updateFPS(fps) {
        const text = String(Math.round(fps));
        this._setText(this.els.topFps, text);
        this._setText(this.els.sysFps, text);
        // FPS 低于阈值时变红警示
        const warn = CONFIG.fps.warnThreshold;
        const isLow = warn && fps < warn;
        if (this.els.topFps) this.els.topFps.style.color = isLow ? CONFIG.colors.danger : CONFIG.colors.accent;
        if (this.els.sysFps) this.els.sysFps.style.color = isLow ? CONFIG.colors.danger : CONFIG.colors.accent;
    }

    /**
     * 更新延迟显示（底部系统状态）
     * @param {number} ms 延迟毫秒数
     */
    updateLatency(ms) {
        this._setText(this.els.sysLatency, `${Math.round(ms)} ms`);
        // 延迟过高变红
        if (this.els.sysLatency) {
            this.els.sysLatency.style.color = ms > 200 ? CONFIG.colors.danger : CONFIG.colors.accent;
        }
    }

    /**
     * 更新顶部时间（实时）
     */
    updateTime() {
        if (!this.els.timeDisplay) return;
        const now = new Date();
        // 格式：YYYY-MM-DD HH:mm:ss
        const pad = (n) => String(n).padStart(2, '0');
        const str = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
                    `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        this.els.timeDisplay.textContent = str;
    }

    /**
     * 更新 AI 运行状态
     * @param {boolean} running AI 是否运行中
     */
    updateAIStatus(running) {
        if (!this.els.aiDot) return;
        if (running) {
            this.els.aiDot.className = 'status-dot ai-on';
            this.els.aiText.textContent = 'AI 运行中';
            this.els.aiText.style.color = CONFIG.colors.accent;
        } else {
            this.els.aiDot.className = 'status-dot ai-off';
            this.els.aiText.textContent = 'AI 待机';
            this.els.aiText.style.color = CONFIG.colors.textSecondary;
        }
    }

    /**
     * 订阅 UI 事件
     * 支持事件：'selectCamera'
     * @param {string} event 事件名
     * @param {Function} callback 回调函数
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    /**
     * 触发 UI 事件
     * @param {string} event 事件名
     * @param  {...any} args 参数
     * @private
     */
    _emit(event, ...args) {
        const cbs = this.listeners.get(event);
        if (cbs) {
            cbs.forEach((cb) => {
                try {
                    cb(...args);
                } catch (err) {
                    console.error(`UIManager [${event}] 回调异常:`, err);
                }
            });
        }
    }

    /**
     * 摄像头按钮点击处理：再次点击同一摄像头则取消选中（toggle）
     * @param {number} cameraId 摄像头 ID
     * @private
     */
    _onSelectCamera(cameraId) {
        // 再次点击已选中摄像头 → 取消选中
        if (this.selectedCameraId === cameraId) {
            this.selectedCameraId = null;
            if (this.els.camButtons) {
                this.els.camButtons.querySelectorAll('.cam-btn').forEach((b) => {
                    b.classList.remove('selected');
                });
            }
            // 触发取消事件（cameraId 为 null 表示取消选择）
            this._emit('selectCamera', null);
            return;
        }
        // 切换到新摄像头
        this.selectedCameraId = cameraId;
        if (this.els.camButtons) {
            this.els.camButtons.querySelectorAll('.cam-btn').forEach((b) => {
                if (Number(b.dataset.cameraId) === cameraId) {
                    b.classList.add('selected');
                } else {
                    b.classList.remove('selected');
                }
            });
        }
        this._emit('selectCamera', cameraId);
    }

    /**
     * 添加视频源：读取下拉框 ID + 输入框 source，POST 到后端 /api/videos/add
     * 支持 source 格式：文件路径(data/videos/demo.mp4) / RTSP 地址 / 摄像头索引(0/1)
     * @private
     */
    async _onAddVideoSource() {
        const camIdEl = document.getElementById('import-cam-id');
        const sourceEl = document.getElementById('import-source');
        const hintEl = document.getElementById('import-hint');
        if (!camIdEl || !sourceEl) return;

        const cameraId = Number(camIdEl.value);
        const source = sourceEl.value.trim();
        if (!source) {
            this._setImportHint(hintEl, '请填写视频源', 'warn');
            return;
        }

        this._setImportHint(hintEl, '正在添加...', 'info');
        try {
            // URL 编码 source，避免特殊字符/中文路径问题
            const url = `${CONFIG.api.base}/api/videos/add?camera_id=${cameraId}&source=${encodeURIComponent(source)}`;
            const resp = await fetch(url, { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                this._setImportHint(hintEl, `Cam${cameraId} 视频源添加成功`, 'success');
                sourceEl.value = '';
            } else {
                this._setImportHint(hintEl, `失败：${data.error || '未知错误'}`, 'error');
            }
        } catch (err) {
            this._setImportHint(hintEl, `请求失败：${err.message}`, 'error');
        }
    }

    /**
     * 移除视频源：POST 到后端 /api/videos/remove
     * @private
     */
    async _onRemoveVideoSource() {
        const camIdEl = document.getElementById('import-cam-id');
        const hintEl = document.getElementById('import-hint');
        if (!camIdEl) return;

        const cameraId = Number(camIdEl.value);
        this._setImportHint(hintEl, '正在移除...', 'info');
        try {
            const url = `${CONFIG.api.base}/api/videos/remove?camera_id=${cameraId}`;
            const resp = await fetch(url, { method: 'POST' });
            const data = await resp.json();
            if (data.success) {
                this._setImportHint(hintEl, `Cam${cameraId} 视频源已移除`, 'success');
            } else {
                this._setImportHint(hintEl, `失败：${data.error || '未知错误'}`, 'error');
            }
        } catch (err) {
            this._setImportHint(hintEl, `请求失败：${err.message}`, 'error');
        }
    }

    /**
     * 设置导入提示文本与颜色
     * @param {HTMLElement} el 提示元素
     * @param {string} text 文本
     * @param {string} type info/success/warn/error
     * @private
     */
    _setImportHint(el, text, type) {
        if (!el) return;
        el.textContent = text;
        const colorMap = {
            info: CONFIG.colors.textSecondary,
            success: CONFIG.colors.success,
            warn: CONFIG.colors.warning,
            error: CONFIG.colors.danger,
        };
        el.style.color = colorMap[type] || CONFIG.colors.textSecondary;
    }

    /**
     * 安全设置元素文本内容
     * @param {HTMLElement} el 元素
     * @param {string|number} text 文本
     * @private
     */
    _setText(el, text) {
        if (el) el.textContent = text;
    }
}

export default UIManager;

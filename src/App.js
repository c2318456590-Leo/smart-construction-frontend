/**
 * App.js — 企业级数字孪生监控平台 主入口
 * 整合所有模块：场景、管理器、UI、通信
 */

import * as THREE from 'three';
import { CONFIG } from './config/Config.js';
import { SceneManager } from './scene/SceneManager.js';
import { CameraManager } from './managers/CameraManager.js';
import { WorkerManager } from './managers/WorkerManager.js';
import { AlertManager } from './managers/AlertManager.js';
import { WSManager } from './managers/WSManager.js';
import { UIManager } from './ui/UIManager.js';
import { ChartManager } from './ui/ChartManager.js';

import {
    createSiteGround,
    createBuilding,
    createCrane,
    createDangerZone,
    createRadarScan,
    createParticleSystem,
} from './models/Models.js';

class App {
    constructor() {
        this.canvas = document.getElementById('c');
        this.clock = new THREE.Clock();
        this.fps = { frames: 0, lastTime: 0, value: 60 };
        this._timers = new Set();
        this._animationFrame = null;
        this._resizeHandler = null;
        this._connectTimer = null;
        this._destroyed = false;
        this._dangerZones = CONFIG.dangerZones;

        // 延迟初始化，等待 DOM
        this._init();
    }

    async _init() {
        try {
            // 1. 初始化 UI（先于场景，因为面板需要先创建）
            this.ui = new UIManager();
            this.ui.init();
            this.charts = new ChartManager();
            await this.charts.init();

            // 2. 初始化 3D 场景
            this.sceneMgr = new SceneManager(this.canvas);
            this.scene = this.sceneMgr.scene;
            this.camera = this.sceneMgr.camera;
            this.renderer = this.sceneMgr.renderer;

            // 3. 构建工地场景
            await this._loadDangerZones();
            this._buildSite();

            // 4. 初始化管理器
            this.cameraMgr = new CameraManager(this.scene, this.camera, this.sceneMgr.controls);
            this.cameraMgr.init();
            // 记录初始相机视角（用于再次点击摄像头时恢复）
            this.cameraMgr.saveDefaultView();

            this.workerMgr = new WorkerManager(this.scene);
            this.alertMgr = new AlertManager(this.scene);

            // 5. 初始化 WebSocket
            this.ws = new WSManager();
            this._bindWS();

            // 6. 绑定 UI 事件
            this._bindUI();

            // 7. 启动循环
            this._startLoop();

            // 8. 启动定时器
            this._startTimers();

            console.log('[App] 数字孪生监控平台初始化完成');
        } catch (err) {
            console.error('[App] 初始化失败:', err);
            // 在页面显示错误信息，方便排查
            const errDiv = document.createElement('div');
            errDiv.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a0a1a;color:#ff6688;padding:20px 30px;border:1px solid #ff3366;border-radius:8px;font-family:monospace;font-size:13px;max-width:80vw;white-space:pre-wrap;z-index:9999;';
            errDiv.textContent = '初始化失败: ' + (err && err.message ? err.message : err);
            document.body.appendChild(errDiv);
        } finally {
            // 无论成功失败都移除 loading
            const loading = document.getElementById('loading');
            if (loading) loading.remove();
        }
    }

    /** 构建工地场景：地面、建筑、塔吊、危险区域、雷达、粒子 */
    _buildSite() {
        // 地面
        const ground = createSiteGround(CONFIG.scene.size);
        this.scene.add(ground);

        // 建筑
        CONFIG.buildings.forEach(cfg => {
            const b = createBuilding(cfg);
            this.scene.add(b);
        });

        // 塔吊
        CONFIG.cranes.forEach(cfg => {
            const c = createCrane(cfg);
            this.scene.add(c);
        });

        // 危险区域
        this._dangerZones.forEach(cfg => {
            const z = createDangerZone(cfg);
            this.scene.add(z);
        });

        // 雷达扫描
        this.radar = createRadarScan(CONFIG.radar);
        this.scene.add(this.radar);

        // 粒子系统
        this.particles = createParticleSystem(CONFIG.particles);
        this.scene.add(this.particles);
    }

    /** 绑定 WebSocket 事件 */
    _bindWS() {
        this.ws.on('open', () => {
            this.ui.updateConnectionStatus(true);
            this.ui.updateAIStatus(true);
        });

        this.ws.on('close', () => {
            this.ui.updateConnectionStatus(false);
            this.ui.updateAIStatus(false);
        });

        // 报警事件
        this.ws.on('event', (data) => {
            const camId = data.camera_id || this.cameraMgr.currentId;
            // addAlert 带节流去重，返回 null 表示节流命中（已有同类报警在显示）
            const alertObj = this.alertMgr.addAlert(data.x, data.z, data.event, camId);
            if (alertObj === null) return; // 节流命中：跳过后续 UI 更新，避免事件列表刷屏

            this.cameraMgr.triggerAlert(camId, data.event);

            const cam = this.cameraMgr.cameras.get(camId);
            const camName = cam ? cam.config.name : `Cam ${camId}`;
            const time = new Date().toTimeString().split(' ')[0];
            this.ui.addAlert(time, data.event, camName, () => {
                this.cameraMgr.selectCamera(camId);
            });

            this._updateStats();
        });

        // 工人追踪
        this.ws.on('track', (data) => {
            if (data.workers) {
                this.workerMgr.update(data.workers);
            } else if (data.x !== undefined) {
                this.workerMgr.updateSingle(data.x, data.z);
            }
        });

        // 视频帧
        this.ws.on('video_frame', (data) => {
            const cam = this.cameraMgr.cameras.get(data.camera_id);
            const camName = cam ? cam.config.name : `Cam ${data.camera_id}`;
            this.ui.updateVideoFrame(data.frame, camName);
        });

        // 其他摄像头报警
        this.ws.on('alert_from_camera', (data) => {
            this.cameraMgr.triggerAlert(data.camera_id, data.alert_type);
            const cam = this.cameraMgr.cameras.get(data.camera_id);
            if (cam) {
                const time = new Date().toTimeString().split(' ')[0];
                this.ui.addAlert(time, data.alert_type, cam.config.name, () => {
                    this.cameraMgr.selectCamera(data.camera_id);
                });
            }
        });

        // 连接（默认不自动连接，等用户选择摄像头或开启演示模式）
        // this.ws.connect(1);  // 注释掉：无视频源时不应疯狂重连
    }

    /** 绑定 UI 事件 */
    _bindUI() {
        this.ui.on('selectCamera', (camId) => {
            // camId 为 null 表示用户取消选中：恢复初始视角 + 断开 WS
            if (camId === null) {
                this.cameraMgr.restoreView();  // 飞回默认视角
                if (this.ws.connected) {
                    this.ws.disconnect();
                }
                this.ui.updateVideoFrame('', '未连接');
                this.ui.updateConnectionStatus(false);
                this.ui.updateAIStatus(false);
                return;
            }
            // 切换到新摄像头：关闭演示模式（真实视频优先）
            if (this.ui.demoMode) {
                this._stopDemo();
                this.ui.setDemoMode(false, false);
            }
            // 切换摄像头
            this.cameraMgr.selectCamera(camId);
            // 重新连接 WebSocket 获取新视频源
            if (this.ws.connected) {
                this.ws.disconnect();
                this._connectTimer = setTimeout(() => {
                    this._connectTimer = null;
                    if (!this._destroyed) this.ws.connect(camId);
                }, 500);
            } else {
                this.ws.connect(camId);
            }
        });

        // 演示模式切换
        this.ui.on('toggleDemo', (on) => {
            if (on) {
                this._startDemo();
            } else {
                this._stopDemo();
            }
        });
    }

    /**
     * 启动演示模式：断开 WS，用模拟信号驱动场景
     * - 模拟工人移动（多工人）
     * - 适度报警（每 6~10 秒一次，循环不断）
     * - 模拟视频帧（占位画面）
     */
    _startDemo() {
        if (this._demoTimer) {
            clearInterval(this._demoTimer);
            this._timers.delete(this._demoTimer);
        }
        // 若 WS 已连接，先断开（演示模式不连真实后端）
        if (this.ws.connected) {
            this.ws.disconnect();
        }
        this.ui.updateConnectionStatus(false);
        this.ui.updateAIStatus(true);   // 演示模式下 AI 标记为运行
        this.ui.updateVideoFrame('', '演示模式 · 模拟信号');

        // 演示模式状态
        this._demoActive = true;
        this._demoWorkers = [
            { id: 'DW001', phase: 0, helmet: true },
            { id: 'DW002', phase: 1.5, helmet: true },
            { id: 'DW003', phase: 3.2, helmet: false },
        ];

        // 模拟工人移动 + 报警（每 1.5 秒更新一次）
        this._demoTimer = setInterval(() => {
            if (!this._demoActive) return;
            const t = Date.now() * 0.0005;
            const workersData = this._demoWorkers.map((w) => {
                const x = Math.sin(t + w.phase) * 45 + (w.phase * 5);
                const z = Math.cos(t * 0.8 + w.phase) * 35;
                return { id: w.id, x, z, helmet: w.helmet };
            });
            this.workerMgr.update(workersData);

            // 每 4~6 次更新触发一次报警（约 6~9 秒一次）
            this._demoTick = (this._demoTick || 0) + 1;
            if (this._demoTick % 4 === 0) {
                const w = workersData[Math.floor(Math.random() * workersData.length)];
                // 无安全帽的工人触发 no_helmet，否则随机事件
                const events = ['smoke', 'intrusion', 'fall'];
                const evt = w.helmet === false ? 'no_helmet' : events[Math.floor(Math.random() * events.length)];
                this.alertMgr.addAlert(w.x, w.z, evt, 1);
                this.cameraMgr.triggerAlert(1, evt);
                const time = new Date().toTimeString().split(' ')[0];
                this.ui.addAlert(time, evt, '演示模式', null);
                this._updateStats();
            }
        }, 1500);
        this._timers.add(this._demoTimer);
    }

    /** 停止演示模式：清除定时器与状态 */
    _stopDemo() {
        this._demoActive = false;
        if (this._demoTimer) {
            clearInterval(this._demoTimer);
            this._timers.delete(this._demoTimer);
            this._demoTimer = null;
        }
        this.ui.updateAIStatus(false);
        this.ui.updateVideoFrame('', '未连接');
    }

    /** 更新统计数据 */
    _updateStats() {
        const stats = this.alertMgr.getStats();
        this.ui.updateStats(stats);
    }

    /** 主动画循环 */
    _startLoop() {
        const animate = () => {
            if (this._destroyed) return;
            this._animationFrame = requestAnimationFrame(animate);
            const delta = this.clock.getDelta();
            const elapsed = this.clock.getElapsedTime();

            // 场景更新（含后处理渲染）
            this.sceneMgr.update(delta, elapsed);

            // 摄像头管理器更新
            this.cameraMgr.update(delta);
            this.cameraMgr.updateLabels(this.camera, this.renderer);

            // 报警特效更新
            this.alertMgr.update(delta, elapsed * 1000); // elapsed 转毫秒
            this.alertMgr.setLabelPosition(this.camera, this.renderer);

            // 雷达旋转
            if (this.radar) {
                this.radar.rotation.y += CONFIG.radar.speed;
            }

            // 粒子动画
            if (this.particles) {
                const pos = this.particles.geometry.attributes.position;
                const arr = pos.array;
                for (let i = 0; i < arr.length; i += 3) {
                    arr[i + 1] += CONFIG.particles.speed;
                    if (arr[i + 1] > CONFIG.particles.range / 2) {
                        arr[i + 1] = -CONFIG.particles.range / 2;
                    }
                }
                pos.needsUpdate = true;
            }

            // FPS 计算
            this._calcFPS(elapsed);
        };
        animate();
    }

    /** FPS 计算与更新 */
    _calcFPS(elapsed) {
        this.fps.frames++;
        if (elapsed - this.fps.lastTime >= 0.5) {
            this.fps.value = Math.round(this.fps.frames / (elapsed - this.fps.lastTime));
            this.fps.frames = 0;
            this.fps.lastTime = elapsed;
            this.ui.updateFPS(this.fps.value);
            this.charts.pushFPSData(new Date().toTimeString().split(' ')[0], this.fps.value);
        }
    }

    /** 定时器：图表更新与窗口缩放 */
    _startTimers() {
        // 图表数据更新
        const chartTimer = setInterval(() => {
            const stats = this.alertMgr.getStats();
            const time = new Date().toTimeString().split(' ')[0];

            // 报警趋势
            this.charts.pushAlertData(time, stats.total);

            // 人员数量
            this.charts.pushWorkerData(time, this.workerMgr.count);

            // 安全帽佩戴率（模拟）
            const helmetRate = stats.no_helmet > 0
                ? Math.max(60, 100 - stats.no_helmet * 5)
                : 95 + Math.random() * 5;
            this.charts.pushHelmetRate(time, Math.round(helmetRate));

            // 延迟（模拟）
            const latency = 10 + Math.random() * 30;
            this.charts.pushLatencyData(time, Math.round(latency));
            this.ui.updateLatency(Math.round(latency));
        }, CONFIG.charts.refreshInterval);
        this._timers.add(chartTimer);

        // 窗口缩放
        this._resizeHandler = () => {
            this.sceneMgr.resize(window.innerWidth, window.innerHeight);
            this.charts.resize();
        };
        window.addEventListener('resize', this._resizeHandler);
    }

    async _loadDangerZones() {
        try {
            const resp = await fetch(`${CONFIG.api.base}${CONFIG.api.endpoints.zones}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            const zones = Array.isArray(data.danger_zones) ? data.danger_zones : [];
            if (zones.length > 0) {
                this._dangerZones = zones.map((zone) => this._normalizeDangerZone(zone));
            }
        } catch (err) {
            console.warn('[App] /api/zones 加载失败，使用前端 fallback 配置:', err);
            this._dangerZones = CONFIG.dangerZones;
        }
    }

    _normalizeDangerZone(zone) {
        const fallback = CONFIG.dangerZones.find((item) => item.id === zone.id) || {};
        const polygon = Array.isArray(zone.polygon) ? zone.polygon : fallback.polygon;
        if (!Array.isArray(polygon) || polygon.length < 3) {
            return { ...fallback, ...zone };
        }
        const xs = polygon.map((p) => p[0]);
        const zs = polygon.map((p) => p[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minZ = Math.min(...zs);
        const maxZ = Math.max(...zs);
        return {
            ...fallback,
            ...zone,
            polygon,
            x: minX,
            z: minZ,
            w: maxX - minX,
            d: maxZ - minZ,
            color: zone.color ?? fallback.color ?? 0xff3344,
        };
    }

    destroy() {
        this._destroyed = true;
        if (this._animationFrame) {
            cancelAnimationFrame(this._animationFrame);
            this._animationFrame = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        if (this._connectTimer) {
            clearTimeout(this._connectTimer);
            this._connectTimer = null;
        }
        this._timers.forEach((timer) => clearInterval(timer));
        this._timers.clear();
        this.ws?.disconnect();
        this.workerMgr?.clear();
        this.alertMgr?.clear();
        this.cameraMgr?.destroy();
        this.charts?.destroy();
        this.ui?.destroy();
    }
}

// 启动应用
window.addEventListener('DOMContentLoaded', () => {
    window.smartSiteApp = new App();
});

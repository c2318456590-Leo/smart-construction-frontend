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

        // 延迟初始化，等待 DOM
        this._init();
    }

    async _init() {
        // 1. 初始化 UI（先于场景，因为面板需要先创建）
        this.ui = new UIManager();
        this.ui.init();
        this.charts = new ChartManager();
        this.charts.init();

        // 2. 初始化 3D 场景
        this.sceneMgr = new SceneManager(this.canvas);
        this.scene = this.sceneMgr.scene;
        this.camera = this.sceneMgr.camera;
        this.renderer = this.sceneMgr.renderer;

        // 3. 构建工地场景
        this._buildSite();

        // 4. 初始化管理器
        this.cameraMgr = new CameraManager(this.scene, this.camera, this.sceneMgr.controls);
        this.cameraMgr.init();

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

        // 移除加载提示
        const loading = document.getElementById('loading');
        if (loading) loading.remove();
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
        CONFIG.dangerZones.forEach(cfg => {
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
            this.alertMgr.addAlert(data.x, data.z, data.event, camId);
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

        // 连接
        this.ws.connect(1);
    }

    /** 绑定 UI 事件 */
    _bindUI() {
        this.ui.on('selectCamera', (camId) => {
            // camId 为 null 表示用户取消选中：仅断开 WS，不重连
            if (camId === null) {
                this.cameraMgr.clearSelection();
                if (this.ws.connected) {
                    this.ws.disconnect();
                }
                this.ui.updateVideoFrame('', '未连接');
                this.ui.updateConnectionStatus(false);
                this.ui.updateAIStatus(false);
                return;
            }
            // 切换到新摄像头
            this.cameraMgr.selectCamera(camId);
            // 重新连接 WebSocket 获取新视频源
            if (this.ws.connected) {
                this.ws.disconnect();
                setTimeout(() => this.ws.connect(camId), 500);
            } else {
                this.ws.connect(camId);
            }
        });
    }

    /** 更新统计数据 */
    _updateStats() {
        const stats = this.alertMgr.getStats();
        this.ui.updateStats(stats);
    }

    /** 主动画循环 */
    _startLoop() {
        const animate = () => {
            requestAnimationFrame(animate);
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

    /** 定时器：时间更新、图表更新、模拟数据 */
    _startTimers() {
        // 每秒更新时间
        setInterval(() => {
            this.ui.updateTime();
        }, 1000);

        // 图表数据更新
        setInterval(() => {
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

        // 模拟数据（WebSocket 未连接时）
        setInterval(() => {
            if (this.ws && this.ws.connected) return;

            // 模拟工人移动
            const t = Date.now() * 0.0003;
            const x = Math.sin(t * 0.5) * 50;
            const z = Math.cos(t * 0.7) * 50;
            this.workerMgr.updateSingle(x, z);

            // 模拟随机报警
            if (Math.random() < 0.2) {
                const rx = (Math.random() - 0.5) * 100;
                const rz = (Math.random() - 0.5) * 100;
                const events = ['no_helmet', 'smoke', 'intrusion', 'fall'];
                const evt = events[Math.floor(Math.random() * events.length)];
                this.alertMgr.addAlert(rx, rz, evt, 1);
                this.cameraMgr.triggerAlert(1, evt);
                const time = new Date().toTimeString().split(' ')[0];
                this.ui.addAlert(time, evt, '主监控', null);
                this._updateStats();
            }
        }, 800);

        // 窗口缩放
        window.addEventListener('resize', () => {
            this.sceneMgr.resize(window.innerWidth, window.innerHeight);
            this.charts.resize();
        });
    }
}

// 启动应用
window.addEventListener('DOMContentLoaded', () => {
    new App();
});

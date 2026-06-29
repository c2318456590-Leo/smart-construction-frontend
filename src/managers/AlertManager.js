/**
 * AlertManager.js —— 报警特效管理器（工业数字孪生风格）
 * 每个报警包含以下视觉元素（统一放在一个 THREE.Group 中）：
 *   1. 发光柱：CylinderGeometry(0.3, 0.5, glowHeight)
 *   2. Pulse Ring：多个 RingGeometry 从小到大扩散
 *   3. 地面光圈：CircleGeometry(2)
 *   4. HTML 标签：显示报警类型，浮动在报警点上方
 */
import * as THREE from 'three';
import { CONFIG } from '../config/Config.js';

export class AlertManager {
    /**
     * @param {THREE.Scene} scene 场景
     */
    constructor(scene) {
        this.scene = scene;
        this.alerts = [];      // 报警特效数组
        this._elapsed = 0;     // 累计时间（毫秒），由 update 同步
        this._injectStyles();
    }

    /**
     * 添加报警特效
     * @param {number} x         世界坐标 X
     * @param {number} z         世界坐标 Z
     * @param {string} type      报警类型（no_helmet / no_vest / smoke / intrusion / fall / fire）
     * @param {string|null} cameraId 关联摄像头 id
     */
    addAlert(x, z, type, cameraId = null) {
        const color = (CONFIG.alert.colors && CONFIG.alert.colors[type] !== undefined)
            ? CONFIG.alert.colors[type]
            : 0xff3366;
        const labelText = (CONFIG.alert.labels && CONFIG.alert.labels[type]) || '未知报警';

        const group = new THREE.Group();
        group.name = `Alert_${type}_${Date.now()}`;
        group.position.set(x, 0, z);

        const glowHeight = CONFIG.alert.glowHeight;

        // 1. 发光柱
        const glow = new THREE.Mesh(
            new THREE.CylinderGeometry(0.3, 0.5, glowHeight, 24, 1, true),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.18,   // 原 0.6 → 降低 70%
                side: THREE.DoubleSide,
                depthWrite: false,
            })
        );
        glow.position.y = glowHeight / 2;
        group.add(glow);

        // 2. Pulse Ring（多个扩散环，错开相位）
        const rings = [];
        const ringCount = CONFIG.alert.pulseRings;
        for (let i = 0; i < ringCount; i++) {
            const ring = new THREE.Mesh(
                new THREE.RingGeometry(0.5, 0.7, 32),
                new THREE.MeshBasicMaterial({
                    color,
                    transparent: true,
                    opacity: 0.24,   // 原 0.8 → 降低 70%
                    side: THREE.DoubleSide,
                    depthWrite: false,
                })
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.y = 0.15;
            ring.userData.phaseOffset = i / ringCount; // 相位偏移（0 ~ 1）
            group.add(ring);
            rings.push(ring);
        }

        // 3. 地面光圈
        const ground = new THREE.Mesh(
            new THREE.CircleGeometry(2, 32),
            new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.09,   // 原 0.3 → 降低 70%
                side: THREE.DoubleSide,
                depthWrite: false,
            })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = 0.1;
        group.add(ground);

        // 4. HTML 标签（深红背景、白色文字、12px）
        const label = document.createElement('div');
        label.className = 'alert-label';
        label.textContent = labelText;
        document.body.appendChild(label);

        this.scene.add(group);

        const alert = {
            group, glow, rings, ground, label,
            type, cameraId, color, x, z,
            createdAt: this._elapsed,
            alive: true,
            fade: 1,
        };
        this.alerts.push(alert);

        // 限制最大报警数量，移除最早的
        while (this.alerts.length > CONFIG.alert.maxAlerts) {
            this._removeAlert(this.alerts[0]);
            this.alerts.shift();
        }

        return alert;
    }

    /**
     * 更新所有报警动画
     * @param {number} delta   帧间隔（秒，保留以匹配接口约定）
     * @param {number} elapsed 累计时间（毫秒）
     */
    update(delta, elapsed) {
        this._elapsed = elapsed;
        const pulseDur = CONFIG.alert.pulseDuration; // ms

        for (let i = this.alerts.length - 1; i >= 0; i--) {
            const a = this.alerts[i];
            if (!a.alive) {
                this.alerts.splice(i, 1);
                continue;
            }

            const age = elapsed - a.createdAt; // ms

            // Pulse Ring：scale 从 1 扩到 5，opacity 从 0.8 衰减到 0，循环
            a.rings.forEach((ring) => {
                const offset = ring.userData.phaseOffset * pulseDur;
                const t = ((elapsed + offset) % pulseDur) / pulseDur; // 0 ~ 1
                const scale = 1 + 4 * t;          // 1 -> 5
                const opacity = 0.24 * (1 - t);   // 原 0.8 → 降低 70%
                ring.scale.set(scale, scale, scale);
                ring.material.opacity = opacity * a.fade;
            });

            // 发光柱：opacity 呼吸闪烁（降低 70%）
            const breath = 0.5 + 0.5 * Math.sin(elapsed * 0.006);
            a.glow.material.opacity = (0.10 + 0.10 * breath) * a.fade;

            // 地面光圈：轻微呼吸（降低 70%）
            a.ground.material.opacity = (0.066 + 0.036 * Math.sin(elapsed * 0.004)) * a.fade;

            // 超过 fadeOutDuration 后渐隐并移除
            if (age > CONFIG.alert.fadeOutDuration) {
                const fadeTime = 1000; // ms 渐隐时长
                a.fade = Math.max(0, 1 - (age - CONFIG.alert.fadeOutDuration) / fadeTime);
                if (a.fade <= 0) {
                    this._removeAlert(a);
                    this.alerts.splice(i, 1);
                }
            }
        }
    }

    /**
     * 将报警标签投影到屏幕坐标
     * @param {THREE.Camera} camera
     * @param {THREE.WebGLRenderer} renderer
     */
    setLabelPosition(camera, renderer) {
        const w = (renderer && renderer.domElement)
            ? renderer.domElement.clientWidth
            : window.innerWidth;
        const h = (renderer && renderer.domElement)
            ? renderer.domElement.clientHeight
            : window.innerHeight;

        const v = new THREE.Vector3();
        const labelY = CONFIG.alert.glowHeight + CONFIG.alert.labelOffset;

        this.alerts.forEach((a) => {
            if (!a.alive || !a.label) return;
            v.set(a.x, labelY, a.z);
            v.project(camera);

            if (v.z < 1 && v.z > -1) {
                const x = (v.x * 0.5 + 0.5) * w;
                const y = (-v.y * 0.5 + 0.5) * h;
                a.label.style.left = `${x}px`;
                a.label.style.top = `${y}px`;
                a.label.style.display = 'block';
                a.label.style.opacity = String(a.fade);
            } else {
                a.label.style.display = 'none';
            }
        });
    }

    /** 统计各类型报警数量 */
    getStats() {
        const stats = { total: 0, no_helmet: 0, no_vest: 0, smoke: 0, intrusion: 0, fall: 0 };
        this.alerts.forEach((a) => {
            if (!a.alive) return;
            stats.total++;
            if (stats[a.type] !== undefined) stats[a.type]++;
        });
        return stats;
    }

    /** 清空所有报警 */
    clear() {
        while (this.alerts.length) {
            this._removeAlert(this.alerts.pop());
        }
    }

    // ===================== 内部方法 =====================

    /** 移除单个报警（从场景移除、释放资源、移除标签） */
    _removeAlert(a) {
        if (!a) return;
        a.alive = false;
        this.scene.remove(a.group);
        a.group.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((m) => m.dispose());
            }
        });
        if (a.label && a.label.parentNode) {
            a.label.parentNode.removeChild(a.label);
        }
    }

    /** 注入 .alert-label 样式（深红背景、白色文字、12px，仅注入一次） */
    _injectStyles() {
        if (document.getElementById('alert-label-style')) return;
        const style = document.createElement('style');
        style.id = 'alert-label-style';
        style.textContent = `
            .alert-label {
                position: absolute;
                background: rgba(90, 0, 0, 0.88);          /* 深红背景 */
                color: #ffffff;                            /* 白色文字 */
                border: 1px solid rgba(255, 60, 60, 0.75);
                border-radius: 4px;
                padding: 3px 8px;
                font-size: 12px;
                font-family: 'Segoe UI', Tahoma, sans-serif;
                pointer-events: none;
                user-select: none;
                white-space: nowrap;
                z-index: 49;
                transform: translate(-50%, -120%);
                text-shadow: 0 0 6px rgba(255, 0, 0, 0.9);
                box-shadow: 0 0 10px rgba(255, 0, 0, 0.45);
                transition: opacity 0.2s;
            }
        `;
        document.head.appendChild(style);
    }
}

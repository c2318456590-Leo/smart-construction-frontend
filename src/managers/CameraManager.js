/**
 * CameraManager.js —— 摄像头管理器
 * 本次修改：摄像头飞行动画同步执行相机边界钳制，避免飞行后贴地或穿地。
 * 职责：
 *   1. 根据 CONFIG.cameras 创建所有 3D 摄像头模型并附加 HTML 标签
 *   2. 点击标签 / 调用 selectCamera 触发主相机飞行动画切换
 *   3. triggerAlert 触发摄像头警示灯与视锥的闪烁动画（持续 3 秒）
 *   4. updateLabels 将 3D 锚点投影到屏幕坐标，更新标签位置
 *   5. update 驱动闪烁动画与相机飞行的 lerp 插值
 */
import * as THREE from 'three';
import { CONFIG } from '../config/Config.js';
import { createCameraModel } from '../models/Models.js';

export class CameraManager {
    /**
     * @param {THREE.Scene}      scene    场景
     * @param {THREE.Camera}     camera   渲染用主相机
     * @param {OrbitControls}    controls 轨道控制器
     */
    constructor(scene, camera, controls) {
        this.scene = scene;
        this.camera = camera;
        this.controls = controls;

        // camId -> { id, mesh, config, label, anchor, alertLight, fovMesh, orig, alerting, ... }
        this._cameras = new Map();
        this._currentId = null;     // 当前选中的摄像头 id
        this._elapsedMs = 0;        // 累计时间（毫秒），驱动闪烁动画

        // 相机飞行动画状态
        this._flying = false;
        this._flyToPos = new THREE.Vector3();
        this._flyToTarget = new THREE.Vector3();

        // 保存初始相机位置与目标（用于再次点击恢复视角）
        this._defaultPos = new THREE.Vector3();
        this._defaultTarget = new THREE.Vector3();

        this._injectStyles();
    }

    /**
     * 记录初始相机位置与目标（在 init 或 App 启动后调用一次）
     * 用于"再次点击已选中摄像头 → 恢复初始视角"
     */
    saveDefaultView() {
        this._defaultPos.copy(this.camera.position);
        this._defaultTarget.copy(this.controls.target);
    }

    /** 根据 CONFIG.cameras 创建所有 3D 摄像头模型并添加标签 */
    init() {
        (CONFIG.cameras || []).forEach((config) => {
            // 调用 Models.js 创建摄像头 3D 模型（兼容返回 Group 或 { mesh } 的情形）
            const result = createCameraModel(config);
            const mesh = (result && result.isObject3D)
                ? result
                : (result && (result.mesh || result.group)) || result;

            if (mesh) this.scene.add(mesh);

            // 标签投影与相机飞行使用的 3D 锚点（摄像头本体位置）
            const anchor = new THREE.Vector3(
                config.pos[0], config.pos[1], config.pos[2]
            );

            // 查找警示灯与视锥（用于报警闪烁）
            const { alertLight, fovMesh } = this._findParts(mesh);

            // 创建 HTML 标签
            const label = this._createLabel(config);

            // 记录原始材质状态，便于报警结束后恢复
            const orig = {};
            if (alertLight && alertLight.material) {
                orig.lightColor = alertLight.material.color.getHex();
                orig.lightEmissive = alertLight.material.emissive
                    ? alertLight.material.emissive.getHex() : 0x000000;
                orig.lightEmissiveIntensity = alertLight.material.emissiveIntensity ?? 0;
            }
            if (fovMesh && fovMesh.material) {
                orig.fovColor = fovMesh.material.color.getHex();
                orig.fovOpacity = fovMesh.material.opacity ?? 0.12;
            }

            this._cameras.set(config.id, {
                id: config.id,
                mesh,
                config,
                label,
                anchor,
                alertLight,
                fovMesh,
                orig,
                alerting: false,
                alertColor: 0xff0000,
                alertStartMs: 0,
            });
        });

        // 动态计算飞行速度上限：以 cam1→cam3 为参考距离
        this._computeSpeedLimits();
    }

    /**
     * 切换当前摄像头，触发主相机飞行动画到新位置
     * 若 camId 已是当前选中摄像头，则恢复初始视角（toggle 行为）
     */
    selectCamera(camId) {
        const entry = this._cameras.get(camId);
        if (!entry) return;

        // 再次点击已选中摄像头 → 恢复初始视角
        if (this._currentId === camId) {
            this._currentId = null;
            this._cameras.forEach((e) => {
                if (e.label) e.label.classList.remove('active');
                this._refreshFov(e);
            });
            // 飞回默认视角
            this._flyToPos.copy(this._defaultPos);
            this._flyToTarget.copy(this._defaultTarget);
            this._flying = true;
            this.controls.enabled = false; // 飞行期间禁用控制器，避免冲突
            return;
        }

        // 切换到新摄像头
        this._currentId = camId;

        // 更新标签选中态与视锥高亮
        this._cameras.forEach((e) => {
            if (e.label) e.label.classList.toggle('active', e.id === camId);
            this._refreshFov(e);
        });

        // 飞行目标：飞到该摄像头后上方，朝向其监控区域
        const pos = new THREE.Vector3(
            entry.config.pos[0], entry.config.pos[1], entry.config.pos[2]
        );
        const look = new THREE.Vector3(
            entry.config.lookAt[0], entry.config.lookAt[1], entry.config.lookAt[2]
        );
        const off = CONFIG.cameraFly.flyOffset;
        this._flyToPos.set(pos.x + off[0], pos.y + off[1], pos.z + off[2]);
        this._flyToTarget.copy(look);
        this._flying = true;
        this.controls.enabled = false; // 飞行期间禁用控制器，避免冲突
    }

    /** 取消摄像头选中：清除标签 active 态与当前 ID，不触发飞行 */
    clearSelection() {
        this._currentId = null;
        this._cameras.forEach((e) => {
            if (e.label) e.label.classList.remove('active');
            this._refreshFov(e);
        });
    }

    /**
     * 恢复初始视角（带飞行动画）
     * 用于 UI 层取消摄像头选中时，平滑飞回默认观察视角
     */
    restoreView() {
        this._currentId = null;
        this._cameras.forEach((e) => {
            if (e.label) e.label.classList.remove('active');
            this._refreshFov(e);
        });
        this._flyToPos.copy(this._defaultPos);
        this._flyToTarget.copy(this._defaultTarget);
        this._flying = true;
        this.controls.enabled = false; // 飞行期间禁用控制器，避免冲突
    }

    /** 触发摄像头报警闪烁（持续 3 秒） */
    triggerAlert(camId, alertType) {
        const entry = this._cameras.get(camId);
        if (!entry) return;

        entry.alerting = true;
        entry.alertColor = (CONFIG.alert.colors && CONFIG.alert.colors[alertType] !== undefined)
            ? CONFIG.alert.colors[alertType]
            : 0xff0000;
        entry.alertStartMs = this._elapsedMs;
    }

    /** 更新 HTML 标签位置（将 3D 锚点投影到屏幕坐标） */
    updateLabels(camera, renderer) {
        const cam = camera || this.camera;
        const w = (renderer && renderer.domElement)
            ? renderer.domElement.clientWidth
            : window.innerWidth;
        const h = (renderer && renderer.domElement)
            ? renderer.domElement.clientHeight
            : window.innerHeight;

        const v = new THREE.Vector3();
        this._cameras.forEach((entry) => {
            if (!entry.label) return;
            v.copy(entry.anchor);
            v.y += 2; // 标签略高于摄像头本体
            v.project(cam);

            // 仅当点在相机前方时显示
            if (v.z < 1 && v.z > -1) {
                const x = (v.x * 0.5 + 0.5) * w;
                const y = (-v.y * 0.5 + 0.5) * h;
                entry.label.style.left = `${x}px`;
                entry.label.style.top = `${y}px`;
                entry.label.style.display = 'block';
            } else {
                entry.label.style.display = 'none';
            }
        });
    }

    /** 每帧更新：闪烁动画 + 相机飞行 lerp 插值 */
    update(delta) {
        // delta 视为秒
        const dt = (typeof delta === 'number') ? delta : 0;
        this._elapsedMs += dt * 1000;
        const elapsed = this._elapsedMs;

        // 相机飞行动画（lerp 平滑移动 camera 与 controls.target，带速度上限钳制）
        if (this._flying) {
            const k = 1 - Math.exp(-dt * CONFIG.cameraFly.lerpRate);

            // 位置：期望位移 → 速度上限钳制
            const desiredMove = this._flyToPos.clone().sub(this.camera.position).multiplyScalar(k);
            const maxMove = this._maxLinSpeed * dt;
            if (desiredMove.length() > maxMove) {
                desiredMove.setLength(maxMove);
            }
            this.camera.position.add(desiredMove);

            // 目标点：同理钳制
            const desiredTargetMove = this._flyToTarget.clone().sub(this.controls.target).multiplyScalar(k);
            const maxTargetMove = this._maxTargetSpeed * dt;
            if (desiredTargetMove.length() > maxTargetMove) {
                desiredTargetMove.setLength(maxTargetMove);
            }
            this.controls.target.add(desiredTargetMove);
            this._clampCameraView();

            this.controls.update();

            // 到达判定
            const posRemain = this.camera.position.distanceTo(this._flyToPos);
            const targetRemain = this.controls.target.distanceTo(this._flyToTarget);
            if (posRemain < CONFIG.cameraFly.arrivalThreshold &&
                targetRemain < CONFIG.cameraFly.arrivalThreshold) {
                this.camera.position.copy(this._flyToPos);
                this.controls.target.copy(this._flyToTarget);
                this._clampCameraView();
                this._flying = false;
                this.controls.enabled = true;
                this.controls.update();
            }
        }

        // 报警闪烁动画
        this._cameras.forEach((entry) => {
            if (!entry.alerting) return;
            const phase = elapsed - entry.alertStartMs;
            if (phase >= 3000) {
                // 闪烁持续 3 秒后恢复
                entry.alerting = false;
                this._restoreCamera(entry);
                return;
            }
            const on = Math.floor(phase / 400) % 2 === 0; // 每 400ms 切换一次（原 150ms，降频减轻刺激）
            this._applyFlash(entry, on);
        });
    }

    /** 返回摄像头 Map: camId -> { mesh, config, label, alerting } */
    get cameras() {
        return this._cameras;
    }

    /** 当前选中摄像头 id */
    get currentId() {
        return this._currentId;
    }

    /** 销毁摄像头模型和 HTML 标签，供 App 生命周期清理调用 */
    destroy() {
        this._cameras.forEach((entry) => {
            if (entry.label && entry.label.parentNode) {
                entry.label.parentNode.removeChild(entry.label);
            }
            if (entry.mesh) {
                this.scene.remove(entry.mesh);
                entry.mesh.traverse((obj) => {
                    if (obj.geometry) obj.geometry.dispose();
                    if (obj.material) {
                        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                        mats.forEach((m) => m.dispose());
                    }
                });
            }
        });
        this._cameras.clear();
        this._flying = false;
        this._currentId = null;
    }

    // ===================== 内部方法 =====================

    /**
     * 以主监控(cam1)到塔吊监控(cam3)的飞行距离为参考，
     * 计算线速度与目标点移动速度的上限。
     */
    _computeSpeedLimits() {
        const { refDurationMs, flyOffset } = CONFIG.cameraFly;
        const cam1 = CONFIG.cameras.find(c => c.id === 1);
        const cam3 = CONFIG.cameras.find(c => c.id === 3);

        if (!cam1 || !cam3) {
            // 回退安全默认值
            this._maxLinSpeed = 200;
            this._maxTargetSpeed = 50;
            return;
        }

        const off = flyOffset;
        const fly1 = new THREE.Vector3(cam1.pos[0] + off[0], cam1.pos[1] + off[1], cam1.pos[2] + off[2]);
        const fly3 = new THREE.Vector3(cam3.pos[0] + off[0], cam3.pos[1] + off[1], cam3.pos[2] + off[2]);
        const posDist = fly1.distanceTo(fly3);

        const target1 = new THREE.Vector3(...cam1.lookAt);
        const target3 = new THREE.Vector3(...cam3.lookAt);
        const targetDist = target1.distanceTo(target3);

        const refSeconds = refDurationMs / 1000;
        this._maxLinSpeed = posDist / refSeconds;
        this._maxTargetSpeed = targetDist / refSeconds;
    }

    /**
     * 将飞行动画产生的相机位置与控制目标限制在场地安全范围内。
     * @private
     */
    _clampCameraView() {
        const cfg = CONFIG.camera;
        const target = this.controls.target;

        if (cfg.targetBounds) {
            target.x = THREE.MathUtils.clamp(target.x, cfg.targetBounds.x[0], cfg.targetBounds.x[1]);
            target.z = THREE.MathUtils.clamp(target.z, cfg.targetBounds.z[0], cfg.targetBounds.z[1]);
        }
        if (Number.isFinite(cfg.minTargetY)) {
            target.y = Math.max(target.y, cfg.minTargetY);
        }
        if (Number.isFinite(cfg.maxTargetY)) {
            target.y = Math.min(target.y, cfg.maxTargetY);
        }
        if (Number.isFinite(cfg.minHeight)) {
            this.camera.position.y = Math.max(this.camera.position.y, cfg.minHeight);
        }
    }

    /** 在摄像头模型中查找警示灯与视锥 */
    _findParts(mesh) {
        let alertLight = mesh && (mesh.getObjectByName('alertLight') || mesh.getObjectByName('warningLight'));
        let fovMesh = mesh && (mesh.getObjectByName('fovMesh') || mesh.getObjectByName('fov') || mesh.getObjectByName('cone'));

        if ((!alertLight || !fovMesh) && mesh) {
            // 按几何/材质特征回退查找
            mesh.traverse((obj) => {
                if (!obj.isMesh) return;
                const geoType = obj.geometry && obj.geometry.type;
                const mat = obj.material;
                // 视锥：透明圆锥
                if (!fovMesh && geoType === 'ConeGeometry' && mat && mat.transparent) {
                    fovMesh = obj;
                }
                // 警示灯：带自发光的球体
                if (!alertLight && geoType === 'SphereGeometry' && mat && mat.emissive) {
                    alertLight = obj;
                }
            });
        }
        return { alertLight, fovMesh };
    }

    /** 创建 HTML 标签（深蓝背景、青色边框、12px、hover 变亮） */
    _createLabel(config) {
        const div = document.createElement('div');
        div.className = 'cam-label';
        div.dataset.cameraId = config.id;
        div.innerHTML =
            `<span class="cam-icon">📹</span> ` +
            `<span class="cam-name">${config.name}</span>` +
            `<span class="cam-region">${config.region || ''}</span>`;
        // 点击标签切换摄像头
        div.addEventListener('click', () => this.selectCamera(config.id));
        document.body.appendChild(div);
        return div;
    }

    /** 应用报警闪烁外观（强度降低 70%） */
    _applyFlash(entry, on) {
        const c = entry.alertColor;

        // 警示灯闪烁（alertLight 为 MeshBasicMaterial，无 emissive，故守卫判断）
        if (entry.alertLight && entry.alertLight.material) {
            const m = entry.alertLight.material;
            if (on) {
                m.color.setHex(c);
                if (m.emissive) {
                    m.emissive.setHex(c);
                    m.emissiveIntensity = 0.45;   // 原 1.5 → 降低 70%
                }
            } else {
                m.color.setHex(0x000000);
                if (m.emissive) {
                    m.emissive.setHex(0x000000);
                    m.emissiveIntensity = 0;
                }
            }
        }

        // 视锥闪烁（opacity 变化，降低 70%）
        if (entry.fovMesh && entry.fovMesh.material) {
            const m = entry.fovMesh.material;
            if (on) {
                m.color.setHex(c);
                m.opacity = 0.105;   // 原 0.35 → 降低 70%
            } else {
                m.color.setHex(entry.orig.fovColor);
                m.opacity = (entry.orig.fovOpacity ?? 0.12) * 0.5;
            }
        }

        // 标签闪烁
        if (entry.label) {
            if (on) {
                entry.label.style.background = 'rgba(120, 0, 0, 0.9)';
                entry.label.style.borderColor = '#ff0000';
                entry.label.style.color = '#ffffff';
                entry.label.style.boxShadow = '0 0 14px rgba(255, 0, 0, 0.8)';
            } else {
                entry.label.style.background = '';
                entry.label.style.borderColor = '';
                entry.label.style.color = '';
                entry.label.style.boxShadow = '';
            }
        }
    }

    /** 报警结束后恢复摄像头外观 */
    _restoreCamera(entry) {
        if (entry.alertLight && entry.alertLight.material) {
            const m = entry.alertLight.material;
            m.color.setHex(entry.orig.lightColor);
            if (m.emissive) {
                m.emissive.setHex(entry.orig.lightEmissive);
                m.emissiveIntensity = entry.orig.lightEmissiveIntensity;
            }
        }
        if (entry.label) {
            entry.label.style.background = '';
            entry.label.style.borderColor = '';
            entry.label.style.color = '';
            entry.label.style.boxShadow = '';
        }
        this._refreshFov(entry);
    }

    /** 刷新视锥透明度（选中态轻微高亮，非选中态恢复原始值） */
    _refreshFov(entry) {
        if (!entry.fovMesh || !entry.fovMesh.material || entry.alerting) return;
        // 选中态从 0.25 降到 0.10，避免视角被视锥遮挡导致画面变暗
        entry.fovMesh.material.opacity = (entry.id === this._currentId)
            ? 0.10
            : (entry.orig.fovOpacity ?? 0.12);
    }

    /** 注入 .cam-label 样式（仅注入一次） */
    _injectStyles() {
        if (document.getElementById('cam-label-style')) return;
        const style = document.createElement('style');
        style.id = 'cam-label-style';
        style.textContent = `
            .cam-label {
                position: absolute;
                background: rgba(10, 20, 50, 0.82);       /* 深蓝背景 */
                color: #e0eaff;
                border: 1px solid rgba(0, 200, 255, 0.55); /* 青色边框 */
                border-radius: 4px;
                padding: 4px 9px;
                font-size: 12px;
                font-family: 'Segoe UI', Tahoma, sans-serif;
                cursor: pointer;
                user-select: none;
                white-space: nowrap;
                z-index: 50;
                transform: translate(-50%, -50%);
                pointer-events: auto;
                transition: background 0.2s, border-color 0.2s, color 0.2s, box-shadow 0.2s;
            }
            .cam-label .cam-icon { margin-right: 3px; }
            .cam-label .cam-name { font-weight: 600; }
            .cam-label .cam-region {
                margin-left: 6px;
                font-size: 11px;
                color: #7fbfff;
            }
            /* hover 变亮 */
            .cam-label:hover {
                background: rgba(0, 60, 120, 0.95);
                border-color: #00d4ff;
                color: #00ffff;
                box-shadow: 0 0 14px rgba(0, 212, 255, 0.65);
            }
            .cam-label.active {
                background: rgba(0, 80, 140, 0.95);
                border-color: #00d4ff;
                color: #00ffff;
                box-shadow: 0 0 14px rgba(0, 212, 255, 0.65);
            }
        `;
        document.head.appendChild(style);
    }
}

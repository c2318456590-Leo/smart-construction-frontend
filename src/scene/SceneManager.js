/**
 * SceneManager.js — 场景管理器
 * 本次修改：合并最新探照灯渲染逻辑到源文件，恢复无版本配置引用。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { CONFIG } from '../config/Config.js';

const SKY_TEXTURE_WIDTH = 1;
const SKY_TEXTURE_HEIGHT = 256;
const SPOTLIGHT_POLE_RADIUS = 0.18;
const SPOTLIGHT_POLE_SEGMENTS = 12;
const SPOTLIGHT_HEAD_RADIUS = 0.58;
const SPOTLIGHT_HEAD_LENGTH = 2.4;
const SPOTLIGHT_HEAD_SEGMENTS = 20;
const SPOTLIGHT_LENS_RADIUS = 0.7;
const SPOTLIGHT_BEAM_SEGMENTS = 48;
const SPOTLIGHT_POOL_SEGMENTS = 64;
const SPOTLIGHT_MIN_LENGTH = 1;

export class SceneManager {
    /**
     * 初始化渲染器、场景、相机、控制器、光照与后处理
     * @param {HTMLCanvasElement} canvas 画布元素
     */
    constructor(canvas) {
        // ====== 渲染器 ======
        this._renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            antialias: true,       // 抗锯齿
            alpha: true,           // 允许透明背景
        });
        this._renderer.setPixelRatio(window.devicePixelRatio);
        this._renderer.setSize(window.innerWidth, window.innerHeight);
        // ACES 电影色调映射，画面更有质感
        this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this._renderer.toneMappingExposure = CONFIG.render.toneMappingExposure;
        // 阴影：开启 + PCF 软阴影
        this._renderer.shadowMap.enabled = true;
        this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        // ====== 场景 ======
        this._scene = new THREE.Scene();
        this._scene.background = new THREE.Color(CONFIG.scene.bgColor);
        this._skyCanvas = document.createElement('canvas');
        this._skyCanvas.width = SKY_TEXTURE_WIDTH;
        this._skyCanvas.height = SKY_TEXTURE_HEIGHT;
        this._skyTexture = new THREE.CanvasTexture(this._skyCanvas);
        this._skyTexture.colorSpace = THREE.SRGBColorSpace;
        this._skyTop = new THREE.Color(CONFIG.scene.bgColor);
        this._skyBottom = new THREE.Color(CONFIG.scene.bgColor);
        // 雾效，增加深度感与远景消隐
        this._scene.fog = new THREE.Fog(
            CONFIG.scene.fogColor,
            CONFIG.scene.fogNear,
            CONFIG.scene.fogFar
        );

        // ====== 相机 ======
        this._camera = new THREE.PerspectiveCamera(
            CONFIG.camera.fov,
            window.innerWidth / window.innerHeight,
            CONFIG.camera.near,
            CONFIG.camera.far
        );
        this._camera.position.set(
            CONFIG.camera.position[0],
            CONFIG.camera.position[1],
            CONFIG.camera.position[2]
        );
        this._camera.lookAt(
            CONFIG.camera.target[0],
            CONFIG.camera.target[1],
            CONFIG.camera.target[2]
        );

        // ====== 控制器 ======
        this._controls = new OrbitControls(this._camera, this._renderer.domElement);
        this._controls.enableDamping = true;                       // 阻尼惯性
        this._controls.dampingFactor = CONFIG.camera.damping;
        this._controls.target.set(
            CONFIG.camera.target[0],
            CONFIG.camera.target[1],
            CONFIG.camera.target[2]
        );
        // 限制俯仰角，防止视角翻到地下
        this._controls.maxPolarAngle = CONFIG.camera.maxPolar;
        this._controls.minDistance = CONFIG.camera.minDistance;
        this._controls.maxDistance = CONFIG.camera.maxDistance;
        this._clampCameraView();
        this._controls.update();

        // ====== 光照系统 ======
        this._setupLights();

        // ====== 后处理 ======
        this._setupPostprocessing();

        // ====== 默认白天主题（立即应用，无过渡） ======
        this._applyThemeImmediate(CONFIG.theme[CONFIG.theme.default]);
    }

    /**
     * 搭建光照：环境光 + 半球光 + 主太阳方向光（带阴影）
     * @private
     */
    _setupLights() {
        // 环境光：基础底色，避免纯黑阴影
        const ambient = new THREE.AmbientLight(
            CONFIG.lighting.ambient,
            CONFIG.lighting.ambientIntensity
        );
        this._scene.add(ambient);
        this._ambient = ambient;

        // 半球光：天空色与地面色融合，模拟天空散射
        const hemi = new THREE.HemisphereLight(
            CONFIG.lighting.hemiSky,
            CONFIG.lighting.hemiGround,
            CONFIG.lighting.hemiIntensity
        );
        this._scene.add(hemi);
        this._hemi = hemi;

        // 主太阳光：方向光，投射阴影
        const sun = new THREE.DirectionalLight(
            CONFIG.lighting.sun,
            CONFIG.lighting.sunIntensity
        );
        sun.position.set(
            CONFIG.lighting.sunPosition[0],
            CONFIG.lighting.sunPosition[1],
            CONFIG.lighting.sunPosition[2]
        );
        sun.castShadow = true;
        // 阴影贴图分辨率（CONFIG.render.shadowMapSize = 4096）
        sun.shadow.mapSize.width = CONFIG.render.shadowMapSize;
        sun.shadow.mapSize.height = CONFIG.render.shadowMapSize;
        // 阴影相机范围，覆盖整个工地
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 500;
        sun.shadow.camera.left = -150;
        sun.shadow.camera.right = 150;
        sun.shadow.camera.top = 150;
        sun.shadow.camera.bottom = -150;
        // 消除阴影伪影
        sun.shadow.bias = -0.0005;
        this._scene.add(sun);
        this._sun = sun;

        this._setupSiteSpotlights();
    }

    /**
     * 按配置创建入口、塔吊、堆场与楼前探照灯。
     * @private
     */
    _setupSiteSpotlights() {
        this._siteSpotlights = [];
        const spotlightConfigs = CONFIG.lighting.siteSpotlights || [];

        spotlightConfigs.forEach((spotlightConfig) => {
            const target = new THREE.Object3D();
            target.name = `${spotlightConfig.name}-target`;
            target.position.set(...spotlightConfig.target);
            this._scene.add(target);

            const light = new THREE.SpotLight(
                spotlightConfig.color,
                spotlightConfig.intensity,
                spotlightConfig.distance,
                spotlightConfig.angle,
                spotlightConfig.penumbra,
                spotlightConfig.decay
            );
            light.name = spotlightConfig.name;
            light.position.set(...spotlightConfig.position);
            light.target = target;
            light.castShadow = true;
            light.shadow.mapSize.width = CONFIG.render.shadowMapSize / 2;
            light.shadow.mapSize.height = CONFIG.render.shadowMapSize / 2;
            light.shadow.bias = -0.0004;

            const visual = this._createSiteSpotlightVisual(spotlightConfig);
            this._scene.add(visual.group);
            this._scene.add(light);
            this._siteSpotlights.push({
                light,
                baseIntensity: spotlightConfig.intensity,
                beam: visual.beam,
                pool: visual.pool,
                lens: visual.lens,
                baseBeamOpacity: spotlightConfig.beamOpacity,
                basePoolOpacity: spotlightConfig.poolOpacity,
                baseLensEmissiveIntensity: 1.4,
            });
        });
    }

    /**
     * 创建探照灯的可见模型：灯杆、灯头、光束和地面光斑。
     * @param {Object} spotlightConfig 探照灯配置
     * @returns {Object} 可见组件集合
     * @private
     */
    _createSiteSpotlightVisual(spotlightConfig) {
        const group = new THREE.Group();
        group.name = `${spotlightConfig.name}-visual`;

        const position = new THREE.Vector3(...spotlightConfig.position);
        const target = new THREE.Vector3(...spotlightConfig.target);
        const direction = target.clone().sub(position);
        const length = Math.max(SPOTLIGHT_MIN_LENGTH, direction.length());
        direction.normalize();

        const metalMaterial = new THREE.MeshStandardMaterial({
            color: 0x2f3542,
            roughness: 0.55,
            metalness: 0.72,
        });
        const lightColor = new THREE.Color(spotlightConfig.color);

        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(
                SPOTLIGHT_POLE_RADIUS,
                SPOTLIGHT_POLE_RADIUS,
                position.y,
                SPOTLIGHT_POLE_SEGMENTS
            ),
            metalMaterial
        );
        pole.position.set(position.x, position.y / 2, position.z);
        pole.castShadow = true;
        group.add(pole);

        const head = new THREE.Mesh(
            new THREE.CylinderGeometry(
                SPOTLIGHT_HEAD_RADIUS,
                SPOTLIGHT_HEAD_RADIUS * 0.82,
                SPOTLIGHT_HEAD_LENGTH,
                SPOTLIGHT_HEAD_SEGMENTS
            ),
            metalMaterial
        );
        head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        head.position.copy(position).add(direction.clone().multiplyScalar(SPOTLIGHT_HEAD_LENGTH / 2));
        head.castShadow = true;
        group.add(head);

        const lensMaterial = new THREE.MeshStandardMaterial({
            color: spotlightConfig.color,
            emissive: spotlightConfig.color,
            emissiveIntensity: 1.4,
            roughness: 0.25,
            metalness: 0.1,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
        });
        const lens = new THREE.Mesh(
            new THREE.CircleGeometry(SPOTLIGHT_LENS_RADIUS, SPOTLIGHT_HEAD_SEGMENTS),
            lensMaterial
        );
        lens.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
        lens.position.copy(position).add(direction.clone().multiplyScalar(SPOTLIGHT_HEAD_LENGTH + 0.03));
        lens.name = `${spotlightConfig.name}-lens`;
        group.add(lens);

        const beamMaterial = new THREE.MeshBasicMaterial({
            color: lightColor,
            transparent: true,
            opacity: spotlightConfig.beamOpacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const beam = new THREE.Mesh(
            new THREE.ConeGeometry(
                spotlightConfig.beamRadius,
                length,
                SPOTLIGHT_BEAM_SEGMENTS,
                1,
                true
            ),
            beamMaterial
        );
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().negate());
        beam.position.copy(position).add(direction.clone().multiplyScalar(length / 2));
        beam.name = `${spotlightConfig.name}-beam`;
        group.add(beam);

        const poolMaterial = new THREE.MeshBasicMaterial({
            color: lightColor,
            transparent: true,
            opacity: spotlightConfig.poolOpacity,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        const pool = new THREE.Mesh(
            new THREE.CircleGeometry(spotlightConfig.poolRadius, SPOTLIGHT_POOL_SEGMENTS),
            poolMaterial
        );
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(target.x, 0.06, target.z);
        pool.name = `${spotlightConfig.name}-pool`;
        group.add(pool);

        return { group, beam, pool, lens };
    }

    /**
     * 搭建后处理链：RenderPass → UnrealBloomPass → FXAA
     * @private
     */
    _setupPostprocessing() {
        const w = window.innerWidth;
        const h = window.innerHeight;

        // EffectComposer 组合多个通道
        this._composer = new EffectComposer(this._renderer);

        // 1. 渲染通道：先渲染场景到帧缓冲
        const renderPass = new RenderPass(this._scene, this._camera);
        this._composer.addPass(renderPass);

        // 2. 泛光通道：高亮区域发光，营造科技感
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(w, h),
            CONFIG.render.bloom.strength,    // 泛光强度
            CONFIG.render.bloom.radius,      // 泛光半径
            CONFIG.render.bloom.threshold    // 亮度阈值
        );
        this._composer.addPass(bloomPass);
        this._bloomPass = bloomPass;

        // 3. FXAA 抗锯齿通道：补充边缘抗锯齿
        const fxaaPass = new ShaderPass(FXAAShader);
        const dpr = this._renderer.getPixelRatio();
        fxaaPass.material.uniforms['resolution'].value.x = 1 / (w * dpr);
        fxaaPass.material.uniforms['resolution'].value.y = 1 / (h * dpr);
        this._composer.addPass(fxaaPass);
        this._fxaaPass = fxaaPass;
    }

    /** 场景对象 */
    get scene() { return this._scene; }
    /** 相机对象 */
    get camera() { return this._camera; }
    /** 渲染器对象 */
    get renderer() { return this._renderer; }
    /** 后处理合成器 */
    get composer() { return this._composer; }
    /** 轨道控制器 */
    get controls() { return this._controls; }

    /**
     * 每帧更新：更新控制器 + 主题过渡 + 渲染后处理
     * @param {number} delta 帧间隔时间（秒）
     * @param {number} elapsed 累计运行时间（秒）
     */
    update(delta, elapsed) {
        this._controls.update();
        if (this._clampCameraView()) {
            this._controls.update();
        }

        // 主题平滑过渡
        if (this._themeTarget && this._themeStart) {
            const durationMs = Math.max(1, CONFIG.theme.transitionDuration);
            this._themeElapsedMs += delta * 1000;
            const progress = Math.min(this._themeElapsedMs / durationMs, 1);
            const easedProgress = THREE.MathUtils.smoothstep(progress, 0, 1);

            this._applyThemeMix(this._themeStart, this._themeTarget, easedProgress);

            if (progress >= 1) {
                this._applyThemeImmediate(this._themeTarget, this._themeTargetName);
            }
        }

        this._composer.render(delta);
    }

    /**
     * 窗口尺寸变化时同步更新相机、渲染器、合成器与 FXAA 分辨率
     * @param {number} w 宽度（CSS 像素）
     * @param {number} h 高度（CSS 像素）
     */
    resize(w, h) {
        // 更新相机宽高比
        this._camera.aspect = w / h;
        this._camera.updateProjectionMatrix();
        // 更新渲染器尺寸
        this._renderer.setSize(w, h);
        // 更新合成器尺寸
        this._composer.setSize(w, h);
        // 更新 FXAA 分辨率（使用实际像素，需乘以像素比）
        const dpr = this._renderer.getPixelRatio();
        this._fxaaPass.material.uniforms['resolution'].value.x = 1 / (w * dpr);
        this._fxaaPass.material.uniforms['resolution'].value.y = 1 / (h * dpr);
    }

    /**
     * 向场景添加对象
     * @param {THREE.Object3D} obj
     */
    add(obj) {
        this._scene.add(obj);
    }

    /**
     * 从场景移除对象
     * @param {THREE.Object3D} obj
     */
    remove(obj) {
        this._scene.remove(obj);
    }

    /**
     * 切换场景主题（白天/夜晚），启动平滑过渡动画。
     * @param {string} themeName - 主题名称，'day' 或 'night'
     */
    setTheme(themeName) {
        const preset = CONFIG.theme[themeName];
        if (!preset) {
            console.warn(`[SceneManager] 未找到主题配置: ${themeName}`);
            return;
        }

        this._themeStart = this._captureCurrentTheme();
        this._themeTarget = preset;
        this._themeTargetName = themeName;
        this._themeElapsedMs = 0;
    }

    /**
     * 将渲染参数（曝光、bloom 强度）钳制在配置的上下限内。
     * 在主题切换和曝光调节后调用，防止画面过暗或过亮。
     * @private
     */
    _clampRender() {
        const { exposureMin, exposureMax, bloom } = CONFIG.render;
        this._renderer.toneMappingExposure = THREE.MathUtils.clamp(
            this._renderer.toneMappingExposure, exposureMin, exposureMax
        );
        this._bloomPass.strength = THREE.MathUtils.clamp(
            this._bloomPass.strength, bloom.strengthMin, bloom.strengthMax
        );
    }

    /**
     * 立即应用主题预设（无过渡动画），用于初始化。
     * @param {Object} preset - 主题预设对象
     * @private
     */
    _applyThemeImmediate(preset, themeName = CONFIG.theme.default) {
        this._setSkyBackground(preset.skyTop ?? preset.bgColor, preset.skyBottom ?? preset.bgColor);
        this._scene.fog.color = new THREE.Color(preset.fogColor);
        this._scene.fog.near = preset.fogNear;
        this._scene.fog.far = preset.fogFar;

        this._ambient.color.set(preset.ambient.color);
        this._ambient.intensity = preset.ambient.intensity;
        this._hemi.color.set(preset.hemi.sky);
        this._hemi.groundColor.set(preset.hemi.ground);
        this._hemi.intensity = preset.hemi.intensity;
        this._sun.color.set(preset.sun.color);
        this._sun.intensity = preset.sun.intensity;
        this._sun.position.set(...preset.sun.position);
        this._setSiteSpotlightScale(preset.siteSpotlightScale ?? 1);
        this._setSiteSpotlightVisualScale(preset.siteSpotlightBeamScale ?? 1);

        this._renderer.toneMappingExposure = preset.exposure;
        this._bloomPass.strength = preset.bloomStrength;
        this._bloomPass.threshold = preset.bloomThreshold;

        this._themeStart = null;
        this._themeTarget = null;
        this._themeTargetName = null;
        this._themeElapsedMs = 0;
        this._currentThemeName = themeName;

        this._clampRender();
    }

    /**
     * 捕获当前主题相关渲染状态，作为后续过渡插值起点。
     * @returns {Object} 当前颜色、光照、雾效、曝光与 Bloom 参数快照
     * @private
     */
    _captureCurrentTheme() {
        return {
            skyTop: this._skyTop.clone(),
            skyBottom: this._skyBottom.clone(),
            fogColor: this._scene.fog.color.clone(),
            fogNear: this._scene.fog.near,
            fogFar: this._scene.fog.far,
            ambient: {
                color: this._ambient.color.clone(),
                intensity: this._ambient.intensity,
            },
            hemi: {
                sky: this._hemi.color.clone(),
                ground: this._hemi.groundColor.clone(),
                intensity: this._hemi.intensity,
            },
            sun: {
                color: this._sun.color.clone(),
                intensity: this._sun.intensity,
                position: this._sun.position.clone(),
            },
            siteSpotlightScale: this._getSiteSpotlightScale(),
            siteSpotlightBeamScale: this._getSiteSpotlightBeamScale(),
            exposure: this._renderer.toneMappingExposure,
            bloomStrength: this._bloomPass.strength,
            bloomThreshold: this._bloomPass.threshold,
        };
    }

    /**
     * 将当前主题状态按进度插值到目标主题。
     * @param {Object} start - 过渡起始状态快照
     * @param {Object} target - CONFIG.theme 中的目标主题配置
     * @param {number} progress - 0 到 1 的插值进度
     * @private
     */
    _applyThemeMix(start, target, progress) {
        const skyTop = start.skyTop.clone().lerp(new THREE.Color(target.skyTop ?? target.bgColor), progress);
        const skyBottom = start.skyBottom.clone().lerp(new THREE.Color(target.skyBottom ?? target.bgColor), progress);
        this._setSkyBackground(skyTop, skyBottom);
        this._scene.fog.color = start.fogColor.clone().lerp(new THREE.Color(target.fogColor), progress);
        this._scene.fog.near = THREE.MathUtils.lerp(start.fogNear, target.fogNear, progress);
        this._scene.fog.far = THREE.MathUtils.lerp(start.fogFar, target.fogFar, progress);

        this._ambient.color.copy(start.ambient.color).lerp(new THREE.Color(target.ambient.color), progress);
        this._ambient.intensity = THREE.MathUtils.lerp(start.ambient.intensity, target.ambient.intensity, progress);

        this._hemi.color.copy(start.hemi.sky).lerp(new THREE.Color(target.hemi.sky), progress);
        this._hemi.groundColor.copy(start.hemi.ground).lerp(new THREE.Color(target.hemi.ground), progress);
        this._hemi.intensity = THREE.MathUtils.lerp(start.hemi.intensity, target.hemi.intensity, progress);

        this._sun.color.copy(start.sun.color).lerp(new THREE.Color(target.sun.color), progress);
        this._sun.intensity = THREE.MathUtils.lerp(start.sun.intensity, target.sun.intensity, progress);
        this._sun.position.copy(start.sun.position).lerp(new THREE.Vector3(...target.sun.position), progress);
        this._setSiteSpotlightScale(THREE.MathUtils.lerp(
            start.siteSpotlightScale,
            target.siteSpotlightScale ?? 1,
            progress
        ));
        this._setSiteSpotlightVisualScale(THREE.MathUtils.lerp(
            start.siteSpotlightBeamScale,
            target.siteSpotlightBeamScale ?? 1,
            progress
        ));

        this._renderer.toneMappingExposure = THREE.MathUtils.lerp(start.exposure, target.exposure, progress);
        this._bloomPass.strength = THREE.MathUtils.lerp(start.bloomStrength, target.bloomStrength, progress);
        this._bloomPass.threshold = THREE.MathUtils.lerp(start.bloomThreshold, target.bloomThreshold, progress);

        this._clampRender();
    }

    /**
     * 获取当前探照灯强度缩放值。
     * @returns {number} 当前强度缩放值
     * @private
     */
    _getSiteSpotlightScale() {
        const firstEntry = this._siteSpotlights?.[0];
        if (!firstEntry || firstEntry.baseIntensity === 0) {
            return 1;
        }
        return firstEntry.light.intensity / firstEntry.baseIntensity;
    }

    /**
     * 按比例设置所有场地探照灯强度。
     * @param {number} scale 强度缩放值
     * @private
     */
    _setSiteSpotlightScale(scale) {
        if (!this._siteSpotlights) {
            return;
        }

        this._siteSpotlights.forEach(({ light, baseIntensity }) => {
            light.intensity = baseIntensity * scale;
        });
    }

    /**
     * 获取当前探照灯可见光束缩放值。
     * @returns {number} 当前光束缩放值
     * @private
     */
    _getSiteSpotlightBeamScale() {
        const firstEntry = this._siteSpotlights?.[0];
        if (!firstEntry || firstEntry.baseBeamOpacity === 0) {
            return 1;
        }
        return firstEntry.beam.material.opacity / firstEntry.baseBeamOpacity;
    }

    /**
     * 按比例设置探照灯可见光束、光斑和灯头亮度。
     * @param {number} scale 可见光效缩放值
     * @private
     */
    _setSiteSpotlightVisualScale(scale) {
        if (!this._siteSpotlights) {
            return;
        }

        this._siteSpotlights.forEach((entry) => {
            entry.beam.material.opacity = entry.baseBeamOpacity * scale;
            entry.pool.material.opacity = entry.basePoolOpacity * scale;
            entry.lens.material.emissiveIntensity = entry.baseLensEmissiveIntensity * Math.max(0.35, scale);
        });
    }

    /**
     * 将场景背景更新为竖向渐变天空纹理。
     * @param {number|THREE.Color} topColor 天空顶部颜色
     * @param {number|THREE.Color} bottomColor 天空底部颜色
     * @private
     */
    _setSkyBackground(topColor, bottomColor) {
        const top = new THREE.Color(topColor);
        const bottom = new THREE.Color(bottomColor);
        const ctx = this._skyCanvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, SKY_TEXTURE_HEIGHT);

        gradient.addColorStop(0, `#${top.getHexString()}`);
        gradient.addColorStop(1, `#${bottom.getHexString()}`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, SKY_TEXTURE_WIDTH, SKY_TEXTURE_HEIGHT);

        this._skyTexture.needsUpdate = true;
        this._scene.background = this._skyTexture;
        this._skyTop.copy(top);
        this._skyBottom.copy(bottom);
    }

    /**
     * 限制主相机和轨道控制目标，防止低角度看到地面下方虚空。
     * @returns {boolean} 是否改动了相机或控制目标
     * @private
     */
    _clampCameraView() {
        const cfg = CONFIG.camera;
        const target = this._controls.target;
        let changed = false;

        if (cfg.targetBounds) {
            const nextX = THREE.MathUtils.clamp(target.x, cfg.targetBounds.x[0], cfg.targetBounds.x[1]);
            const nextZ = THREE.MathUtils.clamp(target.z, cfg.targetBounds.z[0], cfg.targetBounds.z[1]);
            if (nextX !== target.x || nextZ !== target.z) {
                target.x = nextX;
                target.z = nextZ;
                changed = true;
            }
        }

        if (Number.isFinite(cfg.minTargetY) && target.y < cfg.minTargetY) {
            target.y = cfg.minTargetY;
            changed = true;
        }
        if (Number.isFinite(cfg.maxTargetY) && target.y > cfg.maxTargetY) {
            target.y = cfg.maxTargetY;
            changed = true;
        }
        if (Number.isFinite(cfg.minHeight) && this._camera.position.y < cfg.minHeight) {
            this._camera.position.y = cfg.minHeight;
            changed = true;
        }

        return changed;
    }
}

export default SceneManager;

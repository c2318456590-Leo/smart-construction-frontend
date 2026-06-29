/**
 * SceneManager.js — 场景管理器
 * 统一管理 renderer / scene / camera / controls / composer / 光照 / 后处理
 * 所有参数从 CONFIG 读取，便于全局调参
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { CONFIG } from '../config/Config.js';

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
        this._controls.update();

        // ====== 光照系统 ======
        this._setupLights();

        // ====== 后处理 ======
        this._setupPostprocessing();
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

        // 半球光：天空色与地面色融合，模拟天空散射
        const hemi = new THREE.HemisphereLight(
            CONFIG.lighting.hemiSky,
            CONFIG.lighting.hemiGround,
            CONFIG.lighting.hemiIntensity
        );
        this._scene.add(hemi);

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
     * 每帧更新：更新控制器 + 渲染后处理
     * @param {number} delta 帧间隔时间（秒）
     * @param {number} elapsed 累计运行时间（秒）
     */
    update(delta, elapsed) {
        this._controls.update();
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
}

export default SceneManager;

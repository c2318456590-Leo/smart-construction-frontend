/**
 * Config.js — 全局配置中心
 * 本次修改：合并最新探照灯配置到源文件，保留扩展夜间安全照明参数。
 */

const NIGHT_SITE_SPOTLIGHT_SCALE = 1.0;
const DAY_SITE_SPOTLIGHT_SCALE = 0.12;
const NIGHT_SPOTLIGHT_BEAM_SCALE = 1.0;
const DAY_SPOTLIGHT_BEAM_SCALE = 0.08;

export const CONFIG = {
    // ====== 主题色系（深蓝科技风，低饱和柔和） ======
    colors: {
        bgDeep:       '#0a0e27',
        bgPanel:      'rgba(10, 20, 50, 0.75)',
        bgPanelSolid: '#0a1432',
        border:       'rgba(80, 160, 210, 0.22)',
        accent:       '#4a9ed8',   // 柔和青蓝（原 #00d4ff 过亮）
        accentDim:    '#2a5a7a',
        textPrimary:   '#c8d6e8',   // 柔和浅蓝白（原 #e0eaff 过亮）
        textSecondary: '#6a8aaa',
        danger:       '#c84a6a',    // 柔和暗红（原 #ff3366 过亮）
        dangerGlow:   '#a02840',
        warning:      '#c89048',    // 柔和琥珀（原 #ffaa00 过亮）
        warningGlow:  '#9a6828',
        success:      '#4ab88a',    // 柔和青绿（原 #00ff88 过亮）
        info:         '#4a8ad8',
        radar:        '#4ab8b0',    // 柔和青（原 #00ffcc 过亮）
    },

    // ====== 3D 场景参数 ======
    scene: {
        size: 200,              // 工地边长
        fogNear: 150,
        fogFar: 500,
        bgColor: 0x0a0e27,
        fogColor: 0x0a0e27,
        groundSkirt: true,      // 地面裙边（遮挡地平线接缝）
        groundSkirtSize: 900,
    },

    // ====== 相机参数 ======
    camera: {
        fov: 50,
        near: 0.1,
        far: 2000,
        position:   [140, 110, 140],
        target:     [0, 10, 0],
        damping: 0.05,
        maxPolar: Math.PI / 2 - 0.28,
        minDistance: 25,
        maxDistance: 280,
        minTargetY: 4,
        maxTargetY: 45,
        minHeight: 18,
        targetBounds: {
            x: [-130, 130],
            z: [-130, 130],
        },
    },

    // ====== 渲染参数 ======
    render: {
        shadowMapSize: 4096,
        toneMappingExposure: 1.0,
        exposureMin: 0.6,
        exposureMax: 1.5,
        bloom: {
            strength: 0.8,
            radius: 0.6,
            threshold: 0.15,
            strengthMin: 0.2,
            strengthMax: 1.0,
            thresholdDay: 0.6,
        },
    },

    // ====== 昼夜主题配置 ======
    theme: {
        default: 'day',
        transitionDuration: 1200,   // ms，主题切换过渡时长
        day: {
            bgColor: 0x87b5e8,
            skyTop: 0x5f9fe8,
            skyBottom: 0xd5e8f6,
            fogColor: 0xb0c8e0,
            fogNear: 250,
            fogFar: 700,
            ambient: { color: 0xc8d8e8, intensity: 0.7 },
            hemi: { sky: 0x88bbff, ground: 0x808880, intensity: 0.8 },
            sun: { color: 0xffffee, intensity: 1.8, position: [120, 200, 60] },
            exposure: 1.1,
            bloomStrength: 0.3,
            bloomThreshold: 0.6,
            siteSpotlightScale: DAY_SITE_SPOTLIGHT_SCALE,
            siteSpotlightBeamScale: DAY_SPOTLIGHT_BEAM_SCALE,
        },
        night: {
            bgColor: 0x0a0e27,
            skyTop: 0x07142f,
            skyBottom: 0x102c5f,
            fogColor: 0x0a0e27,
            fogNear: 150,
            fogFar: 500,
            ambient: { color: 0x5d79b8, intensity: 0.58 },
            hemi: { sky: 0xa7beff, ground: 0x10172e, intensity: 0.78 },
            sun: { color: 0xfff2d0, intensity: 1.35, position: [100, 200, 80] },
            exposure: 1.15,
            bloomStrength: 0.58,
            bloomThreshold: 0.4,
            siteSpotlightScale: NIGHT_SITE_SPOTLIGHT_SCALE,
            siteSpotlightBeamScale: NIGHT_SPOTLIGHT_BEAM_SCALE,
        },
    },

    // ====== 围墙大门配置 ======
    perimeter: {
        size: 200,
        wallHeight: 4,
        wallThickness: 0.6,
        wallColor: 0x9a9a9a,
        gate: {
            side: 'south',
            width: 16,
            height: 5,
        },
    },

    // ====== 相机飞行动画参数 ======
    cameraFly: {
        refDurationMs: 1200,        // 参考飞行时长
        arrivalThreshold: 0.5,      // 到达判定阈值
        lerpRate: 5,                // 插值速率
        flyOffset: [18, 12, 22],    // 飞行偏移量 [x, y, z]
    },

    // ====== 光照参数 ======
    lighting: {
        ambient: 0x4466aa,
        ambientIntensity: 0.4,
        hemiSky: 0x88aaff,
        hemiGround: 0x080820,
        hemiIntensity: 0.6,
        sun: 0xfff5e0,
        sunIntensity: 1.2,
        sunPosition: [100, 200, 80],
        siteSpotlights: [
            {
                name: 'south-gate-light',
                position: [-34, 32, 116],
                target: [4, 2, 78],
                color: 0xfff0c0,
                intensity: 6.2,
                distance: 175,
                angle: 0.58,
                penumbra: 0.68,
                decay: 1.2,
                beamRadius: 28,
                beamOpacity: 0.16,
                poolRadius: 34,
                poolOpacity: 0.14,
            },
            {
                name: 'crane-yard-light',
                position: [-74, 42, -2],
                target: [-28, 3, -34],
                color: 0xdde8ff,
                intensity: 5.4,
                distance: 165,
                angle: 0.6,
                penumbra: 0.7,
                decay: 1.25,
                beamRadius: 26,
                beamOpacity: 0.14,
                poolRadius: 32,
                poolOpacity: 0.12,
            },
            {
                name: 'material-yard-light',
                position: [-84, 34, 54],
                target: [-22, 2, 48],
                color: 0xffedc8,
                intensity: 5.0,
                distance: 160,
                angle: 0.62,
                penumbra: 0.72,
                decay: 1.3,
                beamRadius: 25,
                beamOpacity: 0.13,
                poolRadius: 30,
                poolOpacity: 0.11,
            },
            {
                name: 'building-front-light',
                position: [82, 38, 34],
                target: [24, 4, -8],
                color: 0xe4eeff,
                intensity: 4.8,
                distance: 165,
                angle: 0.58,
                penumbra: 0.7,
                decay: 1.25,
                beamRadius: 26,
                beamOpacity: 0.13,
                poolRadius: 32,
                poolOpacity: 0.12,
            },
            {
                name: 'central-yard-light',
                position: [4, 44, 92],
                target: [10, 3, 8],
                color: 0xfff4d0,
                intensity: 5.8,
                distance: 190,
                angle: 0.64,
                penumbra: 0.76,
                decay: 1.18,
                beamRadius: 30,
                beamOpacity: 0.13,
                poolRadius: 38,
                poolOpacity: 0.12,
            },
            {
                name: 'north-workface-light',
                position: [72, 42, -82],
                target: [8, 4, -34],
                color: 0xe7f0ff,
                intensity: 5.2,
                distance: 175,
                angle: 0.62,
                penumbra: 0.74,
                decay: 1.22,
                beamRadius: 28,
                beamOpacity: 0.12,
                poolRadius: 34,
                poolOpacity: 0.11,
            },
        ],
    },

    // ====== 工地建筑配置 ======
    buildings: [
        {
            name: '主楼A',
            pos: [15, 0, -10],
            size: [35, 25, 45],
            color: 0x667788,
            hasWindows: true,
        },
        {
            name: '主楼B',
            pos: [55, 0, -35],
            size: [25, 18, 30],
            color: 0x556677,
            hasWindows: true,
        },
    ],

    // ====== 塔吊配置 ======
    cranes: [
        { pos: [-30, 0, -30], height: 60, armLength: 35, color: 0xff8800 },
    ],

    // ====== 危险区域 fallback（权威来源为后端 /api/zones） ======
    dangerZones: [
        { name: '塔吊作业区', id: 'tower_crane',     x: -40, z: -40, w: 30, d: 30, color: 0xff3344, polygon: [[-40, -40], [-10, -40], [-10, -10], [-40, -10]] },
        { name: '临边防护区', id: 'building_edge',    x: 10,  z: -20, w: 40, d: 15, color: 0xffaa00, polygon: [[10, -20], [50, -20], [50, -5], [10, -5]] },
        { name: '材料堆放区', id: 'material_storage', x: -30, z: 40,  w: 25, d: 20, color: 0xff8800, polygon: [[-30, 40], [-5, 40], [-5, 60], [-30, 60]] },
    ],

    // ====== 摄像头配置（3D 场景中的位置 + 监控参数） ======
    cameras: [
        {
            id: 1, name: '主监控',
            pos: [-60, 45, 60],
            lookAt: [0, 5, 0],
            fov: 75, far: 250,
            color: 0x00ff88,
            region: '主施工区',
        },
        {
            id: 2, name: '堆场监控',
            pos: [-70, 40, 10],
            lookAt: [-30, 5, 40],
            fov: 75, far: 250,
            color: 0x00aaff,
            region: '材料堆放区',
        },
        {
            id: 3, name: '塔吊监控',
            pos: [30, 50, -70],
            lookAt: [-20, 30, -30],
            fov: 90, far: 300,
            color: 0xffaa00,
            region: '塔吊作业区',
        },
        {
            id: 4, name: '入口监控',
            pos: [-28, 26, 116],
            lookAt: [10, 5, 84],
            fov: 68, far: 230,
            color: 0xff44ff,
            region: '工地入口',
        },
    ],

    // ====== 坐标映射（像素→3D 世界坐标） ======
    coordMap: {
        range: [-60, 60],   // 映射到 3D 场景的 X/Z 范围
    },

    // ====== 报警特效参数 ======
    alert: {
        pulseRings: 3,
        pulseDuration: 2000,   // ms
        glowHeight: 12,
        glowRadius: 1.5,
        labelOffset: 4,
        fadeOutDuration: 8000, // ms
        maxAlerts: 50,
        colors: {
            no_helmet:  0xff3366,
            no_vest:    0xff8800,
            smoke:      0xff6600,
            intrusion:  0xff00ff,
            fall:       0xff0000,
            fire:       0xff4400,
        },
        labels: {
            no_helmet:  '未戴安全帽',
            no_vest:    '未穿反光衣',
            smoke:      '吸烟检测',
            intrusion:  '区域入侵',
            fall:       '人员跌倒',
            fire:       '明火检测',
        },
    },

    // ====== 雷达扫描参数 ======
    radar: {
        radius: 80,
        speed: 0.02,
        color: 0x00ffcc,
        opacity: 0.08,
    },

    // ====== 粒子参数 ======
    particles: {
        count: 0,
        size: 0.3,
        range: 200,
        color: 0x4488ff,
        speed: 0.01,
    },

    // ====== WebSocket 配置 ======
    ws: {
        url: 'ws://localhost:8000/ws',
        reconnectInterval: 3000,
    },

    // ====== 后端 API ======
    api: {
        base: 'http://localhost:8000',
        endpoints: {
            health:  '/api/health',
            zones:   '/api/zones',
            videos:  '/api/videos',
            addVideo:  '/api/videos/add',
            removeVideo:'/api/videos/remove',
        },
    },

    // ====== 动画参数 ======
    animation: {
        panelFadeIn: 400,       // ms
        numberRoll: 600,         // ms
        cameraSwitch: 800,       // ms
        alertPulse: 1000,        // ms
        zoneBreath: 2000,        // ms
    },

    // ====== FPS 监控 ======
    fps: {
        updateInterval: 500,    // ms
        warnThreshold: 30,
    },

    // ====== 图表刷新间隔 ======
    charts: {
        refreshInterval: 2000,  // ms
        maxDataPoints: 30,
    },
};

export default CONFIG;

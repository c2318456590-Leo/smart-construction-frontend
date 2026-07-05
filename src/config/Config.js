/**
 * Config.js — 全局配置中心
 * 所有颜色、尺寸、动画、场景、WebSocket 参数集中管理
 */

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
    },

    // ====== 相机参数 ======
    camera: {
        fov: 50,
        near: 0.1,
        far: 2000,
        position:   [140, 110, 140],
        target:     [0, 10, 0],
        damping: 0.05,
        maxPolar: Math.PI / 2 - 0.02,
    },

    // ====== 渲染参数 ======
    render: {
        shadowMapSize: 4096,
        toneMappingExposure: 1.0,
        bloom: {
            strength: 0.8,
            radius: 0.6,
            threshold: 0.15,
        },
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
            fov: 55, far: 200,
            color: 0x00ff88,
            region: '主施工区',
        },
        {
            id: 2, name: '堆场监控',
            pos: [-70, 40, 10],
            lookAt: [-30, 5, 40],
            fov: 55, far: 200,
            color: 0x00aaff,
            region: '材料堆放区',
        },
        {
            id: 3, name: '塔吊监控',
            pos: [30, 50, -70],
            lookAt: [-20, 5, -30],
            fov: 55, far: 200,
            color: 0xffaa00,
            region: '塔吊作业区',
        },
        {
            id: 4, name: '入口监控',
            pos: [70, 35, 50],
            lookAt: [20, 5, 20],
            fov: 55, far: 200,
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
        count: 200,
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

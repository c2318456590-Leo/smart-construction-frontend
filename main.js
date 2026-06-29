import * as THREE from './libs/three.module.js';
import { OrbitControls } from './libs/OrbitControls.js';

// --- 全局变量声明 ---
let ws = null;
let wsConnected = false;
let currentCameraId = 1;

// --- 获取 UI 元素 ---
const alertDashboard = document.querySelector('#alert-dashboard');

// --- 统计计数器 ---
const stats = {
    total: 0, no_helmet: 0, no_vest: 0, smoke: 0, intrusion: 0, fall: 0
};

// ====== 精致工人模型创建函数 ======
function createWorkerMesh(hasHelmet = true, workerId = 'default') {
    const group = new THREE.Group();
    group.name = `Worker_${workerId}`;
    
    // 材质
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.7 });
    const helmetMat = new THREE.MeshStandardMaterial({ 
        color: hasHelmet ? 0xffcc00 : 0xffcc00,  // 安全帽黄色
        metalness: 0.3, 
        roughness: 0.5 
    });
    const clothMat = new THREE.MeshStandardMaterial({ 
        color: 0x2244aa,  // 蓝色工装
        roughness: 0.8 
    });
    const pantsMat = new THREE.MeshStandardMaterial({ 
        color: 0x333333,  // 深色裤子
        roughness: 0.9 
    });
    const vestMat = new THREE.MeshStandardMaterial({ 
        color: 0xff6600,  // 橙色反光背心
        roughness: 0.7,
        emissive: 0xff3300,
        emissiveIntensity: 0.1
    });
    
    // 身体 - 躯干
    const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.7, 0.35),
        clothMat
    );
    torso.position.y = 1.1;
    torso.castShadow = true;
    group.add(torso);
    
    // 反光背心
    const vest = new THREE.Mesh(
        new THREE.BoxGeometry(0.65, 0.45, 0.38),
        vestMat
    );
    vest.position.y = 1.15;
    vest.castShadow = true;
    group.add(vest);
    
    // 头部
    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 16, 16),
        skinMat
    );
    head.position.y = 1.65;
    head.castShadow = true;
    group.add(head);
    
    // 安全帽
    const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        helmetMat
    );
    helmet.position.y = 1.7;
    helmet.castShadow = true;
    group.add(helmet);
    
    // 帽檐
    const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.05, 16),
        helmetMat
    );
    brim.position.y = 1.65;
    brim.castShadow = true;
    group.add(brim);
    
    // 手臂
    const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
    const leftArm = new THREE.Mesh(armGeo, clothMat);
    leftArm.position.set(-0.4, 1.0, 0);
    leftArm.rotation.z = Math.PI / 6;
    leftArm.castShadow = true;
    group.add(leftArm);
    
    const rightArm = new THREE.Mesh(armGeo, clothMat);
    rightArm.position.set(0.4, 1.0, 0);
    rightArm.rotation.z = -Math.PI / 6;
    rightArm.castShadow = true;
    group.add(rightArm);
    
    // 腿
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.15, 0.35, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);
    
    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.15, 0.35, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);
    
    // 鞋子
    const shoeGeo = new THREE.BoxGeometry(0.15, 0.08, 0.25);
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(-0.15, 0.04, 0.03);
    leftShoe.castShadow = true;
    group.add(leftShoe);
    
    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0.15, 0.04, 0.03);
    rightShoe.castShadow = true;
    group.add(rightShoe);
    
    return group;
}

// --- 多工人管理器 ---
const workerManager = {
    workers: new Map(),  // id -> THREE.Group

    update(workersData) {
        const activeIds = new Set();
        workersData.forEach(w => {
            activeIds.add(w.id);
            if (!this.workers.has(w.id)) {
                // 创建精致工人模型
                const mesh = createWorkerMesh(w.helmet !== false, w.id);
                mesh.position.set(w.x, 0, w.z);
                mesh.castShadow = true;
                scene.add(mesh);
                this.workers.set(w.id, mesh);
            }
            // 更新位置
            const mesh = this.workers.get(w.id);
            mesh.position.x = w.x;
            mesh.position.z = w.z;
            
            // 旋转面向移动方向
            const prev = mesh.userData.prevPos;
            if (prev) {
                const dx = w.x - prev.x;
                const dz = w.z - prev.z;
                if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
                    mesh.rotation.y = Math.atan2(dx, dz);
                }
            }
            mesh.userData.prevPos = { x: w.x, z: w.z };
            
            // 安全帽状态颜色：无安全帽显示红色警告
            if (w.helmet === false) {
                mesh.children[3].material.color.setHex(0xff0000); // 头盔变红
            } else {
                mesh.children[3].material.color.setHex(0xffcc00); // 正常黄色
            }
        });
        // 移除离场工人
        for (const [id, mesh] of this.workers) {
            if (!activeIds.has(id)) {
                scene.remove(mesh);
                this.workers.delete(id);
            }
        }
    },

    updateSingle(x, z) {
        this.update([{ id: 'default', x, z, helmet: true }]);
    }
};

// --- 初始化 渲染器 和 画布 ---
const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

renderer.shadowMap.enabled = true; 
renderer.shadowMap.type = THREE.PCFSoftShadowMap; 

// --- 初始化 场景 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);  // 天空蓝

// --- 雾效增加深度感 ---
scene.fog = new THREE.Fog(0x87ceeb, 150, 400);

// --- 初始化 相机 和 控制器 ---
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 1, 1000);
camera.position.set(120, 100, 120); 
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 10, 0);
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.update(); 

// ====== 工地场地设定 (200x200 单位) =====
const SITE_SIZE = 200;
const gridHelper = new THREE.GridHelper(SITE_SIZE, 40, 0x555555, 0x444444);
scene.add(gridHelper);

// ====== 地面纹理 ======
const groundGeo = new THREE.PlaneGeometry(SITE_SIZE, SITE_SIZE);
const groundMat = new THREE.MeshStandardMaterial({ 
    color: 0x5a5a3a,  // 泥土色
    roughness: 0.9 
}); 
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true; 
scene.add(ground);

// ====== 水泥地面区域 ======
const concreteGeo = new THREE.PlaneGeometry(80, 60);
const concreteMat = new THREE.MeshStandardMaterial({ 
    color: 0x808080,
    roughness: 0.7 
});
const concrete = new THREE.Mesh(concreteGeo, concreteMat);
concrete.rotation.x = -Math.PI / 2;
concrete.position.set(0, 0.01, 0);
concrete.receiveShadow = true;
scene.add(concrete);

// ====== 危险区域定义和可视化 ======
const dangerZones = [
    { name: '塔吊作业区', id: 'tower_crane', x: -40, z: -40, w: 30, d: 30, color: 0xff4444 },
    { name: '临边防护区', id: 'building_edge', x: 10, z: -20, w: 40, d: 15, color: 0xffaa00 },
    { name: '材料堆放区', id: 'material_storage', x: -30, z: 40, w: 25, d: 20, color: 0xff8800 }
];

// 创建危险区域标记
dangerZones.forEach(zone => {
    // 半透明危险区域地面标记
    const zoneGeo = new THREE.PlaneGeometry(zone.w, zone.d);
    const zoneMat = new THREE.MeshStandardMaterial({
        color: zone.color,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide
    });
    const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    zoneMesh.rotation.x = -Math.PI / 2;
    zoneMesh.position.set(zone.x + zone.w/2, 0.02, zone.z + zone.d/2);
    scene.add(zoneMesh);
    
    // 危险区域边界线
    const borderPoints = [
        new THREE.Vector3(zone.x, 0.1, zone.z),
        new THREE.Vector3(zone.x + zone.w, 0.1, zone.z),
        new THREE.Vector3(zone.x + zone.w, 0.1, zone.z + zone.d),
        new THREE.Vector3(zone.x, 0.1, zone.z + zone.d),
        new THREE.Vector3(zone.x, 0.1, zone.z)
    ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const borderMat = new THREE.LineBasicMaterial({ color: zone.color, linewidth: 2 });
    const border = new THREE.Line(borderGeo, borderMat);
    scene.add(border);
    
    // 危险区域警示牌
    const signGroup = new THREE.Group();
    
    // 警示牌柱子
    const poleGeo = new THREE.CylinderGeometry(0.15, 0.15, 3, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(zone.x + 2, 1.5, zone.z + 2);
    pole.castShadow = true;
    signGroup.add(pole);
    
    // 警示牌
    const signGeo = new THREE.BoxGeometry(2, 1.2, 0.1);
    const signMat = new THREE.MeshStandardMaterial({ 
        color: 0xffcc00,
        emissive: 0xff6600,
        emissiveIntensity: 0.3
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(zone.x + 2, 3, zone.z + 2);
    sign.castShadow = true;
    signGroup.add(sign);
    
    scene.add(signGroup);
});

// ====== 主建筑 (更大型的楼体) ======
const buildingGroup = new THREE.Group();

// 主体结构
const buildingGeo = new THREE.BoxGeometry(35, 45, 25);
const buildingMat = new THREE.MeshStandardMaterial({ 
    color: 0x5588cc,
    metalness: 0.1,
    roughness: 0.7
}); 
const building = new THREE.Mesh(buildingGeo, buildingMat);
building.position.set(15, 22.5, -15); 
building.castShadow = true;
building.receiveShadow = true;
buildingGroup.add(building);

// 窗户
for (let floor = 0; floor < 8; floor++) {
    for (let w = 0; w < 5; w++) {
        const windowGeo = new THREE.PlaneGeometry(3, 3);
        const windowMat = new THREE.MeshStandardMaterial({ 
            color: 0x88ccff, 
            emissive: 0x334466,
            emissiveIntensity: 0.5,
            side: THREE.DoubleSide
        });
        const windowMesh = new THREE.Mesh(windowGeo, windowMat);
        windowMesh.position.set(15 + 4 + w * 5 - 12, 5 + floor * 5, -2.5);
        buildingGroup.add(windowMesh);
    }
}

// 脚手架
for (let i = 0; i < 3; i++) {
    const scaffoldGeo = new THREE.CylinderGeometry(0.1, 0.1, 40, 8);
    const scaffoldMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
    const scaffold = new THREE.Mesh(scaffoldGeo, scaffoldMat);
    scaffold.position.set(35 + i * 3, 20, -5);
    scaffold.castShadow = true;
    buildingGroup.add(scaffold);
}
scene.add(buildingGroup);

// ====== 塔吊 (更大型) ======
const TOWER_X = -50; 
const TOWER_Z = -50;
const TOWER_H = 60; 

// 塔吊底座
const baseGeo = new THREE.BoxGeometry(8, 1, 8);
const baseMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
const base = new THREE.Mesh(baseGeo, baseMat);
base.position.set(TOWER_X, 0.5, TOWER_Z);
base.castShadow = true;
scene.add(base);

// 塔身
const mastGeo = new THREE.BoxGeometry(3, TOWER_H, 3);
const mastMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, metalness: 0.8 });
const mast = new THREE.Mesh(mastGeo, mastMat);
mast.position.set(TOWER_X, TOWER_H / 2 + 1, TOWER_Z);
mast.castShadow = true;
scene.add(mast);

// 塔吊回转平台
const rotationGeo = new THREE.CylinderGeometry(2, 2, 2, 8);
const rotation = new THREE.Mesh(rotationGeo, mastMat);
rotation.position.set(TOWER_X, TOWER_H + 1.5, TOWER_Z);
rotation.castShadow = true;
scene.add(rotation);

// 主吊臂 (更长)
const armLength = 50;
const jibGeo = new THREE.BoxGeometry(armLength, 1.5, 1.5);
const jib = new THREE.Mesh(jibGeo, new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.7 }));
jib.position.set(TOWER_X + armLength / 2 - 3, TOWER_H + 2.5, TOWER_Z);
jib.castShadow = true;
scene.add(jib);

// 平衡臂
const counterJibGeo = new THREE.BoxGeometry(20, 1.5, 1.5);
const counterJib = new THREE.Mesh(counterJibGeo, new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.7 }));
counterJib.position.set(TOWER_X - 13, TOWER_H + 2.5, TOWER_Z);
counterJib.castShadow = true;
scene.add(counterJib);

// 吊绳
const cableGeo = new THREE.CylinderGeometry(0.05, 0.05, 30, 8);
const cableMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
const cable = new THREE.Mesh(cableGeo, cableMat);
cable.position.set(TOWER_X + armLength - 5, TOWER_H - 12, TOWER_Z);
scene.add(cable);

// 吊钩
const hookGeo = new THREE.TorusGeometry(0.8, 0.2, 8, 16);
const hook = new THREE.Mesh(hookGeo, new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9 }));
hook.position.set(TOWER_X + armLength - 5, TOWER_H - 27, TOWER_Z);
scene.add(hook);

// ====== 材料堆场 ======
// 钢筋堆
const rebarGroup = new THREE.Group();
for (let i = 0; i < 5; i++) {
    const rebarGeo = new THREE.CylinderGeometry(0.3, 0.3, 15, 8);
    const rebarMat = new THREE.MeshStandardMaterial({ color: 0x884422, metalness: 0.9 });
    const rebar = new THREE.Mesh(rebarGeo, rebarMat);
    rebar.position.set(-35 + i * 3, 0.3, 45);
    rebar.rotation.z = Math.PI / 2;
    rebar.castShadow = true;
    rebarGroup.add(rebar);
}
scene.add(rebarGroup);

// 砖块堆
const brickGeo = new THREE.BoxGeometry(8, 2, 5);
const brickMat = new THREE.MeshStandardMaterial({ color: 0xaa5533, roughness: 0.9 });
const bricks = new THREE.Mesh(brickGeo, brickMat);
bricks.position.set(-25, 1, 50);
bricks.castShadow = true;
scene.add(bricks);

// 水泥搅拌车 (简化模型)
const truckGroup = new THREE.Group();
const truckBody = new THREE.Mesh(
    new THREE.BoxGeometry(6, 2.5, 2.5),
    new THREE.MeshStandardMaterial({ color: 0xffaa00 })
);
truckBody.position.y = 1.5;
truckGroup.add(truckBody);
const truckCab = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2.3),
    new THREE.MeshStandardMaterial({ color: 0xff6600 })
);
truckCab.position.set(-2.5, 1.5, 0);
truckGroup.add(truckCab);
truckGroup.position.set(40, 0, 30);
truckGroup.rotation.y = Math.PI / 4;
scene.add(truckGroup);

// ====== 围墙 ======
const wallGeo = new THREE.BoxGeometry(SITE_SIZE, 4, 0.5);
const wallMat = new THREE.MeshStandardMaterial({ 
    color: 0xaaaaaa,
    roughness: 0.9
});

// 围墙
const wall1 = new THREE.Mesh(wallGeo, wallMat);
wall1.position.set(0, 2, SITE_SIZE / 2 - 2);
wall1.receiveShadow = true;
scene.add(wall1);

const wall2 = new THREE.Mesh(wallGeo, wallMat);
wall2.position.set(0, 2, -SITE_SIZE / 2 + 2);
wall2.receiveShadow = true;
scene.add(wall2);

const wallGeoSide = new THREE.BoxGeometry(0.5, 4, SITE_SIZE);
const wall3 = new THREE.Mesh(wallGeoSide, wallMat);
wall3.position.set(SITE_SIZE / 2 - 2, 2, 0);
wall3.receiveShadow = true;
scene.add(wall3);

const wall4 = new THREE.Mesh(wallGeoSide, wallMat);
wall4.position.set(-SITE_SIZE / 2 + 2, 2, 0);
wall4.receiveShadow = true;
scene.add(wall4);

// ====== 道路 ======
const roadGeo = new THREE.PlaneGeometry(15, 60);
const roadMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
const road = new THREE.Mesh(roadGeo, roadMat);
road.rotation.x = -Math.PI / 2;
road.position.set(70, 0.02, 0);
road.receiveShadow = true;
scene.add(road);

// ====== 光照系统 ======
const ambientLight = new THREE.AmbientLight(0x6688aa, 0.6);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x88ccff, 0x556644, 0.8); 
scene.add(hemiLight);

// 主太阳光
const sunLight = new THREE.DirectionalLight(0xffffff, 1.5); 
sunLight.position.set(100, 150, 80); 
sunLight.castShadow = true; 
sunLight.shadow.camera.left = -150;
sunLight.shadow.camera.right = 150;
sunLight.shadow.camera.top = 150;
sunLight.shadow.camera.bottom = -150;
sunLight.shadow.mapSize.width = 2048; 
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 500;
scene.add(sunLight);

// ====== 多摄像头系统 ======
const cameraSystem = {
    cameras: new Map(),  // camera_id -> {mesh, position, fovMesh, labelDiv, isAlerting}
    
    // 摄像头配置
    configs: [
        { id: 1, name: '主监控', x: 60, y: 50, z: 0, lookAt: { x: -20, y: 0, z: 0 }, fovRadius: 35, fovDepth: 50 },
        { id: 2, name: '堆场监控', x: -60, y: 35, z: 60, lookAt: { x: -30, y: 0, z: 50 }, fovRadius: 25, fovDepth: 40 },
        { id: 3, name: '塔吊监控', x: -50, y: 45, z: -30, lookAt: { x: -30, y: 0, z: -30 }, fovRadius: 30, fovDepth: 45 },
        { id: 4, name: '入口监控', x: 80, y: 25, z: 50, lookAt: { x: 50, y: 0, z: 30 }, fovRadius: 20, fovDepth: 35 }
    ],
    
    // 创建单个摄像头模型
    createCamera(config) {
        const group = new THREE.Group();
        group.name = `Camera_${config.id}`;
        
        const { x, y, z, lookAt, fovRadius, fovDepth } = config;
        
        // 立柱
        const poleGeo = new THREE.CylinderGeometry(0.3, 0.3, y - 3, 12);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x666666 });
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(x, (y - 3) / 2, z);
        pole.castShadow = true;
        group.add(pole);
        
        // 底座
        const baseGeo = new THREE.CylinderGeometry(1, 1.2, 2, 16);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.set(x, y - 2, z);
        base.castShadow = true;
        group.add(base);
        
        // 摄像头本体
        const bodyGeo = new THREE.BoxGeometry(1.5, 1, 2);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.set(x, y, z);
        body.castShadow = true;
        group.add(body);
        
        // 镜头
        const lensGeo = new THREE.SphereGeometry(0.4, 16, 16);
        const lensMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 });
        const lens = new THREE.Mesh(lensGeo, lensMat);
        // 镜头朝向监控区域
        const dx = lookAt.x - x;
        const dz = lookAt.z - z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        lens.position.set(x + dx / dist * 1.5, y, z + dz / dist * 1.5);
        group.add(lens);
        
        // 警示灯（顶部红色灯）
        const lightGeo = new THREE.SphereGeometry(0.25, 16, 16);
        const lightMat = new THREE.MeshStandardMaterial({ 
            color: 0x00ff00, 
            emissive: 0x00ff00,
            emissiveIntensity: 0.3
        });
        const alertLight = new THREE.Mesh(lightGeo, lightMat);
        alertLight.position.set(x, y + 0.7, z);
        alertLight.name = 'alertLight';
        group.add(alertLight);
        
        // 视锥（监控范围）
        const fovGeo = new THREE.ConeGeometry(fovRadius, fovDepth, 32, 1, true);
        const fovMat = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const fovMesh = new THREE.Mesh(fovGeo, fovMat);
        // 计算视锥位置和方向
        const fovCenterX = x + (lookAt.x - x) / 2;
        const fovCenterY = y - fovDepth / 2 - 5;
        const fovCenterZ = z + (lookAt.z - z) / 2;
        fovMesh.position.set(fovCenterX, fovCenterY, fovCenterZ);
        // 视锥朝向监控区域
        const angleY = Math.atan2(lookAt.x - x, lookAt.z - z);
        fovMesh.rotation.x = Math.PI / 2;
        fovMesh.rotation.z = -angleY;
        fovMesh.name = 'fovMesh';
        group.add(fovMesh);
        
        scene.add(group);
        
        // HTML标签
        const labelDiv = document.createElement('div');
        labelDiv.className = 'camera-label';
        labelDiv.dataset.cameraId = config.id;
        labelDiv.innerHTML = `<span class="cam-icon">📹</span> ${config.name}`;
        labelDiv.style.cssText = `
            position: absolute;
            background: rgba(0,100,0,0.7);
            color: #00ff00;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.3s;
            z-index: 50;
        `;
        labelDiv.onclick = () => this.selectCamera(config.id);
        document.body.appendChild(labelDiv);
        
        return {
            group,
            body,
            lens,
            alertLight,
            fovMesh,
            labelDiv,
            position: { x, y, z },
            config,
            isAlerting: false,
            originalColor: 0x00ff00
        };
    },
    
    // 初始化所有摄像头
    init() {
        this.configs.forEach(cfg => {
            const cam = this.createCamera(cfg);
            this.cameras.set(cfg.id, cam);
        });
    },
    
    // 选择摄像头（切换视频源）
    selectCamera(camId) {
        currentCameraId = camId;
        
        // 更新所有摄像头标签样式
        this.cameras.forEach((cam, id) => {
            if (id === camId) {
                cam.labelDiv.style.background = 'rgba(0,150,0,0.9)';
                cam.labelDiv.style.border = '2px solid #00ff00';
                cam.fovMesh.material.opacity = 0.25;
                cam.fovMesh.material.color.setHex(0x00ff00);
            } else {
                cam.labelDiv.style.background = 'rgba(50,50,50,0.7)';
                cam.labelDiv.style.border = 'none';
                cam.fovMesh.material.opacity = 0.08;
                cam.fovMesh.material.color.setHex(0x888888);
            }
        });
        
        // 更新视频面板标题
        const videoTitle = document.querySelector('.video-title');
        if (videoTitle) {
            const cam = this.cameras.get(camId);
            videoTitle.textContent = `${cam.config.name} - 实时画面`;
        }
        
        // 通知后端切换视频源（如果WebSocket已连接）
        if (typeof ws !== 'undefined' && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'switch_camera', camera_id: camId }));
        }
        
        // 相机飞向该摄像头位置
        const cam = this.cameras.get(camId);
        const targetPos = new THREE.Vector3(cam.position.x, cam.position.y + 10, cam.position.z + 20);
        camera.position.lerp(targetPos, 0.3);
        controls.target.set(cam.config.lookAt.x, 0, cam.config.lookAt.z);
        controls.update();
    },
    
    // 触发报警闪烁
    triggerAlert(camId, alertType) {
        const cam = this.cameras.get(camId);
        if (!cam) return;
        
        cam.isAlerting = true;
        const alertLight = cam.alertLight;
        const fovMesh = cam.fovMesh;
        const labelDiv = cam.labelDiv;
        
        // 根据报警类型设置颜色
        const alertColors = {
            no_helmet: 0xff0000,
            fall: 0xffff00,
            smoke: 0xff8800,
            intrusion: 0x00ffff,
            danger: 0xff0000
        };
        const alertColor = alertColors[alertType] || 0xff0000;
        
        // 闪烁动画
        let flashCount = 0;
        const flashInterval = setInterval(() => {
            flashCount++;
            const isOn = flashCount % 2 === 0;
            
            // 警示灯闪烁
            alertLight.material.color.setHex(isOn ? alertColor : 0x000000);
            alertLight.material.emissive.setHex(isOn ? alertColor : 0x000000);
            alertLight.material.emissiveIntensity = isOn ? 2.0 : 0;
            
            // 视锥闪烁
            fovMesh.material.color.setHex(isOn ? alertColor : 0x888888);
            fovMesh.material.opacity = isOn ? 0.3 : 0.12;
            
            // 标签闪烁
            labelDiv.style.background = isOn ? `rgba(${alertColor === 0xff0000 ? '255,0,0' : '255,136,0'},0.9)` : 'rgba(50,50,50,0.7)';
            labelDiv.style.color = isOn ? '#fff' : '#888';
            labelDiv.style.border = isOn ? '2px solid red' : 'none';
            
            if (flashCount >= 12) {
                clearInterval(flashInterval);
                cam.isAlerting = false;
                // 恢复正常状态
                alertLight.material.color.setHex(0x00ff00);
                alertLight.material.emissive.setHex(0x00ff00);
                alertLight.material.emissiveIntensity = 0.3;
                fovMesh.material.color.setHex(0x00ff00);
                fovMesh.material.opacity = 0.12;
                labelDiv.style.background = 'rgba(50,50,50,0.7)';
                labelDiv.style.color = '#888';
                labelDiv.style.border = 'none';
            }
        }, 150);
        
        // 相机飞向报警位置
        this.selectCamera(camId);
    },
    
    // 更新标签位置（每帧）
    updateLabels() {
        this.cameras.forEach((cam, id) => {
            const pos = new THREE.Vector3(cam.position.x, cam.position.y + 2, cam.position.z);
            pos.project(camera);
            
            if (pos.z < 1) {
                const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
                const y = (-pos.y * 0.5 + 0.5) * window.innerHeight;
                cam.labelDiv.style.left = `${x}px`;
                cam.labelDiv.style.top = `${y}px`;
                cam.labelDiv.style.display = 'block';
            } else {
                cam.labelDiv.style.display = 'none';
            }
        });
    }
};

// 初始化摄像头系统
cameraSystem.init();

// 选择默认摄像头
cameraSystem.selectCamera(1);

// ====== 坐标系辅助 ======
const axesHelper = new THREE.AxesHelper(30); 
scene.add(axesHelper);

// ====== 动态工人 ======
workerManager.update([{ id: 'default', x: 10, z: 10, helmet: true }]);


// ====== 危险事件标记函数（与 UI 联动） ======
function addDangerPoint(x, y, z, type = "danger", cameraId = 1) {
    const colors = {
        no_helmet: 0xff0000,   // 红色 - 未戴安全帽
        no_vest: 0xff00ff,     // 品红 - 未穿反光衣
        smoke: 0xff8800,       // 橙色 - 吸烟/明火
        intrusion: 0x00ffff,   // 青色 - 区域入侵
        fall: 0xffff00,        // 黄色 - 跌倒
        danger: 0xff0000       // 红色 - 通用危险
    };

    const alertText = {
        no_helmet: '未戴安全帽',
        no_vest: '未穿反光衣',
        smoke: '吸烟/明火',
        intrusion: '区域入侵',
        fall: '人员跌倒',
        danger: '危险行为'
    }[type] || '未知风险';

    // 创建更明显的报警标记组
    const markerGroup = new THREE.Group();
    markerGroup.name = `Alert_${type}_${Date.now()}`;

    // 1. 大型发光球体（主标记）
    const mainSphere = new THREE.Mesh(
        new THREE.SphereGeometry(2, 32, 32), 
        new THREE.MeshStandardMaterial({ 
            color: colors[type] || 0xff0000, 
            emissive: colors[type], 
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 0.8
        })
    );
    mainSphere.position.y = 3;
    mainSphere.castShadow = true;
    markerGroup.add(mainSphere);

    // 2. 垂直光柱（警示柱）
    const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 8, 16);
    const pillarMat = new THREE.MeshStandardMaterial({
        color: colors[type] || 0xff0000,
        emissive: colors[type],
        emissiveIntensity: 0.8,
        transparent: true,
        opacity: 0.6
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 4;
    markerGroup.add(pillar);

    // 3. 地面圆环标记
    const ringGeo = new THREE.RingGeometry(1.5, 3, 32);
    const ringMat = new THREE.MeshBasicMaterial({
        color: colors[type] || 0xff0000,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    markerGroup.add(ring);

    // 4. 文字标签（使用 Sprite）
    const canvas2D = document.createElement('canvas');
    canvas2D.width = 256;
    canvas2D.height = 64;
    const ctx = canvas2D.getContext('2d');
    ctx.fillStyle = `#${(colors[type] || 0xff0000).toString(16).padStart(6, '0')}`;
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(alertText, 128, 40);
    
    const texture = new THREE.CanvasTexture(canvas2D);
    const spriteMat = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(8, 2, 1);
    sprite.position.y = 10;
    markerGroup.add(sprite);

    markerGroup.position.set(x, y, z);
    scene.add(markerGroup);

    // --- UI 联动逻辑 ---
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];

    const newItem = document.createElement('div');
    newItem.className = 'alert-item';
    newItem.style.color = `#${(colors[type] || 0xff0000).toString(16).padStart(6, '0')}`;
    newItem.innerHTML = `<span class="alert-time">${timeStr}</span> <span class="alert-type">[${alertText}]</span> <br>位置: X${x.toFixed(1)}, Z${z.toFixed(1)}`;
    
    // 点击预警条目 → 相机飞向3D对应位置
    newItem.addEventListener('click', () => {
        const targetPos = new THREE.Vector3(x, 10, z);
        const offset = new THREE.Vector3(30, 40, 30);
        camera.position.copy(targetPos).add(offset);
        controls.target.copy(targetPos);
        controls.update();
    });

    alertDashboard.prepend(newItem);

    // 更新统计看板
    stats.total++;
    if (stats[type] !== undefined) stats[type]++;
    updateStatsPanel();

    if (alertDashboard.children.length > 20) {
        alertDashboard.lastChild.remove();
    }
    // --- UI 联动结束 ---

    // 闪烁动画
    let flashCount = 0;
    const flashInterval = setInterval(() => {
        flashCount++;
        if (flashCount % 2 === 0) {
            mainSphere.material.opacity = 0.8;
            pillar.material.emissiveIntensity = 0.8;
        } else {
            mainSphere.material.opacity = 0.3;
            pillar.material.emissiveIntensity = 1.5;
        }
        if (flashCount >= 10) {
            clearInterval(flashInterval);
            // 5秒后移除标记
            setTimeout(() => {
                scene.remove(markerGroup);
                // 清理资源
                markerGroup.children.forEach(child => {
                    if (child.geometry) child.geometry.dispose();
                    if (child.material) {
                        if (child.material.map) child.material.map.dispose();
                        child.material.dispose();
                    }
                });
            }, 5000);
        }
    }, 200);
}


// ====== 统计看板更新函数 ======
function updateStatsPanel() {
    const el = (id) => document.getElementById(id);
    if (el('total-count')) el('total-count').textContent = stats.total;
    if (el('helmet-count')) el('helmet-count').textContent = stats.no_helmet;
    if (el('vest-count')) el('vest-count').textContent = stats.no_vest;
    if (el('smoke-count')) el('smoke-count').textContent = stats.smoke;
    if (el('intrusion-count')) el('intrusion-count').textContent = stats.intrusion;
    if (el('fall-count')) el('fall-count').textContent = stats.fall;
}


// ====== WebSocket & 模拟数据 ======
function connectWS() { 
    ws = new WebSocket(`ws://localhost:8000/ws?camera_id=${currentCameraId}`);
    ws.onopen = () => {
        console.log("WebSocket 已连接");
        wsConnected = true;
        const camLabel = document.getElementById('cam-label');
        if (camLabel) camLabel.textContent = `Cam ${currentCameraId} - 已连接`;
    };
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'event') {
                // 报警事件 - 显示标记并触发摄像头闪烁
                const camId = data.camera_id || currentCameraId;
                addDangerPoint(data.x, 0.2, data.z, data.event, camId);
                // 触发对应摄像头闪烁
                cameraSystem.triggerAlert(camId, data.event);
                
            } else if (data.type === 'track') {
                if (data.workers) {
                    workerManager.update(data.workers);
                } else if (data.x !== undefined) {
                    workerManager.updateSingle(data.x, data.z);
                }
                
            } else if (data.type === 'video_frame') {
                const camFeed = document.getElementById('cam-feed');
                if (camFeed) {
                    camFeed.src = data.frame;
                    const camLabel = document.getElementById('cam-label');
                    if (camLabel) {
                        const cam = cameraSystem.cameras.get(data.camera_id);
                        camLabel.textContent = `${cam ? cam.config.name : 'Cam ' + data.camera_id} - 实时画面`;
                    }
                }
                
            } else if (data.type === 'alert_from_camera') {
                // 来自其他摄像头的报警通知
                const camId = data.camera_id;
                const alertType = data.alert_type;
                cameraSystem.triggerAlert(camId, alertType);
                // 在报警面板显示
                const cam = cameraSystem.cameras.get(camId);
                if (cam) {
                    const newItem = document.createElement('div');
                    newItem.className = 'alert-item';
                    newItem.style.color = '#ff8800';
                    newItem.innerHTML = `<span class="alert-time">${new Date().toTimeString().split(' ')[0]}</span> <span class="alert-type">[${cam.config.name}报警]</span>`;
                    newItem.onclick = () => cameraSystem.selectCamera(camId);
                    alertDashboard.prepend(newItem);
                }
            }
        } catch (error) {
            console.error("错误的事件格式：", event.data);
        }
    };
    ws.onclose = () => {
        console.log("WebSocket 断开，3 秒后重连");
        wsConnected = false;
        const camLabel = document.getElementById('cam-label');
        if (camLabel) camLabel.textContent = "连接断开，重连中...";
        setTimeout(connectWS, 3000);
    };
    ws.onerror = () => {
        const camLabel = document.getElementById('cam-label');
        if (camLabel) camLabel.textContent = "连接失败";
    };
}
connectWS();


// 演示用：模拟工人位置追踪和事件（后端未连接时生效）
setInterval(() => {
    // 如果 WebSocket 已连接，则不生成模拟数据
    if (ws && ws.readyState === WebSocket.OPEN) {
        return;
    }

    // 1. 模拟工人位置（平滑移动，在场地范围内）
    const time = Date.now() * 0.0003;
    const trackX = Math.sin(time * 0.5) * 50;
    const trackZ = Math.cos(time * 0.7) * 50;
    
    workerManager.updateSingle(trackX, trackZ);

    // 2. 模拟随机事件
    if (Math.random() < 0.3) { 
        const randomX = (Math.random() - 0.5) * 100;
        const randomZ = (Math.random() - 0.5) * 100; 
        const events = ['no_helmet', 'no_vest', 'smoke', 'intrusion', 'fall'];
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        addDangerPoint(randomX, 0.2, randomZ, randomEvent, 1);
        // 模拟报警时触发摄像头闪烁
        cameraSystem.triggerAlert(1, randomEvent);
    }
}, 500);


// ====== 动画循环 ======
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    
    // 更新摄像头标签位置
    cameraSystem.updateLabels();
    
    renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
});
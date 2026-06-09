import * as THREE from './libs/three.module.js';
import { OrbitControls } from './libs/OrbitControls.js';

// --- 获取 UI 元素 ---
const alertDashboard = document.querySelector('#alert-dashboard');
let trackedWorker; 

// --- 初始化 渲染器 和 画布 ---
const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

renderer.shadowMap.enabled = true; 
renderer.shadowMap.type = THREE.PCFSoftShadowMap; 

// --- 初始化 场景 ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111111); 

// --- 初始化 相机 和 控制器 ---
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 1000);
// 调整相机位置，适应更大的场景
camera.position.set(55, 60, 55); 
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 6, 0); // 目标点抬高到建筑中心高度 (12/2=6)
controls.update(); 


// ====== 工程辅助线 ======
const gridHelper = new THREE.GridHelper(100, 100, 0x444444, 0x444444);
scene.add(gridHelper);

const axesHelper = new THREE.AxesHelper(20); 
scene.add(axesHelper);


// ====== 光照 ======
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5); 
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.2); 
dirLight.position.set(50, 50, 50); 
dirLight.castShadow = true; 
dirLight.shadow.camera.left = -60;
dirLight.shadow.camera.right = 60;
dirLight.shadow.camera.top = 60;
dirLight.shadow.camera.bottom = -60;
dirLight.shadow.mapSize.width = 1024; 
dirLight.shadow.mapSize.height = 1024;
scene.add(dirLight);

// ====== 工地地面 ======
const groundGeo = new THREE.PlaneGeometry(100, 100);
const groundMat = new THREE.MeshStandardMaterial({ color: 0x333333 }); 
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true; 
scene.add(ground);

// ====== 核心模型：简易楼体模型 (2倍大小) ======
const buildingGeo = new THREE.BoxGeometry(20, 12, 20); 
const buildingMat = new THREE.MeshStandardMaterial({ color: 0x0055aa, transparent: true, opacity: 0.7 }); 
const building = new THREE.Mesh(buildingGeo, buildingMat);
building.position.set(0, 6, 0); 
building.castShadow = true; 
scene.add(building);


// ====== 核心模型：塔吊 ======
// **修改点 1：塔吊位置换回原位**
const TOWER_X = -20; 
const TOWER_Z = -20;
const TOWER_H = 40; 
// 塔身
const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, TOWER_H, 4),
    new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9, roughness: 0.1 })
);
mast.position.set(TOWER_X, TOWER_H / 2, TOWER_Z);
mast.castShadow = true;
scene.add(mast);

// 塔臂
const armLength = 40;
const jib = new THREE.Mesh(
    new THREE.BoxGeometry(armLength, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.8, roughness: 0.2 })
);
jib.position.set(TOWER_X + armLength / 2 - 0.5, TOWER_H - 0.5, TOWER_Z); // 调整塔臂位置
jib.castShadow = true;
scene.add(jib);


// ====== 场景复杂度增强模型 (围墙/堆场/道路不变) ======
// 1. 工地围墙/围栏
const wallGeo = new THREE.BoxGeometry(100, 3, 1);
const wallMat = new THREE.MeshStandardMaterial({ color: 0x88ff88, transparent: true, opacity: 0.2, side: THREE.DoubleSide });
const wall1 = new THREE.Mesh(wallGeo, wallMat); wall1.position.set(0, 1.5, 49.5); scene.add(wall1);
const wall2 = new THREE.Mesh(wallGeo, wallMat); wall2.rotation.y = Math.PI / 2; wall2.position.set(49.5, 1.5, 0); scene.add(wall2);
// 2. 材料堆场
const rebarGeo = new THREE.BoxGeometry(8, 1, 20);
const rebarMat = new THREE.MeshStandardMaterial({ color: 0xaa6600, metalness: 0.5 });
const storage = new THREE.Mesh(rebarGeo, rebarMat); storage.position.set(-30, 0.5, 30); storage.castShadow = true; scene.add(storage);
// 3. 道路
const roadGeo = new THREE.PlaneGeometry(100, 10);
const roadMat = new THREE.MeshStandardMaterial({ color: 0x444444 });
const road = new THREE.Mesh(roadGeo, roadMat); road.rotation.x = -Math.PI / 2; road.position.set(0, 0.01, -40); road.receiveShadow = true; scene.add(road);


// ====== 摄像头模型（底座 + 视锥） ======
const CAM_H = 20 + 0.25; // 高空摄像头的Y轴高度

// Cam 1 (主监控 - 左侧高空)
const camBase1 = new THREE.Mesh( 
    new THREE.CylinderGeometry(0.15, 0.15, 0.5), 
    new THREE.MeshStandardMaterial({ color: 0x333333 })
);
const CAM1_X = -30;
const CAM1_Z = 0;
camBase1.position.set(CAM1_X, CAM_H, CAM1_Z); 
camBase1.castShadow = true; 
scene.add(camBase1);

const camFOV1 = new THREE.Mesh( 
    new THREE.ConeGeometry(1, 2, 32), 
    new THREE.MeshStandardMaterial({ color: 0xffd700, opacity: 0.45, transparent: true })
);
camFOV1.position.set(CAM1_X, CAM_H - 1.0, CAM1_Z); 
camFOV1.rotation.x = -Math.PI / 4; 
camFOV1.rotation.z = Math.PI / 2; 
scene.add(camFOV1);

// **修改点 2：Cam 3 (新增：右侧高空对称位置)**
const camBase3 = new THREE.Mesh( 
    new THREE.CylinderGeometry(0.15, 0.15, 0.5), 
    new THREE.MeshStandardMaterial({ color: 0x333333 })
);
const CAM3_X = 30; // X轴对称
const CAM3_Z = 0;
camBase3.position.set(CAM3_X, CAM_H, CAM3_Z); 
camBase3.castShadow = true; 
scene.add(camBase3);

const camFOV3 = new THREE.Mesh( 
    new THREE.ConeGeometry(1, 2, 32), 
    new THREE.MeshStandardMaterial({ color: 0xffd700, opacity: 0.45, transparent: true })
);
camFOV3.position.set(CAM3_X, CAM_H - 1.0, CAM3_Z); 
camFOV3.rotation.x = -Math.PI / 4; 
camFOV3.rotation.z = -Math.PI / 2; // 旋转 Z 轴，使视锥朝向中心
scene.add(camFOV3);

// Cam 2 (堆场监控，中等高度)
const camBase2 = new THREE.Mesh( new THREE.CylinderGeometry(0.15, 0.15, 0.5), new THREE.MeshStandardMaterial({ color: 0x333333 }));
camBase2.position.set(40, 2.5 + 0.25, 40); 
camBase2.castShadow = true; 
scene.add(camBase2);
const camFOV2 = new THREE.Mesh( new THREE.ConeGeometry(1, 2, 32), new THREE.MeshStandardMaterial({ color: 0x00ffff, opacity: 0.45, transparent: true }));
camFOV2.position.set(40, 2.5 + 0.25 - 1.0, 40);
camFOV2.rotation.y = -Math.PI * 0.75; 
scene.add(camFOV2);


// ====== 动态模型：被追踪的工人 (仿真点) ======
trackedWorker = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.5, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0x00cc00, metalness: 0.5 })
);
trackedWorker.position.set(0, 1.5 + 0.5, 0); 
trackedWorker.name = 'TrackedWorker';
trackedWorker.castShadow = true;
scene.add(trackedWorker);


// ====== 危险事件标记函数（与 UI 联动，不变） ======
function addDangerPoint(x, y, z, type = "danger") {
    const colors = { no_helmet: 0xff0000, smoke: 0xff8800, intrusion: 0x00ffff, danger: 0xff0000 };

    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 16), 
        new THREE.MeshStandardMaterial({ color: colors[type] || 0xff0000, emissive: colors[type], emissiveIntensity: 0.5 })
    );

    sphere.castShadow = true;
    sphere.receiveShadow = true;
    sphere.position.set(x, y, z);
    scene.add(sphere);

    // --- UI 联动逻辑 ---
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    const alertText = { no_helmet: '未戴安全帽', smoke: '吸烟/烟火', intrusion: '区域入侵', danger: '危险行为' }[type] || '未知风险';

    const newItem = document.createElement('div');
    newItem.className = 'alert-item';
    newItem.style.color = `#${(colors[type] || 0xff0000).toString(16).padStart(6, '0')}`;
    newItem.innerHTML = `<span class="alert-time">${timeStr}</span> <span class="alert-type">[${alertText}]</span> <br>位置: X${x.toFixed(1)}, Z${z.toFixed(1)}`;
    
    alertDashboard.prepend(newItem);

    if (alertDashboard.children.length > 20) {
        alertDashboard.lastChild.remove();
    }
    // --- UI 联动结束 ---

    // 闪烁
    const originColor = sphere.material.color.getHex();
    sphere.material.color.setHex(0xffffff); 

    setTimeout(() => {
        sphere.material.color.setHex(originColor);
        setTimeout(() => scene.remove(sphere), 3000); 
    }, 200);
}


// ====== WebSocket & 模拟数据（保持不变） ======
let ws = null;
function connectWS() { 
    ws = new WebSocket("ws://localhost:8000/ws");
    ws.onopen = () => console.log("WebSocket 已连接");
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'event') {
                addDangerPoint(data.x, 0.2, data.z, data.event); 
            } else if (data.type === 'track') {
                if (trackedWorker) {
                    trackedWorker.position.x = data.x;
                    trackedWorker.position.z = data.z;
                    trackedWorker.material.color.setHex(0x33ff33);
                    setTimeout(() => trackedWorker.material.color.setHex(0x00cc00), 100);
                }
            }
        } catch (error) {
            console.error("错误的事件格式：", event.data);
        }
    };
    ws.onclose = () => { console.log("WebSocket 断开，3 秒后重连"); setTimeout(connectWS, 3000); };
}
connectWS();


// 演示用：模拟工人位置追踪和事件
setInterval(() => {
    // 1. 模拟工人位置（平滑移动）
    const time = Date.now() * 0.0005;
    const trackX = Math.sin(time * 0.5) * 15;
    const trackZ = Math.cos(time * 0.7) * 15;
    
    // 模拟接收到追踪数据 (如果 WebSocket 未连接，则直接在前端更新)
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'track', x: trackX, z: trackZ}));
    } else {
        if (trackedWorker) {
            trackedWorker.position.x = trackX;
            trackedWorker.position.z = trackZ;
            trackedWorker.material.color.setHex(0x33ff33);
            setTimeout(() => trackedWorker.material.color.setHex(0x00cc00), 100);
        }
    }

    // 2. 模拟随机事件
    if (Math.random() < 0.5) { 
        const randomX = (Math.random() - 0.5) * 40;
        const randomZ = (Math.random() - 0.5) * 40; 
        const events = ['no_helmet', 'smoke', 'intrusion'];
        const randomEvent = events[Math.floor(Math.random() * events.length)];
        addDangerPoint(randomX, 0.2, randomZ, randomEvent);
    }
}, 500);


// ====== 动画循环 & 自适应窗口 ======
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});
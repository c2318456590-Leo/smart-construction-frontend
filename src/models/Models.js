/**
 * Models.js — 3D 模型工厂函数集合
 * 本次修改：补齐围墙与大门的 gate.side 显式校验，避免非南门配置被静默误用。
 * 所有函数返回 THREE.Group 或 THREE.Mesh，使用 PBR（MeshStandardMaterial）材质
 * 所有几何体参数均做下限保护 Math.max(0.01, value)，避免负值/零值导致报错
 */

import * as THREE from 'three';
import { CONFIG } from '../config/Config.js';

const MIN_GEOMETRY_SIZE = 0.01;
const SUPPORTED_GATE_SIDE = 'south';
const GATE_PILLAR_RADIUS = 0.4;
const GATE_PILLAR_SEGMENTS = 8;
const GATE_BEAM_HEIGHT = 0.5;
const GATE_BEAM_DEPTH = 0.8;
const GATE_BAR_COUNT = 3;
const GATE_BAR_HEIGHT = 0.15;
const GATE_BAR_DEPTH = 0.15;

/**
 * 创建工地地面：大地面 + 水泥路面 + 网格线
 * @param {number} size 工地边长
 * @returns {THREE.Group}
 */
export function createSiteGround(size) {
    const s = Math.max(0.01, size);
    const group = new THREE.Group();
    group.name = 'SiteGround';

    // 大地面：深色泥土，接收阴影
    const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(s, s),
        new THREE.MeshStandardMaterial({
            color: 0x3a3a2a,   // 深色泥土
            roughness: 0.95,
            metalness: 0.0,
        })
    );
    ground.rotation.x = -Math.PI / 2;   // 平铺
    ground.receiveShadow = true;
    group.add(ground);

    // 水泥路面：灰色，略高于地面避免 z-fighting
    const concrete = new THREE.Mesh(
        new THREE.PlaneGeometry(80, 60),
        new THREE.MeshStandardMaterial({
            color: 0x808080,
            roughness: 0.7,
            metalness: 0.0,
        })
    );
    concrete.rotation.x = -Math.PI / 2;
    concrete.position.y = 0.01;
    concrete.receiveShadow = true;
    group.add(concrete);

    // 网格线：深蓝科技风
    const grid = new THREE.GridHelper(s, 40, 0x223344, 0x112233);
    group.add(grid);

    // 地面裙边：更大的底面防止边缘虚空
    if (CONFIG.scene.groundSkirt) {
        const skirtSize = CONFIG.scene.groundSkirtSize;
        const skirtGeo = new THREE.PlaneGeometry(skirtSize, skirtSize);
        const skirtMat = new THREE.MeshStandardMaterial({
            color: 0x3a4a3a,  // 深绿灰，模拟远处地面
            roughness: 0.95,
            metalness: 0.0,
        });
        const skirt = new THREE.Mesh(skirtGeo, skirtMat);
        skirt.rotation.x = -Math.PI / 2;
        skirt.position.y = -0.1;  // 略低于主地面
        skirt.receiveShadow = false;
        group.add(skirt);
    }

    return group;
}

/**
 * 创建工地围墙（四面墙体，南侧留出大门缺口）。
 * @param {Object} config - 围墙配置对象
 * @param {number} config.size - 围墙边长
 * @param {number} config.wallHeight - 墙高
 * @param {number} config.wallThickness - 墙厚
 * @param {number} config.wallColor - 墙色（hex）
 * @param {Object} config.gate - 大门配置
 * @returns {THREE.Group} 围墙 Group
 */
export function createPerimeterWall(config) {
    const group = new THREE.Group();
    group.name = 'perimeter-wall';

    const { size, wallHeight, wallThickness, wallColor, gate } = config;
    const half = size / 2;
    const h = Math.max(MIN_GEOMETRY_SIZE, wallHeight);
    const t = Math.max(MIN_GEOMETRY_SIZE, wallThickness);
    const side = normalizeGateSide(gate.side);

    const material = new THREE.MeshStandardMaterial({
        color: wallColor,
        roughness: 0.85,
        metalness: 0.05,
    });

    // 创建墙段的辅助函数
    const makeWallSegment = (width, posX, posZ, rotY = 0) => {
        const geo = new THREE.BoxGeometry(width, h, t);
        const mesh = new THREE.Mesh(geo, material);
        mesh.position.set(posX, h / 2, posZ);
        mesh.rotation.y = rotY;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        return mesh;
    };

    // 北墙（z = -half）
    group.add(makeWallSegment(size, 0, -half));

    // 东墙（x = +half）
    group.add(makeWallSegment(size, half, 0, Math.PI / 2));

    // 西墙（x = -half）
    group.add(makeWallSegment(size, -half, 0, Math.PI / 2));

    // 南墙（z = +half），留出大门缺口（大门在正中）
    const southSegmentWidth = side === SUPPORTED_GATE_SIDE
        ? Math.max(MIN_GEOMETRY_SIZE, (size - gate.width) / 2)
        : size;
    // 左段（西侧）
    group.add(makeWallSegment(southSegmentWidth, -(half - southSegmentWidth / 2), half));
    // 右段（东侧）
    if (side === SUPPORTED_GATE_SIDE) {
        group.add(makeWallSegment(southSegmentWidth, (half - southSegmentWidth / 2), half));
    }

    return group;
}

/**
 * 创建工地大门（两根门柱 + 门梁 + 横杆装饰）。
 * @param {Object} config - 围墙配置对象（含 gate 子配置）
 * @returns {THREE.Group} 大门 Group
 */
export function createGate(config) {
    const group = new THREE.Group();
    group.name = 'site-gate';

    const { size, gate } = config;
    const half = size / 2;
    const gateHalf = gate.width / 2;
    const gateH = Math.max(MIN_GEOMETRY_SIZE, gate.height);
    normalizeGateSide(gate.side);

    const pillarMat = new THREE.MeshStandardMaterial({
        color: 0x666666,
        roughness: 0.6,
        metalness: 0.3,
    });

    const beamMat = new THREE.MeshStandardMaterial({
        color: 0x4488cc,
        roughness: 0.5,
        metalness: 0.4,
    });

    // 门柱（圆柱）
    const pillarGeo = new THREE.CylinderGeometry(
        GATE_PILLAR_RADIUS,
        GATE_PILLAR_RADIUS,
        gateH,
        GATE_PILLAR_SEGMENTS
    );

    const leftPillar = new THREE.Mesh(pillarGeo, pillarMat);
    leftPillar.position.set(-gateHalf, gateH / 2, half);
    leftPillar.castShadow = true;
    group.add(leftPillar);

    const rightPillar = new THREE.Mesh(pillarGeo, pillarMat);
    rightPillar.position.set(gateHalf, gateH / 2, half);
    rightPillar.castShadow = true;
    group.add(rightPillar);

    // 门梁（横跨两柱顶部）
    const beamGeo = new THREE.BoxGeometry(
        gate.width + GATE_PILLAR_RADIUS * 2,
        GATE_BEAM_HEIGHT,
        GATE_BEAM_DEPTH
    );
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(0, gateH, half);
    beam.castShadow = true;
    group.add(beam);

    // 横杆装饰（门梁下方横条）
    const barGeo = new THREE.BoxGeometry(gate.width, GATE_BAR_HEIGHT, GATE_BAR_DEPTH);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.5, roughness: 0.4 });
    for (let i = 1; i <= GATE_BAR_COUNT; i++) {
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(0, gateH * (i / (GATE_BAR_COUNT + 1)), half);
        group.add(bar);
    }

    return group;
}

/**
 * 校验大门方向配置，当前版本仅支持南侧大门。
 * @param {string} side 大门方向配置
 * @returns {string} 可用于建模的大门方向
 */
function normalizeGateSide(side) {
    if (side === SUPPORTED_GATE_SIDE) return side;

    console.warn(`[Models] gate.side="${side}" 暂不支持，已回退为 "${SUPPORTED_GATE_SIDE}"。`);
    return SUPPORTED_GATE_SIDE;
}

/**
 * 创建精致工人模型（PBR 材质）
 * @param {boolean} hasHelmet 是否佩戴安全帽
 * @param {string|number} workerId 工人 ID（用于命名）
 * @returns {THREE.Group}
 */
export function createWorkerMesh(hasHelmet = true, workerId = 'default') {
    const group = new THREE.Group();
    group.name = `Worker_${workerId}`;

    // ===== PBR 材质定义 =====
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.7, metalness: 0.0 });
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.8, metalness: 0.0 });  // 蓝色工装
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9, metalness: 0.0 });  // 深色裤子
    const helmetMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, metalness: 0.3, roughness: 0.5 }); // 黄色安全帽
    const vestMat = new THREE.MeshStandardMaterial({   // 橙色反光背心（带自发光）
        color: 0xff6600,
        roughness: 0.7,
        metalness: 0.0,
        emissive: 0xff3300,
        emissiveIntensity: 0.15,
    });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.0 });

    // ===== 躯干（蓝色工装）=====
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.35), clothMat);
    torso.position.y = 1.1;
    torso.castShadow = true;
    group.add(torso);

    // ===== 反光背心（橙色，自发光）=====
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.45, 0.38), vestMat);
    vest.position.y = 1.15;
    vest.castShadow = true;
    group.add(vest);

    // ===== 头部（肤色球体）=====
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), skinMat);
    head.position.y = 1.65;
    head.castShadow = true;
    group.add(head);

    // ===== 安全帽（半球，黄色，金属感）=====
    const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        helmetMat
    );
    helmet.position.y = 1.7;
    helmet.castShadow = true;
    helmet.visible = hasHelmet;   // 无安全帽时不显示
    group.add(helmet);

    // ===== 帽檐（圆柱）=====
    const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.04, 16),
        helmetMat
    );
    brim.position.y = 1.66;
    brim.castShadow = true;
    brim.visible = hasHelmet;     // 无安全帽时不显示
    group.add(brim);

    // ===== 手臂（左右圆柱）=====
    const armGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.5, 8);
    const leftArm = new THREE.Mesh(armGeo, clothMat);
    leftArm.position.set(-0.4, 1.0, 0);
    leftArm.rotation.z = Math.PI / 6;       // 略向外展
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, clothMat);
    rightArm.position.set(0.4, 1.0, 0);
    rightArm.rotation.z = -Math.PI / 6;
    rightArm.castShadow = true;
    group.add(rightArm);

    // ===== 腿（左右圆柱）=====
    const legGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.7, 8);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.position.set(-0.15, 0.35, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.position.set(0.15, 0.35, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);

    // ===== 鞋（左右方块）=====
    const shoeGeo = new THREE.BoxGeometry(0.15, 0.08, 0.25);
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

/**
 * 创建建筑模型（主体 + 四面发光窗户）
 * @param {Object} config { name, pos:[x,y,z], size:[w,h,d], color, hasWindows }
 * @returns {THREE.Group}
 */
export function createBuilding(config) {
    const name = config.name || 'Building';
    const pos = config.pos || [0, 0, 0];
    const size = config.size || [10, 10, 10];
    const color = config.color != null ? config.color : 0x667788;
    const hasWindows = config.hasWindows !== false;

    const w = Math.max(0.01, size[0]);
    const h = Math.max(0.01, size[1]);
    const d = Math.max(0.01, size[2]);

    const group = new THREE.Group();
    group.name = `Building_${name}`;

    // ===== 主体结构 =====
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.8,
            metalness: 0.1,
        })
    );
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // ===== 窗户：在四个面上排列，发光蓝色 =====
    if (hasWindows) {
        const windowMat = new THREE.MeshStandardMaterial({
            color: 0x88ccff,
            emissive: 0x334466,
            emissiveIntensity: 0.6,
            roughness: 0.3,
            metalness: 0.5,
        });
        const winW = Math.min(2, w * 0.15);
        const winH = Math.min(2, h * 0.12);
        const floors = Math.max(1, Math.floor(h / 4));     // 楼层数
        const colsW = Math.max(1, Math.floor(w / 4));      // 宽度方向列数
        const colsD = Math.max(1, Math.floor(d / 4));      // 深度方向列数

        // +Z / -Z 两个面
        for (let f = 0; f < floors; f++) {
            for (let c = 0; c < colsW; c++) {
                const x = -w / 2 + (c + 0.5) * (w / colsW);
                const y = -h / 2 + (f + 0.5) * (h / floors);
                // +Z 面
                const winFront = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), windowMat);
                winFront.position.set(x, y, d / 2 + 0.01);
                group.add(winFront);
                // -Z 面（翻转朝向）
                const winBack = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), windowMat);
                winBack.position.set(x, y, -d / 2 - 0.01);
                winBack.rotation.y = Math.PI;
                group.add(winBack);
            }
        }
        // +X / -X 两个面
        for (let f = 0; f < floors; f++) {
            for (let c = 0; c < colsD; c++) {
                const z = -d / 2 + (c + 0.5) * (d / colsD);
                const y = -h / 2 + (f + 0.5) * (h / floors);
                // +X 面
                const winRight = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), windowMat);
                winRight.position.set(w / 2 + 0.01, y, z);
                winRight.rotation.y = Math.PI / 2;
                group.add(winRight);
                // -X 面
                const winLeft = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), windowMat);
                winLeft.position.set(-w / 2 - 0.01, y, z);
                winLeft.rotation.y = -Math.PI / 2;
                group.add(winLeft);
            }
        }
    }

    // 位置：pos[1] 作为底部，建筑中心在 pos[1] + h/2（保证坐落在地面）
    group.position.set(pos[0], pos[1] + h / 2, pos[2]);
    return group;
}

/**
 * 创建塔吊模型（底座 + 多段塔身 + 回转平台 + 吊臂 + 吊绳 + 吊钩）
 * @param {Object} config { pos:[x,y,z], height, armLength, color }
 * @returns {THREE.Group}
 */
export function createCrane(config) {
    const pos = config.pos || [0, 0, 0];
    const height = Math.max(0.01, config.height || 50);
    const armLength = Math.max(0.01, config.armLength || 35);
    const color = config.color != null ? config.color : 0xff8800;

    const group = new THREE.Group();
    group.name = 'Crane';

    // 橙黄色金属材质
    const metalMat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.8,
        roughness: 0.4,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8, metalness: 0.3 });

    // ===== 底座 =====
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(3, 4, 1.5, 16),
        darkMat
    );
    base.position.y = 0.75;
    base.castShadow = true;
    group.add(base);

    // ===== 塔身（多段细长 BoxGeometry）=====
    const segCount = 6;
    const segH = height / segCount;
    for (let i = 0; i < segCount; i++) {
        const seg = new THREE.Mesh(
            new THREE.BoxGeometry(2, Math.max(0.01, segH), 2),
            metalMat
        );
        seg.position.y = 1.5 + segH * (i + 0.5);
        seg.castShadow = true;
        group.add(seg);
    }

    // ===== 回转平台 =====
    const platformTopY = 1.5 + height;       // 平台底部 Y
    const platform = new THREE.Mesh(
        new THREE.BoxGeometry(4, 1.5, 4),
        metalMat
    );
    platform.position.y = platformTopY + 0.75;
    platform.castShadow = true;
    group.add(platform);

    // ===== 吊臂（长 BoxGeometry）=====
    const jibY = platformTopY + 2.0;
    const jib = new THREE.Mesh(
        new THREE.BoxGeometry(armLength, 1.2, 1.2),
        metalMat
    );
    jib.position.set(armLength / 2 - 2, jibY, 0);
    jib.castShadow = true;
    group.add(jib);

    // ===== 平衡臂 =====
    const counterJib = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.01, armLength * 0.4), 1.2, 1.2),
        metalMat
    );
    counterJib.position.set(-armLength * 0.2 - 1, jibY, 0);
    counterJib.castShadow = true;
    group.add(counterJib);

    // ===== 吊绳（Line）=====
    const hookX = armLength - 4;
    const ropeLen = height * 0.5;
    const ropePoints = [
        new THREE.Vector3(hookX, jibY, 0),
        new THREE.Vector3(hookX, jibY - ropeLen, 0),
    ];
    const ropeGeo = new THREE.BufferGeometry().setFromPoints(ropePoints);
    const rope = new THREE.Line(ropeGeo, new THREE.LineBasicMaterial({ color: 0x333333 }));
    group.add(rope);

    // ===== 吊钩（球体）=====
    const hook = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.9, roughness: 0.3 })
    );
    hook.position.set(hookX, jibY - ropeLen, 0);
    hook.castShadow = true;
    group.add(hook);

    group.position.set(pos[0], pos[1], pos[2]);
    return group;
}

/**
 * 创建危险区域可视化（半透明地面标记 + 发光边界 + 警示牌）
 * @param {Object} zoneConfig { name, id, x, z, w, d, color }
 * @returns {THREE.Group} 位置设为 (x+w/2, 0, z+d/2)
 */
export function createDangerZone(zoneConfig) {
    const name = zoneConfig.name || 'DangerZone';
    const id = zoneConfig.id || 'zone';
    const polygon = Array.isArray(zoneConfig.polygon) && zoneConfig.polygon.length >= 3
        ? zoneConfig.polygon
        : null;
    const bounds = polygon
        ? polygon.reduce((acc, p) => ({
            minX: Math.min(acc.minX, p[0]),
            maxX: Math.max(acc.maxX, p[0]),
            minZ: Math.min(acc.minZ, p[1]),
            maxZ: Math.max(acc.maxZ, p[1]),
        }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity })
        : null;
    const x = bounds ? bounds.minX : (zoneConfig.x || 0);
    const z = bounds ? bounds.minZ : (zoneConfig.z || 0);
    const w = Math.max(0.01, bounds ? bounds.maxX - bounds.minX : (zoneConfig.w || 20));
    const d = Math.max(0.01, bounds ? bounds.maxZ - bounds.minZ : (zoneConfig.d || 20));
    const color = zoneConfig.color != null ? zoneConfig.color : 0xff3344;
    const centerX = x + w / 2;
    const centerZ = z + d / 2;

    const group = new THREE.Group();
    group.name = `DangerZone_${id}_${name}`;

    // ===== 半透明地面标记（自发光）=====
    const markerGeometry = polygon
        ? new THREE.ShapeGeometry(new THREE.Shape(
            polygon.map(([px, pz]) => new THREE.Vector2(px - centerX, -(pz - centerZ)))
        ))
        : new THREE.PlaneGeometry(w, d);
    const marker = new THREE.Mesh(
        markerGeometry,
        new THREE.MeshStandardMaterial({
            color: color,
            transparent: true,
            opacity: 0.2,
            side: THREE.DoubleSide,
            emissive: color,
            emissiveIntensity: 0.3,
        })
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.02;        // 略高于地面避免闪烁
    group.add(marker);

    // ===== 边界发光线（矩形线框）=====
    const halfW = w / 2;
    const halfD = d / 2;
    const borderPoints = polygon
        ? polygon.concat([polygon[0]]).map(([px, pz]) => new THREE.Vector3(px - centerX, 0.1, pz - centerZ))
        : [
            new THREE.Vector3(-halfW, 0.1, -halfD),
            new THREE.Vector3(halfW, 0.1, -halfD),
            new THREE.Vector3(halfW, 0.1, halfD),
            new THREE.Vector3(-halfW, 0.1, halfD),
            new THREE.Vector3(-halfW, 0.1, -halfD),
        ];
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const border = new THREE.Line(borderGeo, new THREE.LineBasicMaterial({ color: color }));
    group.add(border);

    // ===== 警示牌：柱子 + 牌子 =====
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8, metalness: 0.2 })
    );
    pole.position.set(halfW - 1, 1.5, halfD - 1);
    pole.castShadow = true;
    group.add(pole);

    const sign = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 1.0, 0.1),
        new THREE.MeshStandardMaterial({
            color: 0xffcc00,
            emissive: 0xff6600,
            emissiveIntensity: 0.4,
            roughness: 0.5,
            metalness: 0.1,
        })
    );
    sign.position.set(halfW - 1, 3.2, halfD - 1);
    sign.castShadow = true;
    group.add(sign);

    // 整体位置：区域中心
    group.position.set(centerX, 0, centerZ);
    return group;
}

/**
 * 创建 3D 摄像头模型（立柱 + 机身 + 镜头 + 视锥体 + 警示灯）
 * @param {Object} camConfig { id, name, pos:[x,y,z], lookAt:[x,y,z], fov, far, color, region }
 * @returns {THREE.Group} 整体位置在 pos
 */
export function createCameraModel(camConfig) {
    const id = camConfig.id;
    const name = camConfig.name || 'Camera';
    const pos = camConfig.pos || [0, 10, 0];
    const lookAt = camConfig.lookAt || [0, 0, 0];
    const fov = camConfig.fov || 55;
    const far = Math.max(0.01, camConfig.far || 200);
    const color = camConfig.color != null ? camConfig.color : 0x00ff88;

    const group = new THREE.Group();
    group.name = `Camera_${id}_${name}`;
    // 整体位置在 pos（局部原点 = 摄像头位置）
    group.position.set(pos[0], pos[1], pos[2]);

    const px = pos[0];
    const py = Math.max(0.01, pos[1]);
    const pz = pos[2];

    // ===== 立柱（从地面到摄像头高度）=====
    const poleHeight = py;
    const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, poleHeight, 12),
        new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.8, metalness: 0.6 })
    );
    // 局部坐标：柱子顶端在原点，底端在 (0, -py, 0)
    pole.position.set(0, -poleHeight / 2, 0);
    pole.castShadow = true;
    group.add(pole);

    // 摄像头指向 lookAt 的方向向量（局部坐标系，原点 = pos）
    const dir = new THREE.Vector3(
        lookAt[0] - px,
        lookAt[1] - pos[1],
        lookAt[2] - pz
    );
    const dirLen = dir.length();
    if (dirLen > 0.001) {
        dir.normalize();
    } else {
        dir.set(0, 0, -1);   // 默认朝 -Z
    }

    // ===== 摄像头机身（朝向 lookAt）=====
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.8, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.7 })
    );
    // 旋转机身使其 +Z（深度方向）朝向 dir
    body.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    body.castShadow = true;
    group.add(body);

    // ===== 镜头（前突圆柱，沿 dir 方向）=====
    const lensLen = 0.6;
    const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.3, lensLen, 16),
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.9 })
    );
    // 圆柱默认轴沿 Y，旋转到 dir
    lens.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    // 从机身前突（半个机身深度 + 镜头一半长度）
    lens.position.copy(dir).multiplyScalar(0.8 + lensLen / 2);
    lens.castShadow = true;
    group.add(lens);

    // ===== 警示灯（顶部球体）=====
    const alertLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 16, 16),
        new THREE.MeshBasicMaterial({ color: color })
    );
    alertLight.position.set(0, 0.6, 0);
    alertLight.name = 'alertLight';
    group.add(alertLight);

    // ===== 视锥体（从 pos 指向 lookAt）=====
    const coneHeight = far;
    const coneRadius = Math.max(0.01, coneHeight * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    const fovCone = new THREE.Mesh(
        new THREE.ConeGeometry(coneRadius, coneHeight, 32, 1, true),
        new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide,
            depthWrite: false,
        })
    );
    // 锥体默认顶点在 +Y，旋转使顶点在原点、底面沿 dir 方向
    fovCone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
    // 锥体中心偏移：顶点在原点，中心在 dir * (height/2)
    fovCone.position.copy(dir).multiplyScalar(coneHeight / 2);
    fovCone.name = 'fovMesh';
    group.add(fovCone);

    return group;
}

/**
 * 创建雷达扫描效果（旋转扇形）
 * @param {Object} config { radius, speed, color, opacity }
 * @returns {THREE.Mesh} 放在 y=0.05，可绕 Y 轴旋转
 */
export function createRadarScan(config) {
    // 合并 CONFIG.radar 默认值
    const cfg = Object.assign({}, CONFIG.radar, config || {});
    const radius = Math.max(0.01, cfg.radius);
    const speed = cfg.speed;
    const color = cfg.color;
    const opacity = cfg.opacity;

    // 扇形：60 度圆切片
    const geo = new THREE.CircleGeometry(radius, 64, 0, Math.PI / 3);
    const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;   // 平铺地面
    mesh.position.y = 0.05;
    // 保存速度供外部动画循环使用
    mesh.userData.speed = speed;
    mesh.userData.isRadar = true;
    return mesh;
}

/**
 * 创建粒子系统（随机分布的点云）
 * @param {Object} config { count, size, range, color, speed }
 * @returns {THREE.Points}
 */
export function createParticleSystem(config) {
    // 合并 CONFIG.particles 默认值
    const cfg = Object.assign({}, CONFIG.particles, config || {});
    const count = Math.max(1, Math.floor(cfg.count));
    const size = Math.max(0.01, cfg.size);
    const range = Math.max(0.01, cfg.range);
    const color = cfg.color;
    const speed = cfg.speed;

    // 随机位置（在 range 立方范围内）
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * range;
        positions[i * 3 + 1] = Math.random() * range;
        positions[i * 3 + 2] = (Math.random() - 0.5) * range;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
        color: color,
        size: size,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true,    // 远近粒子大小变化
        depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    // 保存参数供外部动画循环使用
    points.userData.speed = speed;
    points.userData.range = range;
    points.userData.isParticles = true;
    return points;
}

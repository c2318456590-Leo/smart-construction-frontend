/**
 * WorkerManager.js —— 工人管理器
 * 职责：
 *   1. 根据 workersData 创建 / 更新 / 移除工人 3D 模型
 *   2. 工人移动时旋转面向移动方向（atan2(dx, dz)）
 *   3. 无安全帽时头盔变红
 *   4. updateSingle 提供单工人模式
 */
import { createWorkerMesh } from '../models/Models.js';

export class WorkerManager {
    /**
     * @param {THREE.Scene} scene 场景
     */
    constructor(scene) {
        this.scene = scene;
        this.workers = new Map(); // id -> THREE.Group
    }

    /**
     * 批量更新工人
     * @param {Array<{id, x, z, helmet}>} workersData
     */
    update(workersData) {
        if (!Array.isArray(workersData)) return;

        const activeIds = new Set();

        workersData.forEach((w) => {
            if (!w || w.id === undefined) return;
            activeIds.add(w.id);

            let mesh = this.workers.get(w.id);
            if (!mesh) {
                // 创建新的工人模型
                mesh = createWorkerMesh(w.helmet !== false, w.id);
                mesh.position.set(w.x, 0, w.z);
                this.scene.add(mesh);
                this.workers.set(w.id, mesh);
            }

            // 旋转面向移动方向（atan2(dx, dz)）
            const prev = mesh.userData.prevPos;
            if (prev) {
                const dx = w.x - prev.x;
                const dz = w.z - prev.z;
                if (Math.abs(dx) > 0.01 || Math.abs(dz) > 0.01) {
                    mesh.rotation.y = Math.atan2(dx, dz);
                }
            }
            mesh.userData.prevPos = { x: w.x, z: w.z };

            // 更新位置
            mesh.position.x = w.x;
            mesh.position.z = w.z;

            // 安全帽状态：无安全帽时头盔变红
            this._updateHelmet(mesh, w.helmet !== false);
        });

        // 移除离场工人
        for (const [id, mesh] of this.workers) {
            if (!activeIds.has(id)) {
                this.scene.remove(mesh);
                this._disposeMesh(mesh);
                this.workers.delete(id);
            }
        }
    }

    /** 单工人模式 */
    updateSingle(x, z) {
        this.update([{ id: 'default', x, z, helmet: true }]);
    }

    /** 清空所有工人 */
    clear() {
        for (const [, mesh] of this.workers) {
            this.scene.remove(mesh);
            this._disposeMesh(mesh);
        }
        this.workers.clear();
    }

    /** 当前工人数量 */
    get count() {
        return this.workers.size;
    }

    // ===================== 内部方法 =====================

    /**
     * 更新安全帽状态
     * 头盔位于 children[3]、帽檐位于 children[4]（与 Models.js 中
     * createWorkerMesh 的构建顺序一致，且二者共享同一 helmetMat 材质）。
     * 注意：Models.js 在 hasHelmet=false 时会隐藏头盔，此处需重新显示，
     * 以便“无安全帽时头盔变红”作为违规警示可见。
     */
    _updateHelmet(mesh, hasHelmet) {
        const helmet = mesh.children[3];
        const brim = mesh.children[4];
        if (helmet && helmet.material) {
            // 无安全帽 → 红色警示；有安全帽 → 正常黄色
            helmet.material.color.setHex(hasHelmet ? 0xffcc00 : 0xff0000);
        }
        // 始终显示头盔（红色或黄色），覆盖 Models.js 的隐藏逻辑
        if (helmet) helmet.visible = true;
        if (brim) brim.visible = true;
    }

    /** 释放工人模型资源 */
    _disposeMesh(mesh) {
        if (!mesh) return;
        mesh.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
                mats.forEach((m) => {
                    if (m.map) m.map.dispose();
                    m.dispose();
                });
            }
        });
    }
}

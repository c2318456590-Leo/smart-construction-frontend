/**
 * VideoPanel.js — 右侧视频与摄像头控制组件
 * 本次修改：从 UIManager.js 拆出视频画面、摄像头按钮、视频源导入/移除逻辑。
 */

import { CONFIG } from '../../config/Config.js';
import { addVideoSource, removeVideoSource } from '../uiApi.js';
import { makeCard } from './helpers.js';
import { EventPanel } from './EventPanel.js';

export class VideoPanel {
    constructor({ emit }) {
        this.emit = emit;
        this.els = {};
        this.selectedCameraId = null;
        this.events = new EventPanel();
    }

    init() {
        const panel = document.createElement('div');
        panel.id = 'right-panel';
        panel.className = 'glass-panel';

        const videoCard = makeCard('视频监控');
        const videoWrap = document.createElement('div');
        videoWrap.className = 'video-wrap';
        const img = document.createElement('img');
        img.id = 'video-img';
        img.alt = '无视频信号';
        const videoName = document.createElement('div');
        videoName.className = 'video-name';
        const vNameLeft = document.createElement('span');
        vNameLeft.textContent = '未连接';
        const vNameRight = document.createElement('span');
        vNameRight.textContent = 'LIVE';
        videoName.appendChild(vNameLeft);
        videoName.appendChild(vNameRight);
        videoWrap.appendChild(img);
        videoWrap.appendChild(videoName);
        videoCard.body.appendChild(videoWrap);
        panel.appendChild(videoCard.root);

        const camCard = makeCard('摄像头列表');
        const camGrid = document.createElement('div');
        camGrid.className = 'cam-grid';
        CONFIG.cameras.forEach((cam) => {
            const btn = document.createElement('button');
            btn.className = 'cam-btn';
            btn.dataset.cameraId = cam.id;
            btn.textContent = cam.name;
            btn.addEventListener('click', () => this._onSelectCamera(cam.id));
            camGrid.appendChild(btn);
        });
        camCard.body.appendChild(camGrid);
        camCard.body.appendChild(this._createImportControls());
        panel.appendChild(camCard.root);

        const eventEls = this.events.init(panel);
        document.body.appendChild(panel);

        this.els = {
            root: panel,
            videoImg: img,
            videoName: vNameLeft,
            camButtons: camGrid,
            ...eventEls,
        };
        return this.els;
    }

    setSelectedCamera(cameraId) {
        this.selectedCameraId = cameraId;
        if (!this.els.camButtons) return;
        this.els.camButtons.querySelectorAll('.cam-btn').forEach((btn) => {
            btn.classList.toggle('selected', Number(btn.dataset.cameraId) === cameraId);
        });
    }

    destroy() {
        this.els.root?.remove();
        this.els = {};
    }

    _onSelectCamera(cameraId) {
        if (this.selectedCameraId === cameraId) {
            this.setSelectedCamera(null);
            this.emit('selectCamera', null);
            return;
        }
        this.setSelectedCamera(cameraId);
        this.emit('selectCamera', cameraId);
    }

    _createImportControls() {
        const importWrap = document.createElement('div');
        importWrap.style.cssText = 'border-top:1px solid rgba(80,160,210,0.18);padding-top:8px;margin-top:8px;';

        const importTitle = document.createElement('div');
        importTitle.className = 'card-title';
        importTitle.style.marginBottom = '6px';
        importTitle.textContent = '导入视频源';
        importWrap.appendChild(importTitle);

        const row1 = document.createElement('div');
        row1.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;';
        const camSelect = document.createElement('select');
        camSelect.id = 'import-cam-id';
        camSelect.style.cssText = 'width:75px;background:rgba(0,30,70,0.6);border:1px solid rgba(80,160,210,0.22);color:#c8d6e8;border-radius:4px;padding:5px;font-size:12px;';
        CONFIG.cameras.forEach((cam) => {
            const opt = document.createElement('option');
            opt.value = cam.id;
            opt.textContent = `Cam${cam.id}`;
            camSelect.appendChild(opt);
        });
        const sourceInput = document.createElement('input');
        sourceInput.id = 'import-source';
        sourceInput.placeholder = '文件路径 / RTSP / 0';
        sourceInput.style.cssText = 'flex:1;min-width:0;background:rgba(0,30,70,0.6);border:1px solid rgba(80,160,210,0.22);color:#c8d6e8;border-radius:4px;padding:5px;font-size:12px;';
        sourceInput.addEventListener('focus', () => { sourceInput.style.borderColor = CONFIG.colors.accent; });
        sourceInput.addEventListener('blur', () => { sourceInput.style.borderColor = CONFIG.colors.border; });
        row1.appendChild(camSelect);
        row1.appendChild(sourceInput);
        importWrap.appendChild(row1);

        const row2 = document.createElement('div');
        row2.style.cssText = 'display:flex;gap:6px;';
        const addBtn = document.createElement('button');
        addBtn.textContent = '添加';
        addBtn.style.cssText = `flex:1;background:rgba(74,158,216,0.2);border:1px solid ${CONFIG.colors.accent};color:${CONFIG.colors.accent};border-radius:4px;padding:5px;font-size:12px;cursor:pointer;transition:all 0.2s;`;
        addBtn.addEventListener('mouseenter', () => { addBtn.style.background = 'rgba(74,158,216,0.35)'; });
        addBtn.addEventListener('mouseleave', () => { addBtn.style.background = 'rgba(74,158,216,0.2)'; });
        addBtn.addEventListener('click', () => this._onAddVideoSource());

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '移除';
        removeBtn.style.cssText = `flex:0 0 60px;background:rgba(200,74,106,0.15);border:1px solid ${CONFIG.colors.danger};color:${CONFIG.colors.danger};border-radius:4px;padding:5px;font-size:12px;cursor:pointer;transition:all 0.2s;`;
        removeBtn.addEventListener('mouseenter', () => { removeBtn.style.background = 'rgba(200,74,106,0.3)'; });
        removeBtn.addEventListener('mouseleave', () => { removeBtn.style.background = 'rgba(200,74,106,0.15)'; });
        removeBtn.addEventListener('click', () => this._onRemoveVideoSource());

        row2.appendChild(addBtn);
        row2.appendChild(removeBtn);
        importWrap.appendChild(row2);

        const importHint = document.createElement('div');
        importHint.id = 'import-hint';
        importHint.style.cssText = 'font-size:10px;color:#5a7a9a;margin-top:2px;min-height:14px;';
        importWrap.appendChild(importHint);

        return importWrap;
    }

    async _onAddVideoSource() {
        const camIdEl = document.getElementById('import-cam-id');
        const sourceEl = document.getElementById('import-source');
        const hintEl = document.getElementById('import-hint');
        if (!camIdEl || !sourceEl) return;

        const cameraId = Number(camIdEl.value);
        const source = sourceEl.value.trim();
        if (!source) {
            this._setImportHint(hintEl, '请填写视频源', 'warn');
            return;
        }

        this._setImportHint(hintEl, '正在添加...', 'info');
        try {
            const data = await addVideoSource(cameraId, source);
            if (data.success) {
                this._setImportHint(hintEl, `Cam${cameraId} 视频源添加成功`, 'success');
                sourceEl.value = '';
            } else {
                this._setImportHint(hintEl, `失败：${data.error || '未知错误'}`, 'error');
            }
        } catch (err) {
            this._setImportHint(hintEl, `请求失败：${err.message}`, 'error');
        }
    }

    async _onRemoveVideoSource() {
        const camIdEl = document.getElementById('import-cam-id');
        const hintEl = document.getElementById('import-hint');
        if (!camIdEl) return;

        const cameraId = Number(camIdEl.value);
        this._setImportHint(hintEl, '正在移除...', 'info');
        try {
            const data = await removeVideoSource(cameraId);
            if (data.success) {
                this._setImportHint(hintEl, `Cam${cameraId} 视频源已移除`, 'success');
            } else {
                this._setImportHint(hintEl, `失败：${data.error || '未知错误'}`, 'error');
            }
        } catch (err) {
            this._setImportHint(hintEl, `请求失败：${err.message}`, 'error');
        }
    }

    _setImportHint(el, text, type) {
        if (!el) return;
        el.textContent = text;
        const colorMap = {
            info: CONFIG.colors.textSecondary,
            success: CONFIG.colors.success,
            warn: CONFIG.colors.warning,
            error: CONFIG.colors.danger,
        };
        el.style.color = colorMap[type] || CONFIG.colors.textSecondary;
    }
}

export default VideoPanel;

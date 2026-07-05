/**
 * TopBar.js — 顶部状态栏组件
 * 本次修改：从 UIManager.js 拆出顶部标题、时间、连接状态、AI 状态、FPS 与演示模式按钮。
 */

import { CONFIG } from '../../config/Config.js';

export class TopBar {
    constructor({ emit }) {
        this.emit = emit;
        this.els = {};
        this._demoMode = false;
    }

    init() {
        const bar = document.createElement('div');
        bar.id = 'top-bar';
        bar.className = 'glass-panel';

        const left = document.createElement('div');
        left.className = 'top-left';
        const logo = document.createElement('div');
        logo.className = 'top-logo';
        logo.textContent = '🏗';
        const title = document.createElement('div');
        title.className = 'top-title';
        title.textContent = '智慧工地数字孪生监控平台';
        left.appendChild(logo);
        left.appendChild(title);

        const center = document.createElement('div');
        center.className = 'top-center';
        center.id = 'time-display';
        center.textContent = '--';

        const right = document.createElement('div');
        right.className = 'top-right';

        const wsItem = this._makeStatusItem('ws-dot', 'status-dot offline', 'ws-text', 'WS 离线');
        const aiItem = this._makeStatusItem('ai-dot', 'status-dot ai-off', 'ai-text', 'AI 待机');

        const fpsItem = document.createElement('div');
        fpsItem.className = 'status-item';
        const fpsLabel = document.createElement('span');
        fpsLabel.textContent = 'FPS';
        const fpsVal = document.createElement('span');
        fpsVal.className = 'mono num-accent';
        fpsVal.id = 'top-fps';
        fpsVal.textContent = '0';
        fpsItem.appendChild(fpsLabel);
        fpsItem.appendChild(fpsVal);

        const demoItem = document.createElement('div');
        demoItem.className = 'status-item';
        const demoBtn = document.createElement('button');
        demoBtn.id = 'demo-toggle';
        demoBtn.textContent = '演示模式：关';
        demoBtn.style.cssText = `background:rgba(74,158,216,0.1);border:1px solid ${CONFIG.colors.border};color:${CONFIG.colors.textSecondary};padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer;transition:all 0.25s;`;
        demoBtn.addEventListener('mouseenter', () => { demoBtn.style.borderColor = CONFIG.colors.accent; });
        demoBtn.addEventListener('mouseleave', () => { if (!this._demoMode) demoBtn.style.borderColor = CONFIG.colors.border; });
        demoBtn.addEventListener('click', () => this.setDemoMode(!this._demoMode, true));
        demoItem.appendChild(demoBtn);

        right.appendChild(wsItem.root);
        right.appendChild(aiItem.root);
        right.appendChild(fpsItem);
        right.appendChild(demoItem);
        bar.appendChild(left);
        bar.appendChild(center);
        bar.appendChild(right);
        document.body.appendChild(bar);

        this.els = {
            root: bar,
            timeDisplay: center,
            wsDot: wsItem.dot,
            wsText: wsItem.text,
            aiDot: aiItem.dot,
            aiText: aiItem.text,
            topFps: fpsVal,
            demoBtn,
        };
        return this.els;
    }

    setDemoMode(on, emit = false) {
        this._demoMode = Boolean(on);
        const btn = this.els.demoBtn;
        if (!btn) return;
        if (this._demoMode) {
            btn.textContent = '演示模式：开';
            btn.style.background = 'rgba(74,184,138,0.25)';
            btn.style.color = CONFIG.colors.success;
            btn.style.borderColor = CONFIG.colors.success;
        } else {
            btn.textContent = '演示模式：关';
            btn.style.background = 'rgba(74,158,216,0.1)';
            btn.style.color = CONFIG.colors.textSecondary;
            btn.style.borderColor = CONFIG.colors.border;
        }
        if (emit) this.emit('toggleDemo', this._demoMode);
    }

    get demoMode() {
        return this._demoMode;
    }

    destroy() {
        this.els.root?.remove();
        this.els = {};
    }

    _makeStatusItem(dotId, dotClass, textId, text) {
        const root = document.createElement('div');
        root.className = 'status-item';
        const dot = document.createElement('span');
        dot.className = dotClass;
        dot.id = dotId;
        const label = document.createElement('span');
        label.id = textId;
        label.textContent = text;
        root.appendChild(dot);
        root.appendChild(label);
        return { root, dot, text: label };
    }
}

export default TopBar;

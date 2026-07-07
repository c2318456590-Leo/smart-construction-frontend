/**
 * UIManager.js — UI 编排管理器
 * 本次修改：补充视频空状态占位与默认摄像头选中同步接口。
 */

import { CONFIG } from '../config/Config.js';
import { injectUIStyles } from './styles.js';
import { TopBar } from './components/TopBar.js';
import { StatsPanel } from './components/StatsPanel.js';
import { VideoPanel } from './components/VideoPanel.js';
import { BottomPanel } from './components/BottomPanel.js';
import { ThemeSwitch } from './components/ThemeSwitch.js';
import { setText } from './components/helpers.js';

export class UIManager {
    constructor() {
        this.els = {};
        this.listeners = new Map();
        this.timeTimer = null;
        this._rollTimers = new Set();
        this._components = [];
    }

    init() {
        injectUIStyles();

        this.topBar = new TopBar({ emit: (...args) => this._emit(...args) });
        this.statsPanel = new StatsPanel();
        this.videoPanel = new VideoPanel({ emit: (...args) => this._emit(...args) });
        this.bottomPanel = new BottomPanel();
        this._themeSwitch = new ThemeSwitch({ emit: (...args) => this._emit(...args) });
        this._components = [this.topBar, this.statsPanel, this.videoPanel, this.bottomPanel, this._themeSwitch];

        Object.assign(
            this.els,
            this.topBar.init(),
            this.statsPanel.init(),
            this.videoPanel.init(),
            this.bottomPanel.init()
        );
        this._themeSwitch.init();

        this.updateTime();
        this.timeTimer = setInterval(() => this.updateTime(), 1000);
    }

    destroy() {
        if (this.timeTimer) {
            clearInterval(this.timeTimer);
            this.timeTimer = null;
        }
        this._rollTimers.forEach((timer) => clearTimeout(timer));
        this._rollTimers.clear();
        this.listeners.clear();
        this._components.forEach((component) => component.destroy?.());
        this._components = [];
        this.els = {};
    }

    setDemoMode(on, emit = false) {
        this.topBar?.setDemoMode(on, emit);
    }

    /**
     * 同步视频面板中的摄像头选中态。
     * @param {number|null} cameraId - 摄像头 ID；null 表示取消选中
     * @returns {void}
     */
    setSelectedCamera(cameraId) {
        this.videoPanel?.setSelectedCamera(cameraId);
    }

    /**
     * 同步昼夜主题开关状态。
     * @param {boolean} on - true 表示夜晚，false 表示白天
     * @param {boolean} [emit=true] - 是否向外触发 toggleTheme 事件
     */
    setDayNight(on, emit = true) {
        this._themeSwitch?.setDayNight(on, emit);
    }

    get demoMode() {
        return Boolean(this.topBar?.demoMode);
    }

    addAlert(time, type, cameraName, onClick) {
        const list = this.els.eventList;
        if (!list) return;

        const item = document.createElement('div');
        item.className = 'alert-item';
        const label = (CONFIG.alert.labels && CONFIG.alert.labels[type]) || type;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'alert-time';
        timeSpan.textContent = time;

        const typeSpan = document.createElement('span');
        typeSpan.className = 'alert-type';
        typeSpan.textContent = `[${label}]`;
        const typeColor = CONFIG.alert.colors && CONFIG.alert.colors[type];
        if (typeColor !== undefined) {
            typeSpan.style.color = '#' + typeColor.toString(16).padStart(6, '0');
        }

        const camSpan = document.createElement('span');
        camSpan.className = 'alert-cam';
        camSpan.textContent = ` ${cameraName}`;

        item.appendChild(timeSpan);
        item.appendChild(typeSpan);
        item.appendChild(camSpan);

        if (typeof onClick === 'function') {
            item.addEventListener('click', onClick);
        }

        list.insertBefore(item, list.firstChild);
        while (list.children.length > 30) {
            list.removeChild(list.lastChild);
        }
    }

    updateStats(stats) {
        if (!stats) return;
        if (stats.total !== undefined) {
            setText(this.els.alertTotal, stats.total);
            this._rollNumber(this.els.alertTotal);
            setText(this.els.aiTotal, stats.total);
        }
        ['no_helmet', 'no_vest', 'smoke', 'intrusion', 'fall'].forEach((key) => {
            if (stats[key] !== undefined && this.els.alertCounts?.[key]) {
                setText(this.els.alertCounts[key], stats[key]);
            }
        });
        this._updateRiskLevel(stats.total || 0);
    }

    /**
     * 更新视频画面或显示无帧状态。
     * @param {string} frameData - 视频帧数据，通常为 base64 图片或可访问 URL。
     * @param {string} cameraName - 视频区域显示的摄像头名称或状态文案。
     * @returns {void}
     */
    updateVideoFrame(frameData, cameraName) {
        if (this.els.videoImg) {
            if (frameData) {
                this.els.videoImg.src = frameData;
                this.els.videoWrap?.classList.add('has-frame');
            } else {
                this.els.videoImg.removeAttribute('src');
                this.els.videoImg.alt = '无视频信号';
                this.els.videoWrap?.classList.remove('has-frame');
            }
        }
        if (this.els.videoStatus) {
            this.els.videoStatus.textContent = frameData ? '' : (cameraName || '无视频信号');
        }
        if (this.els.videoName && cameraName) {
            this.els.videoName.textContent = cameraName;
        }
    }

    updateConnectionStatus(connected) {
        if (!this.els.wsDot) return;
        if (connected) {
            this.els.wsDot.className = 'status-dot online';
            this.els.wsText.textContent = 'WS 在线';
            this.els.wsText.style.color = CONFIG.colors.success;
        } else {
            this.els.wsDot.className = 'status-dot offline';
            this.els.wsText.textContent = 'WS 离线';
            this.els.wsText.style.color = CONFIG.colors.danger;
        }
    }

    updateFPS(fps) {
        const text = String(Math.round(fps));
        setText(this.els.topFps, text);
        setText(this.els.sysFps, text);
        const isLow = CONFIG.fps.warnThreshold && fps < CONFIG.fps.warnThreshold;
        if (this.els.topFps) this.els.topFps.style.color = isLow ? CONFIG.colors.danger : CONFIG.colors.accent;
        if (this.els.sysFps) this.els.sysFps.style.color = isLow ? CONFIG.colors.danger : CONFIG.colors.accent;
    }

    updateLatency(ms) {
        setText(this.els.sysLatency, `${Math.round(ms)} ms`);
        if (this.els.sysLatency) {
            this.els.sysLatency.style.color = ms > 200 ? CONFIG.colors.danger : CONFIG.colors.accent;
        }
    }

    updateTime() {
        if (!this.els.timeDisplay) return;
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        this.els.timeDisplay.textContent =
            `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
            `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }

    updateAIStatus(running) {
        if (!this.els.aiDot) return;
        if (running) {
            this.els.aiDot.className = 'status-dot ai-on';
            this.els.aiText.textContent = 'AI 运行中';
            this.els.aiText.style.color = CONFIG.colors.accent;
        } else {
            this.els.aiDot.className = 'status-dot ai-off';
            this.els.aiText.textContent = 'AI 待机';
            this.els.aiText.style.color = CONFIG.colors.textSecondary;
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    _emit(event, ...args) {
        const callbacks = this.listeners.get(event);
        if (!callbacks) return;
        callbacks.forEach((callback) => {
            try {
                callback(...args);
            } catch (err) {
                console.error(`UIManager [${event}] 回调异常:`, err);
            }
        });
    }

    _updateRiskLevel(total) {
        const c = CONFIG.colors;
        let level = '低';
        let color = c.success;
        let percent = 25;
        if (total > 30) {
            level = '极高'; color = c.danger; percent = 100;
        } else if (total > 15) {
            level = '高'; color = c.warningGlow; percent = 75;
        } else if (total > 5) {
            level = '中'; color = c.warning; percent = 50;
        }
        if (this.els.riskText) {
            this.els.riskText.textContent = level;
            this.els.riskText.style.color = color;
        }
        if (this.els.riskFill) {
            this.els.riskFill.style.width = percent + '%';
            this.els.riskFill.style.background = color;
        }
    }

    _rollNumber(el) {
        if (!el) return;
        el.classList.add('roll');
        const timer = setTimeout(() => {
            el.classList.remove('roll');
            this._rollTimers.delete(timer);
        }, 300);
        this._rollTimers.add(timer);
    }
}

export default UIManager;

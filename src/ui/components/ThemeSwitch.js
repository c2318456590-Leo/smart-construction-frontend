/**
 * ThemeSwitch.js — 昼夜主题切换组件
 * 本次修改：补齐 setDayNight 公开接口和 Switch 无障碍标签，保留 setNight 兼容旧调用。
 */

import { CONFIG } from '../../config/Config.js';

/**
 * 昼夜主题切换开关组件。
 * 固定在视口左下角，通过 Switch 开关切换白天/夜晚主题。
 */
export class ThemeSwitch {
    /**
     * @param {Object} options
     * @param {Function} options.emit - 事件发射函数
     */
    constructor({ emit }) {
        this._emit = emit;
        this._isNight = CONFIG.theme.default !== 'day';
        this._el = null;
    }

    /** 初始化组件，创建 DOM 并绑定事件。 */
    init() {
        this._el = document.createElement('div');
        this._el.id = 'theme-switch';
        this._el.className = 'glass-panel';
        this._el.innerHTML = `
            <div class="theme-switch-inner">
                <span class="theme-switch-label">${this._isNight ? '夜晚' : '白天'}</span>
                <label class="theme-toggle">
                    <input type="checkbox" aria-label="切换昼夜主题" ${this._isNight ? 'checked' : ''}>
                    <span class="theme-toggle-slider"></span>
                </label>
            </div>
        `;
        document.body.appendChild(this._el);

        const checkbox = this._el.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            this._isNight = e.target.checked;
            this._el.querySelector('.theme-switch-label').textContent =
                this._isNight ? '夜晚' : '白天';
            this._emit('toggleTheme', this._isNight);
        });
    }

    /**
     * 设置昼夜状态。
     * @param {boolean} isNight - 是否为夜晚
     * @param {boolean} [emit=true] - 是否触发事件
     */
    setDayNight(isNight, emit = true) {
        this._isNight = isNight;
        if (this._el) {
            const checkbox = this._el.querySelector('input[type="checkbox"]');
            checkbox.checked = isNight;
            this._el.querySelector('.theme-switch-label').textContent =
                isNight ? '夜晚' : '白天';
        }
        if (emit) this._emit('toggleTheme', isNight);
    }

    /**
     * 兼容旧调用的昼夜状态设置方法。
     * @param {boolean} isNight - 是否为夜晚
     * @param {boolean} [emit=true] - 是否触发事件
     */
    setNight(isNight, emit = true) {
        this.setDayNight(isNight, emit);
    }

    /** 销毁组件，移除 DOM。 */
    destroy() {
        if (this._el) {
            this._el.remove();
            this._el = null;
        }
    }
}

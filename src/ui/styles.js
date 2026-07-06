/**
 * styles.js — UI 全局样式注入
 * 本次修改：补齐昼夜主题 Switch 触控尺寸与焦点样式，保持大屏样式统一注入。
 */

import { CONFIG } from '../config/Config.js';

export function injectUIStyles() {
    if (document.getElementById('ui-manager-style')) return;

    const c = CONFIG.colors;
    const css = `
    * { box-sizing: border-box; }
    body {
        margin: 0;
        overflow: hidden;
        font-family: 'Segoe UI', 'Microsoft YaHei', Tahoma, sans-serif;
        background: ${c.bgDeep};
        color: ${c.textPrimary};
    }
    canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 1;
        display: block;
    }
    .glass-panel {
        position: absolute;
        background: ${c.bgPanel};
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid ${c.border};
        border-radius: 12px;
        color: ${c.textPrimary};
        z-index: 10;
        opacity: 0;
        transform: translateY(20px);
        animation: ui-fade-in ${CONFIG.animation.panelFadeIn}ms ease-out forwards;
    }
    @keyframes ui-fade-in { to { opacity: 1; transform: translateY(0); } }

    #top-bar {
        top: 0; left: 0; right: 0;
        height: 60px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 20px;
        border-radius: 0 0 12px 12px;
    }
    .top-left { display: flex; align-items: center; gap: 12px; }
    .top-logo {
        width: 34px; height: 34px;
        border-radius: 8px;
        background: linear-gradient(135deg, ${c.accent}, ${c.info});
        display: flex; align-items: center; justify-content: center;
        font-size: 18px;
        box-shadow: 0 0 12px ${c.accent};
    }
    .top-title {
        font-size: 20px;
        font-weight: 700;
        letter-spacing: 2px;
        background: linear-gradient(90deg, ${c.accent}, ${c.textPrimary});
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
    }
    .top-center { font-size: 18px; font-family: 'Consolas', 'Courier New', monospace; color: ${c.textPrimary}; letter-spacing: 1px; }
    .top-right { display: flex; align-items: center; gap: 18px; font-size: 13px; }
    .status-item { display: flex; align-items: center; gap: 6px; color: ${c.textSecondary}; }
    .status-dot {
        width: 10px; height: 10px; border-radius: 50%;
        background: ${c.textSecondary};
        box-shadow: 0 0 6px currentColor;
        transition: background 0.3s, box-shadow 0.3s;
    }
    .status-dot.online { background: ${c.success}; box-shadow: 0 0 8px ${c.success}; }
    .status-dot.offline { background: ${c.danger}; box-shadow: 0 0 8px ${c.danger}; }
    .status-dot.ai-on { background: ${c.accent}; box-shadow: 0 0 8px ${c.accent}; animation: ai-blink 1.5s infinite; }
    .status-dot.ai-off { background: ${c.textSecondary}; }
    @keyframes ai-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    .mono { font-family: 'Consolas', 'Courier New', monospace; }
    .num-accent { color: ${c.accent}; font-weight: 700; }
    .num-danger { color: ${c.danger}; font-weight: 700; }

    #left-panel, #right-panel {
        max-height: calc(100vh - 70px - 160px);
        overflow-y: auto;
        padding: 14px;
    }
    #left-panel::-webkit-scrollbar, #right-panel::-webkit-scrollbar { width: 5px; }
    #left-panel::-webkit-scrollbar-thumb, #right-panel::-webkit-scrollbar-thumb { background: ${c.accentDim}; border-radius: 3px; }
    #left-panel { left: 10px; top: 70px; width: 260px; }
    #right-panel { right: 10px; top: 70px; width: 280px; }
    #bottom-panel {
        bottom: 10px;
        left: 280px;
        right: 300px;
        height: 140px;
        display: flex;
        align-items: stretch;
        padding: 8px 12px;
        gap: 10px;
        border-radius: 12px;
    }

    .ui-card {
        background: rgba(0, 30, 70, 0.4);
        border: 1px solid ${c.border};
        border-radius: 8px;
        padding: 10px 12px;
        margin-bottom: 10px;
    }
    .card-title {
        font-size: 12px;
        color: ${c.textSecondary};
        margin-bottom: 8px;
        letter-spacing: 1px;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .card-title::before {
        content: '';
        width: 3px; height: 12px;
        background: ${c.accent};
        border-radius: 2px;
    }
    .card-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 4px 0;
        font-size: 13px;
    }
    .card-label { color: ${c.textSecondary}; }
    .card-value {
        font-family: 'Consolas', 'Courier New', monospace;
        font-size: 16px;
        font-weight: 700;
        transition: color 0.3s, transform 0.3s;
    }
    .card-value.roll { transform: scale(1.25); color: ${c.accent}; }

    .risk-bar {
        height: 8px;
        border-radius: 4px;
        background: ${c.accentDim};
        margin-top: 6px;
        overflow: hidden;
    }
    .risk-fill {
        height: 100%;
        width: 25%;
        border-radius: 4px;
        background: ${c.success};
        transition: width 0.5s, background 0.5s;
    }
    .risk-text { font-family: 'Consolas', monospace; font-size: 18px; font-weight: 700; }

    .video-wrap {
        background: #000;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid ${c.border};
        margin-bottom: 8px;
    }
    #video-img {
        width: 100%;
        height: 120px;
        object-fit: cover;
        display: block;
        background: #111;
    }
    .video-name {
        font-size: 12px;
        color: ${c.accent};
        padding: 4px 8px;
        background: rgba(0,0,0,0.5);
        display: flex;
        justify-content: space-between;
    }
    .cam-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 8px;
    }
    .cam-btn {
        background: rgba(0, 30, 70, 0.5);
        border: 1px solid ${c.border};
        border-radius: 6px;
        color: ${c.textSecondary};
        padding: 8px 6px;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.25s;
        text-align: center;
    }
    .cam-btn:hover { border-color: ${c.accent}; color: ${c.textPrimary}; }
    .cam-btn.selected {
        border: 1px solid ${c.accent};
        color: ${c.accent};
        background: rgba(0, 212, 255, 0.15);
        box-shadow: 0 0 8px ${c.accentDim};
    }
    .ui-list {
        max-height: 130px;
        overflow-y: auto;
        font-size: 12px;
    }
    .ui-list::-webkit-scrollbar { width: 4px; }
    .ui-list::-webkit-scrollbar-thumb { background: ${c.accentDim}; border-radius: 2px; }
    .list-item {
        padding: 5px 8px;
        margin-bottom: 4px;
        border-radius: 4px;
        color: ${c.textSecondary};
        border-left: 3px solid ${c.accentDim};
        background: rgba(0, 30, 70, 0.3);
    }
    .alert-item {
        padding: 6px 8px;
        margin-bottom: 5px;
        border-radius: 4px;
        border-left: 3px solid ${c.danger};
        background: rgba(255, 51, 102, 0.08);
        color: ${c.textPrimary};
        font-size: 12px;
        cursor: pointer;
        transition: background 0.25s, transform 0.25s;
        animation: alert-slide-in 0.4s ease-out;
    }
    .alert-item:hover { background: rgba(255, 51, 102, 0.2); transform: translateX(2px); }
    @keyframes alert-slide-in {
        from { opacity: 0; transform: translateY(-12px); }
        to { opacity: 1; transform: translateY(0); }
    }
    .alert-time { color: ${c.textSecondary}; font-size: 11px; margin-right: 4px; }
    .alert-type { font-weight: 700; }
    .alert-cam { color: ${c.warning}; font-size: 11px; }

    .chart-cell {
        flex: 1;
        min-width: 0;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: rgba(0, 30, 70, 0.3);
        border: 1px solid ${c.border};
        border-radius: 8px;
        padding: 6px;
        overflow: hidden;
        position: relative;
    }
    .chart-cell-title {
        font-size: 11px;
        color: ${c.textSecondary};
        padding: 0 4px 4px;
        flex-shrink: 0;
    }
    .chart-cell-body {
        flex: 1;
        min-height: 0;
        width: 100%;
    }
    .sys-status {
        width: 150px;
        flex-shrink: 0;
        height: 100%;
        background: rgba(0, 30, 70, 0.4);
        border: 1px solid ${c.border};
        border-radius: 8px;
        padding: 8px 10px;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 5px;
    }
    .sys-row { display: flex; justify-content: space-between; }

    #theme-switch {
        position: absolute;
        left: 10px;
        bottom: 10px;
        z-index: 10;
        padding: 8px 14px;
        border-radius: 8px;
        min-width: 90px;
    }
    .theme-switch-inner {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .theme-switch-label {
        font-size: 12px;
        color: #c8d6e8;
        white-space: nowrap;
        user-select: none;
    }
    .theme-toggle {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
        cursor: pointer;
        touch-action: manipulation;
    }
    .theme-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
    }
    .theme-toggle-slider {
        position: absolute;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(100, 180, 255, 0.3);
        border-radius: 12px;
        transition: background 0.3s;
    }
    .theme-toggle-slider::before {
        content: '';
        position: absolute;
        width: 20px;
        height: 20px;
        left: 2px;
        bottom: 2px;
        background: #e8f0ff;
        border-radius: 50%;
        transition: transform 0.3s;
    }
    .theme-toggle input:focus-visible + .theme-toggle-slider {
        outline: 2px solid ${c.accent};
        outline-offset: 3px;
    }
    .theme-toggle input:checked + .theme-toggle-slider {
        background: rgba(40, 60, 120, 0.6);
    }
    .theme-toggle input:checked + .theme-toggle-slider::before {
        transform: translateX(20px);
        background: #8ab4ff;
    }
    `;

    const style = document.createElement('style');
    style.id = 'ui-manager-style';
    style.textContent = css;
    document.head.appendChild(style);
}

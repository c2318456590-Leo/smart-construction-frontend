/**
 * StatsPanel.js — 左侧统计面板组件
 * 本次修改：从 UIManager.js 拆出 AI 检测统计、人员统计、报警统计与风险等级 DOM 构建。
 */

import { makeCard, makeRow } from './helpers.js';

export class StatsPanel {
    constructor() {
        this.els = {};
    }

    init() {
        const panel = document.createElement('div');
        panel.id = 'left-panel';
        panel.className = 'glass-panel';

        const aiCard = makeCard('AI 检测统计');
        aiCard.body.appendChild(makeRow('总检测次数', 'ai-total', '0'));
        aiCard.body.appendChild(makeRow('检测速度', 'ai-speed', '-- 次/s'));
        panel.appendChild(aiCard.root);

        const workerCard = makeCard('人员统计');
        workerCard.body.appendChild(makeRow('当前在场人数', 'worker-current', '0'));
        workerCard.body.appendChild(makeRow('累计人数', 'worker-total', '0'));
        panel.appendChild(workerCard.root);

        const alertCard = makeCard('今日报警');
        alertCard.body.appendChild(makeRow('报警总数', 'alert-total', '0', 'num-danger'));
        alertCard.body.appendChild(makeRow('未戴安全帽', 'alert-no_helmet', '0'));
        alertCard.body.appendChild(makeRow('未穿反光衣', 'alert-no_vest', '0'));
        alertCard.body.appendChild(makeRow('吸烟检测', 'alert-smoke', '0'));
        alertCard.body.appendChild(makeRow('区域入侵', 'alert-intrusion', '0'));
        alertCard.body.appendChild(makeRow('人员跌倒', 'alert-fall', '0'));
        panel.appendChild(alertCard.root);

        const riskCard = makeCard('风险等级');
        const riskText = document.createElement('div');
        riskText.className = 'risk-text';
        riskText.id = 'risk-level';
        riskText.textContent = '低';
        const riskBar = document.createElement('div');
        riskBar.className = 'risk-bar';
        const riskFill = document.createElement('div');
        riskFill.className = 'risk-fill';
        riskFill.id = 'risk-fill';
        riskBar.appendChild(riskFill);
        riskCard.body.appendChild(riskText);
        riskCard.body.appendChild(riskBar);
        panel.appendChild(riskCard.root);

        document.body.appendChild(panel);

        this.els = {
            root: panel,
            aiTotal: document.getElementById('ai-total'),
            aiSpeed: document.getElementById('ai-speed'),
            workerCurrent: document.getElementById('worker-current'),
            workerTotal: document.getElementById('worker-total'),
            alertTotal: document.getElementById('alert-total'),
            alertCounts: {
                no_helmet: document.getElementById('alert-no_helmet'),
                no_vest: document.getElementById('alert-no_vest'),
                smoke: document.getElementById('alert-smoke'),
                intrusion: document.getElementById('alert-intrusion'),
                fall: document.getElementById('alert-fall'),
            },
            riskText,
            riskFill,
        };
        return this.els;
    }

    destroy() {
        this.els.root?.remove();
        this.els = {};
    }
}

export default StatsPanel;

/**
 * BottomPanel.js — 底部图表与系统状态组件
 * 本次修改：从 UIManager.js 拆出底部图表容器和 FPS/延迟状态 DOM 构建。
 */

export class BottomPanel {
    constructor() {
        this.els = {};
    }

    init() {
        const panel = document.createElement('div');
        panel.id = 'bottom-panel';
        panel.className = 'glass-panel';

        const chartTitles = ['报警趋势', '人员数量', '安全帽佩戴率'];
        chartTitles.forEach((titleText, index) => {
            const cell = document.createElement('div');
            cell.className = 'chart-cell';
            const title = document.createElement('div');
            title.className = 'chart-cell-title';
            title.textContent = titleText;
            const body = document.createElement('div');
            body.className = 'chart-cell-body';
            const chartDiv = document.createElement('div');
            chartDiv.id = ['chart-alert', 'chart-workers', 'chart-helmet'][index];
            chartDiv.style.width = '100%';
            chartDiv.style.height = '100%';
            body.appendChild(chartDiv);
            cell.appendChild(title);
            cell.appendChild(body);
            panel.appendChild(cell);
        });

        const sys = document.createElement('div');
        sys.className = 'sys-status';
        const sysTitle = document.createElement('div');
        sysTitle.className = 'card-title';
        sysTitle.style.marginBottom = '4px';
        sysTitle.textContent = '系统状态';

        const fpsRow = document.createElement('div');
        fpsRow.className = 'sys-row';
        const fpsLab = document.createElement('span');
        fpsLab.textContent = 'FPS';
        const fpsVal = document.createElement('span');
        fpsVal.className = 'mono num-accent';
        fpsVal.id = 'sys-fps';
        fpsVal.textContent = '0';
        fpsRow.appendChild(fpsLab);
        fpsRow.appendChild(fpsVal);

        const latRow = document.createElement('div');
        latRow.className = 'sys-row';
        const latLab = document.createElement('span');
        latLab.textContent = '延迟';
        const latVal = document.createElement('span');
        latVal.className = 'mono num-accent';
        latVal.id = 'sys-latency';
        latVal.textContent = '0 ms';
        latRow.appendChild(latLab);
        latRow.appendChild(latVal);

        sys.appendChild(sysTitle);
        sys.appendChild(fpsRow);
        sys.appendChild(latRow);
        panel.appendChild(sys);
        document.body.appendChild(panel);

        this.els = {
            root: panel,
            sysFps: fpsVal,
            sysLatency: latVal,
        };
        return this.els;
    }

    destroy() {
        this.els.root?.remove();
        this.els = {};
    }
}

export default BottomPanel;

/**
 * ChartManager.js — ECharts 图表管理器
 * 负责加载 ECharts（CDN）并管理数字孪生大屏的实时折线图：
 *   - 底部面板：报警趋势 / 人员数量 / 安全帽佩戴率（每个 100px）
 *   - 右侧面板：FPS / 延迟（每个 80px）
 *
 * 设计要点：
 *   - 深色透明背景，隐藏坐标轴与网格线（或极淡）
 *   - 线条用 CONFIG.colors 配色
 *   - 数据点超过 CONFIG.charts.maxDataPoints 自动 shift 旧点
 *   - 图表容器若已由 UIManager 创建则复用，否则自建（防御性）
 */

import { CONFIG } from '../config/Config.js';

export class ChartManager {
    /**
     * 构造函数：初始化图表注册表
     */
    constructor() {
        // 图表注册表：key -> { instance, times:[], values:[], color, yMin, yMax }
        this.charts = {};
        // ECharts 是否已就绪
        this._ready = false;
    }

    /**
     * 初始化所有图表
     * 流程：动态加载 ECharts CDN → 等待就绪 → 创建容器 → 初始化各图表实例
     * @returns {Promise<void>}
     */
    async init() {
        // 1. 动态加载 ECharts
        await this._loadECharts();
        if (!window.echarts) {
            console.error('ChartManager: ECharts 加载失败，图表初始化中止');
            return;
        }
        this._ready = true;

        // 2. 准备各图表容器（底部 3 个 + 右侧 2 个）
        this._prepareContainers();

        // 3. 初始化各图表实例与配置
        this._initChart('alert', '#chart-alert', CONFIG.colors.danger, 0, 'auto');
        this._initChart('workers', '#chart-workers', CONFIG.colors.accent, 0, 'auto');
        this._initChart('helmet', '#chart-helmet', CONFIG.colors.success, 0, 100);
        this._initChart('fps', '#chart-fps', CONFIG.colors.accent, 0, 'auto');
        this._initChart('latency', '#chart-latency', CONFIG.colors.warning, 0, 'auto');
    }

    // ==================== ECharts 加载 ====================

    /**
     * 动态加载 ECharts（多 CDN script 标签注入，带 fallback）
     * 国内 CDN 优先，依次尝试直至成功；若 window.echarts 已存在则直接 resolve
     * @returns {Promise<void>}
     * @private
     */
    _loadECharts() {
        return new Promise((resolve) => {
            // 已加载则直接返回
            if (window.echarts) {
                resolve();
                return;
            }
            // 多 CDN 源（国内优先，避免 jsdelivr 被墙导致图表无法初始化）
            const cdns = [
                'https://lib.baomitu.com/echarts/5.4.3/echarts.min.js',
                'https://cdn.bootcdn.net/ajax/libs/echarts/5.4.3/echarts.min.js',
                'https://cdn.staticfile.org/echarts/5.4.3/echarts.min.js',
                'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js',
                'https://unpkg.com/echarts@5.4.3/dist/echarts.min.js',
            ];
            let idx = 0;
            const tryLoad = () => {
                if (idx >= cdns.length) {
                    console.error('ChartManager: 所有 ECharts CDN 加载失败，图表无法显示');
                    resolve();
                    return;
                }
                const url = cdns[idx];
                const script = document.createElement('script');
                script.src = url;
                script.async = true;
                script.onload = () => {
                    if (window.echarts) {
                        console.log('ChartManager: ECharts 加载成功', url);
                        resolve();
                    } else {
                        // 脚本加载了但 echarts 未挂载，尝试下一个
                        idx++;
                        tryLoad();
                    }
                };
                script.onerror = () => {
                    console.warn('ChartManager: CDN 加载失败，尝试下一个:', url);
                    idx++;
                    tryLoad();
                };
                document.head.appendChild(script);
            };
            tryLoad();
        });
    }

    // ==================== 容器准备 ====================

    /**
     * 准备图表容器
     * 底部面板的 #chart-alert / #chart-workers / #chart-helmet 通常已由 UIManager 创建，
     * 这里做防御性检查：存在则复用，不存在则在对应面板内创建。
     * 右侧面板的 #chart-fps / #chart-latency 由本管理器创建。
     * @private
     */
    _prepareContainers() {
        // ---- 底部面板三个图表容器（自适应父容器高度）----
        const bottomPanel = document.getElementById('bottom-panel');
        this._ensureContainer('chart-alert', bottomPanel, 'auto');
        this._ensureContainer('chart-workers', bottomPanel, 'auto');
        this._ensureContainer('chart-helmet', bottomPanel, 'auto');

        // ---- 右侧面板 FPS / 延迟图表容器（80px）----
        const rightPanel = document.getElementById('right-panel');
        // 右侧图表用一个卡片包裹，便于排版
        if (rightPanel && !document.getElementById('chart-fps-card')) {
            const card = document.createElement('div');
            card.id = 'chart-fps-card';
            card.className = 'ui-card';
            const title = document.createElement('div');
            title.className = 'card-title';
            title.textContent = '性能监控';
            card.appendChild(title);
            rightPanel.appendChild(card);
            // FPS / 延迟容器挂在卡片内
            this._ensureContainer('chart-fps', card, 80);
            this._ensureContainer('chart-latency', card, 80);
        } else {
            // 兜底：直接挂到右侧面板
            this._ensureContainer('chart-fps', rightPanel, 80);
            this._ensureContainer('chart-latency', rightPanel, 80);
        }
    }

    /**
     * 确保容器存在：有则复用，无则创建
     * @param {string} id 容器 ID
     * @param {HTMLElement} parent 父节点
     * @param {number|string} height 容器高度（px 数字，或 'auto' 表示自适应父容器）
     * @private
     */
    _ensureContainer(id, parent, height) {
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            parent.appendChild(el);
        }
        // 统一设置宽度；高度按参数：'auto' 用 100% 自适应父容器
        el.style.width = '100%';
        el.style.height = height === 'auto' ? '100%' : height + 'px';
        return el;
    }

    // ==================== 图表初始化 ====================

    /**
     * 初始化单个图表实例
     * @param {string} key 注册表键名
     * @param {string} selector 容器选择器
     * @param {string} color 线条颜色
     * @param {number} yMin Y 轴最小值
     * @param {number|string} yMax Y 轴最大值（'auto' 表示自动）
     * @private
     */
    _initChart(key, selector, color, yMin, yMax) {
        const el = document.querySelector(selector);
        if (!el) {
            console.warn(`ChartManager: 容器 ${selector} 不存在，跳过 ${key}`);
            return;
        }
        const instance = window.echarts.init(el, null, { renderer: 'canvas' });
        // 注册表登记
        this.charts[key] = {
            instance,
            times: [],
            values: [],
            color,
            yMin,
            yMax,
        };
        // 应用初始配置
        instance.setOption(this._buildOption(this.charts[key]));
    }

    /**
     * 构建单个图表的 ECharts option
     * 深色主题、隐藏坐标轴与网格线、折线 + 渐变面积
     * @param {object} chart 注册表项
     * @returns {object} echarts option
     * @private
     */
    _buildOption(chart) {
        // 渐变面积色（hex → rgba）：顶部柔和、底部完全透明
        const colorTop = this._hexToRgba(chart.color, 0.18);
        const colorMid = this._hexToRgba(chart.color, 0.05);
        const colorBottom = this._hexToRgba(chart.color, 0);
        // 末端高亮点光晕色（弱光晕，避免刺眼）
        const glow = this._hexToRgba(chart.color, 0.35);

        return {
            // 深色透明背景
            backgroundColor: 'transparent',
            // 动画：更短更快，避免数据刷新时的拖影
            animation: true,
            animationDuration: 300,
            animationDurationUpdate: 200,
            animationEasing: 'linear',
            animationEasingUpdate: 'linear',
            // 网格：留出上下边距，避免线条贴边
            grid: { top: 8, bottom: 4, left: 4, right: 8, containLabel: false },
            // 提示框 + 虚线轴指示器
            tooltip: {
                trigger: 'axis',
                backgroundColor: 'rgba(10, 20, 50, 0.92)',
                borderColor: this._hexToRgba(chart.color, 0.35),
                borderWidth: 1,
                padding: [4, 8],
                textStyle: { color: CONFIG.colors.textPrimary, fontSize: 10 },
                axisPointer: {
                    type: 'line',
                    lineStyle: { color: chart.color, type: 'dashed', width: 1, opacity: 0.4 },
                },
            },
            xAxis: {
                type: 'category',
                show: false,
                boundaryGap: false,
                data: chart.times,
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { show: false },
            },
            yAxis: {
                type: 'value',
                show: false,
                min: chart.yMin,
                max: chart.yMax === 'auto' ? null : chart.yMax,
                axisLine: { show: false },
                axisTick: { show: false },
                // 极淡的水平参考线，增加读数感
                splitLine: {
                    show: true,
                    lineStyle: { color: 'rgba(80, 140, 180, 0.05)', type: 'dashed', width: 1 },
                },
                splitNumber: 3,
            },
            series: [
                {
                    type: 'line',
                    data: chart.values,
                    // 轻度平滑（0.3），保留数据真实波动
                    smooth: 0.3,
                    smoothMonotone: 'x',
                    // 默认不显示数据点，仅末端高亮
                    symbol: 'circle',
                    symbolSize: 0,
                    showSymbol: false,
                    // 末端数据点：数值标签（弱光晕）
                    endLabel: {
                        show: true,
                        formatter: '{@[0]}',
                        color: chart.color,
                        fontSize: 10,
                        fontWeight: 600,
                        offset: [-6, 0],
                    },
                    lineStyle: {
                        color: chart.color,
                        width: 1.2,            // 细线提升精细度
                        shadowColor: glow,
                        shadowBlur: 2,         // 弱发光，避免刺眼
                        shadowOffsetY: 0,
                    },
                    // 三段渐变面积，过渡更柔和
                    areaStyle: {
                        color: new window.echarts.graphic.LinearGradient(0, 0, 0, 1, [
                            { offset: 0, color: colorTop },
                            { offset: 0.5, color: colorMid },
                            { offset: 1, color: colorBottom },
                        ]),
                    },
                    // 鼠标悬停时显示数据点
                    emphasis: {
                        scale: true,
                        focus: 'series',
                        lineStyle: { width: 1.6 },
                        itemStyle: {
                            color: chart.color,
                            borderColor: '#fff',
                            borderWidth: 1,
                        },
                    },
                    // 标记末端最后一个点（弱光晕圆点）
                    markPoint: {
                        symbol: 'circle',
                        symbolSize: 5,
                        silent: true,
                        label: { show: false },
                        itemStyle: {
                            color: chart.color,
                            borderColor: 'rgba(255,255,255,0.6)',
                            borderWidth: 1,
                        },
                        data:
                            chart.values.length > 0
                                ? [{ coord: [chart.times.length - 1, chart.values[chart.values.length - 1]] }]
                                : [],
                    },
                },
            ],
        };
    }

    // ==================== 数据推送（对外 API） ====================

    /**
     * 推送报警趋势数据
     * @param {string} time 时间标签
     * @param {number} count 报警数量
     */
    pushAlertData(time, count) {
        this._push('alert', time, count);
    }

    /**
     * 推送人员数量数据
     * @param {string} time 时间标签
     * @param {number} count 人员数量
     */
    pushWorkerData(time, count) {
        this._push('workers', time, count);
    }

    /**
     * 推送安全帽佩戴率数据
     * @param {string} time 时间标签
     * @param {number} rate 佩戴率（0-100）
     */
    pushHelmetRate(time, rate) {
        this._push('helmet', time, rate);
    }

    /**
     * 推送 FPS 数据
     * @param {string} time 时间标签
     * @param {number} fps 帧率
     */
    pushFPSData(time, fps) {
        this._push('fps', time, fps);
    }

    /**
     * 推送延迟数据
     * @param {string} time 时间标签
     * @param {number} ms 延迟（毫秒）
     */
    pushLatencyData(time, ms) {
        this._push('latency', time, ms);
    }

    /**
     * 通用数据推送：写入时间标签与数值，超限则 shift 旧点，最后 setOption 更新
     * @param {string} key 图表键名
     * @param {string} time 时间标签
     * @param {number} value 数值
     * @private
     */
    _push(key, time, value) {
        const chart = this.charts[key];
        if (!chart || !chart.instance) {
            return;
        }
        // 追加新数据
        chart.times.push(time);
        chart.values.push(value);

        // 超过最大数据点则移除最旧点
        const maxPoints = CONFIG.charts.maxDataPoints;
        while (chart.times.length > maxPoints) {
            chart.times.shift();
            chart.values.shift();
        }

        // 末端点坐标：用于 markPoint 同步
        const lastIdx = chart.times.length - 1;
        const lastVal = chart.values[lastIdx];
        const markPointData =
            chart.values.length > 0 ? [{ coord: [lastIdx, lastVal] }] : [];

        // 更新图表：series 数据 + markPoint 末端点同步
        chart.instance.setOption({
            xAxis: { data: chart.times },
            series: [
                {
                    data: chart.values,
                    markPoint: { data: markPointData },
                },
            ],
        });
    }

    // ==================== 工具方法 ====================

    /**
     * 窗口 resize 时调用：重绘所有图表
     */
    resize() {
        Object.values(this.charts).forEach((chart) => {
            if (chart && chart.instance) {
                chart.instance.resize();
            }
        });
    }

    /**
     * hex 颜色转 rgba 字符串
     * @param {string} hex 如 '#00d4ff'
     * @param {number} alpha 透明度 0-1
     * @returns {string} rgba(...)
     * @private
     */
    _hexToRgba(hex, alpha) {
        let h = hex.replace('#', '');
        if (h.length === 3) {
            h = h.split('').map((c) => c + c).join('');
        }
        const r = parseInt(h.substring(0, 2), 16);
        const g = parseInt(h.substring(2, 4), 16);
        const b = parseInt(h.substring(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
}

export default ChartManager;

/**
 * WSManager.js — WebSocket 通信管理器
 * 负责与后端 AI 服务维持实时双向通信，保留原有业务协议：
 *   - event          : 报警事件（含坐标 / 事件类型 / 摄像头 ID）
 *   - track          : 人员轨迹（多人列表或单人坐标）
 *   - video_frame    : 视频帧（base64 / URL）
 *   - alert_from_camera : 跨摄像头报警通知
 * 连接断开后按 CONFIG.ws.reconnectInterval 自动重连，重连使用上次的 cameraId。
 */

import { CONFIG } from '../config/Config.js';

export class WSManager {
    /**
     * 构造函数：初始化内部状态
     */
    constructor() {
        // WebSocket 实例
        this.ws = null;
        // 当前连接的摄像头 ID（用于断线重连）
        this.cameraId = null;
        // 连接状态（内部标志，对外通过 getter 暴露）
        this._connected = false;
        // 重连定时器句柄
        this.reconnectTimer = null;
        // 事件监听器表：event -> Set<callback>
        this.listeners = new Map();
        // 是否处于主动断开状态（主动断开时不自动重连）
        this._manualClose = false;
    }

    /**
     * 连接 WebSocket
     * @param {number} cameraId 摄像头 ID，会拼接到 ws URL 上
     */
    connect(cameraId) {
        // 记录当前 cameraId，供断线重连使用
        this.cameraId = cameraId;
        // 重置主动断开标志
        this._manualClose = false;
        // 创建底层 WebSocket
        this._createSocket();
    }

    /**
     * 创建底层 WebSocket 连接（内部方法）
     * 每次创建前先清理旧连接，避免回调串扰
     * @private
     */
    _createSocket() {
        // 清理旧连接（置空回调，防止触发额外事件）
        this._cleanup();

        // 拼接 URL：ws://localhost:8000/ws?camera_id=${cameraId}
        const url = `${CONFIG.ws.url}?camera_id=${this.cameraId}`;
        this.ws = new WebSocket(url);

        // 连接成功打开
        this.ws.onopen = () => {
            this._connected = true;
            this._emit('open');
        };

        // 收到消息：统一解析 JSON 并按 type 分发
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this._handleMessage(data);
            } catch (err) {
                console.error('WSManager 消息解析失败:', err, event.data);
            }
        };

        // 连接关闭：触发回调并按需重连
        this.ws.onclose = () => {
            this._connected = false;
            this._emit('close');
            // 仅在非主动断开时自动重连
            if (!this._manualClose) {
                this._scheduleReconnect();
            }
        };

        // 连接错误：触发回调（close 紧随其后会自动重连）
        this.ws.onerror = (err) => {
            this._emit('error', err);
        };
    }

    /**
     * 处理收到消息：按 type 触发对应事件回调
     * 保留原有消息协议：
     *   - event             : { type, x, z, event, camera_id }
     *   - track             : { type, workers:[{id,x,z,helmet}] } 或 { type, x, z }
     *   - video_frame       : { type, frame, camera_id }
     *   - alert_from_camera : { type, camera_id, alert_type }
     * @param {object} data 解析后的消息对象
     * @private
     */
    _handleMessage(data) {
        switch (data.type) {
            case 'event':
                // 报警事件
                this._emit('event', data);
                break;
            case 'track':
                // 人员轨迹（可能是多人列表或单人坐标）
                this._emit('track', data);
                break;
            case 'video_frame':
                // 视频帧
                this._emit('video_frame', data);
                break;
            case 'alert_from_camera':
                // 跨摄像头报警
                this._emit('alert_from_camera', data);
                break;
            default:
                // 未知类型不做处理（保留扩展性）
                break;
        }
    }

    /**
     * 安排自动重连：按 CONFIG.ws.reconnectInterval 延迟重连
     * 同一时刻只保留一个重连定时器
     * @private
     */
    _scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            // 仅在仍持有 cameraId 且非主动断开时重连
            if (this.cameraId !== null && !this._manualClose) {
                this._createSocket();
            }
        }, CONFIG.ws.reconnectInterval);
    }

    /**
     * 清理旧 WebSocket 连接（置空回调避免串扰）
     * @private
     */
    _cleanup() {
        if (this.ws) {
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onclose = null;
            this.ws.onerror = null;
            try {
                this.ws.close();
            } catch (e) {
                // 忽略关闭异常
            }
            this.ws = null;
        }
    }

    /**
     * 主动断开连接（不会自动重连）
     */
    disconnect() {
        // 标记主动断开，阻止重连
        this._manualClose = true;
        // 清除待执行的重连定时器
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        // 清理底层连接
        this._cleanup();
        // 重置状态
        this._connected = false;
        this.cameraId = null;
    }

    /**
     * 发送数据（自动序列化为 JSON）
     * @param {object} data 待发送对象
     */
    send(data) {
        if (this.ws && this._connected) {
            this.ws.send(JSON.stringify(data));
        }
    }

    /**
     * 订阅事件
     * 支持事件：'open' | 'close' | 'error' | 'event' | 'track' | 'video_frame' | 'alert_from_camera'
     * @param {string} event 事件名
     * @param {Function} callback 回调函数
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
    }

    /**
     * 触发某事件的所有回调
     * @param {string} event 事件名
     * @param  {...any} args 参数
     * @private
     */
    _emit(event, ...args) {
        const cbs = this.listeners.get(event);
        if (cbs) {
            cbs.forEach((cb) => {
                try {
                    cb(...args);
                } catch (err) {
                    console.error(`WSManager [${event}] 回调异常:`, err);
                }
            });
        }
    }

    /**
     * 当前连接状态（只读 getter）
     * @returns {boolean}
     */
    get connected() {
        return this._connected;
    }
}

export default WSManager;

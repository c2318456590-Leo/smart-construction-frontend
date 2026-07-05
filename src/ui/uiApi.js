/**
 * uiApi.js — 前端 UI 调用后端视频源接口
 * 本次修改：把视频源添加/移除请求从 VideoPanel/UIManager 中拆出，统一封装后端 API 调用。
 */

import { CONFIG } from '../config/Config.js';

export async function addVideoSource(cameraId, source) {
    const url = `${CONFIG.api.base}${CONFIG.api.endpoints.addVideo}?camera_id=${cameraId}&source=${encodeURIComponent(source)}`;
    const resp = await fetch(url, { method: 'POST' });
    return resp.json();
}

export async function removeVideoSource(cameraId) {
    const url = `${CONFIG.api.base}${CONFIG.api.endpoints.removeVideo}?camera_id=${cameraId}`;
    const resp = await fetch(url, { method: 'POST' });
    return resp.json();
}

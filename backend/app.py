"""
智慧工地安全监测后端服务
FastAPI + WebSocket 实时推送检测结果、轨迹与事件

启动：python app.py 或 uvicorn app:app --host 0.0.0.0 --port 8000
模型文件缺失时自动进入模拟模式，保证前端可正常演示
"""
import os
import sys
import json
import math
import random
import asyncio
import base64
from contextlib import asynccontextmanager

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware

# 将当前目录加入路径以导入同目录模块
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# 配置与模型路径
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ZONES_CONFIG_PATH = os.path.join(BASE_DIR, "configs", "zones.json")
MODEL_CONFIG_PATH = os.path.join(BASE_DIR, "configs", "model_config.yaml")
HELMET_MODEL_PATH = os.path.join(BASE_DIR, "models", "helmet_detect.pt")
FIRE_SMOKE_MODEL_PATH = os.path.join(BASE_DIR, "models", "fire_smoke_detect.pt")
POSE_MODEL_PATH = os.path.join(BASE_DIR, "models", "yolov8n-pose.pt")

# 全局组件
helmet_detector = None       # 安全帽检测器
fire_smoke_detector = None   # 明火/烟雾检测器
fall_detector = None         # 跌倒检测器（基于 pose）
zone_monitor = None
coord_mapper = None
video_manager = None
# 模拟模式标志（所有模型文件均缺失时启用）
MOCK_MODE = False


def load_model_config():
    """加载模型配置（优先使用 pyyaml，缺失时回退默认值）"""
    config = {
        "inference": {"conf_threshold": 0.4, "iou_threshold": 0.5, "device": "cpu"},
        "fall_detection": {"min_angle": 45.0, "min_aspect_ratio": 1.2, "confirm_frames": 15},
    }
    try:
        if os.path.exists(MODEL_CONFIG_PATH):
            try:
                import yaml
                with open(MODEL_CONFIG_PATH, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f)
                if data:
                    config.update(data)
            except ImportError:
                # 未安装 pyyaml 时使用默认配置
                pass
    except Exception as e:
        print(f"[警告] 加载模型配置失败: {e}")
    return config


def init_components():
    """初始化所有检测组件，模型缺失时进入模拟模式（优雅降级）"""
    global helmet_detector, fire_smoke_detector, fall_detector
    global zone_monitor, coord_mapper, video_manager, MOCK_MODE

    config = load_model_config()
    inference = config.get("inference", {})
    fall_cfg = config.get("fall_detection", {})
    conf = inference.get("conf_threshold", 0.4)
    iou = inference.get("iou_threshold", 0.5)
    dev = inference.get("device", "cpu")

    # 坐标映射器（无需模型文件）
    from coord_mapper import CoordMapper
    coord_mapper = CoordMapper()

    # 区域监测器（无需模型文件）
    from zone_monitor import ZoneMonitor
    zone_monitor = ZoneMonitor(ZONES_CONFIG_PATH)

    # 视频源管理器（无需模型文件）
    from video_source import VideoSourceManager
    video_manager = VideoSourceManager()

    # 安全帽检测器
    try:
        if not os.path.exists(HELMET_MODEL_PATH):
            raise FileNotFoundError(HELMET_MODEL_PATH)
        from detector import SafetyDetector, HELMET_CLASS_NAMES
        helmet_detector = SafetyDetector(
            HELMET_MODEL_PATH,
            conf_threshold=conf,
            iou_threshold=iou,
            device=dev,
            class_names=HELMET_CLASS_NAMES,
        )
        print("[信息] 安全帽检测模型加载成功")
    except Exception as e:
        print(f"[警告] 安全帽检测模型加载失败: {e}")
        helmet_detector = None

    # 明火/烟雾检测器
    try:
        if not os.path.exists(FIRE_SMOKE_MODEL_PATH):
            raise FileNotFoundError(FIRE_SMOKE_MODEL_PATH)
        from detector import SafetyDetector, FIRE_SMOKE_CLASS_NAMES
        fire_smoke_detector = SafetyDetector(
            FIRE_SMOKE_MODEL_PATH,
            conf_threshold=conf,
            iou_threshold=iou,
            device=dev,
            class_names=FIRE_SMOKE_CLASS_NAMES,
        )
        print("[信息] 明火/烟雾检测模型加载成功")
    except Exception as e:
        print(f"[警告] 明火/烟雾检测模型加载失败: {e}")
        fire_smoke_detector = None

    # 跌倒检测器（需要 pose 模型文件）
    try:
        if not os.path.exists(POSE_MODEL_PATH):
            raise FileNotFoundError(POSE_MODEL_PATH)
        from pose_analyzer import FallDetector
        fall_detector = FallDetector(
            POSE_MODEL_PATH,
            conf_threshold=conf,
            device=dev,
            min_angle=fall_cfg.get("min_angle", 45.0),
            min_aspect_ratio=fall_cfg.get("min_aspect_ratio", 1.2),
            confirm_frames=fall_cfg.get("confirm_frames", 15),
        )
        print("[信息] 跌倒检测模型加载成功")
    except Exception as e:
        print(f"[警告] 跌倒检测模型加载失败: {e}")
        fall_detector = None

    # 所有检测模型都缺失时启用模拟模式
    if helmet_detector is None and fire_smoke_detector is None and fall_detector is None:
        MOCK_MODE = True
        print("[警告] 所有检测模型均不可用，进入模拟模式")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化组件，关闭时释放资源"""
    init_components()
    yield
    if video_manager:
        video_manager.release()


app = FastAPI(title="智慧工地安全监测后端", lifespan=lifespan)

# CORS 跨域配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    """健康检查端点"""
    return {
        "status": "ok",
        "mock_mode": MOCK_MODE,
        "helmet_detector_loaded": helmet_detector is not None,
        "fire_smoke_detector_loaded": fire_smoke_detector is not None,
        "fall_detector_loaded": fall_detector is not None,
    }


@app.get("/api/zones")
async def get_zones():
    """获取危险区域定义"""
    if zone_monitor:
        return {"danger_zones": zone_monitor.get_zones()}
    # 降级：直接读取配置文件
    try:
        with open(ZONES_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"danger_zones": []}


@app.get("/api/videos")
async def list_videos():
    """列出当前所有视频源"""
    sources = []
    if video_manager:
        sources = list(video_manager.list_sources())
    return {"sources": sources, "count": len(sources)}


@app.post("/api/videos/add")
async def add_video(camera_id: int = Query(1), source: str = Query(...)):
    """添加视频源：支持文件路径、RTSP 地址、摄像头索引(0/1/...)
    Example: /api/videos/add?camera_id=1&source=data/videos/demo.mp4
             /api/videos/add?camera_id=2&source=0  # 笔记本摄像头
    """
    if not video_manager:
        return {"success": False, "error": "VideoSourceManager not initialized"}
    success = video_manager.add_source(camera_id, source)
    return {"success": success, "camera_id": camera_id, "source": source}


@app.post("/api/videos/remove")
async def remove_video(camera_id: int = Query(1)):
    """移除指定视频源"""
    if not video_manager:
        return {"success": False, "error": "VideoSourceManager not initialized"}
    success = video_manager.remove_source(camera_id)
    return {"success": success, "camera_id": camera_id}


def encode_frame_to_jpeg(frame):
    """将 BGR 帧编码为 base64 JPEG 字符串"""
    try:
        ret, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if not ret:
            return None
        b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
        return f"data:image/jpeg;base64,{b64}"
    except Exception:
        return None


def has_equip(person_det, detections, target_classes):
    """判断人员框内是否包含指定装备类别（基于中心点包含关系）"""
    px1, py1, px2, py2 = person_det["bbox"]
    for det in detections:
        if det["cls"] not in target_classes:
            continue
        cx, cy = det["bbox_center"]
        if px1 <= cx <= px2 and py1 <= cy <= py2:
            return True
    return False


def build_track_message(persons, detections, camera_id):
    """根据人员与检测结果构建轨迹消息

    Args:
        persons: pose 模型检测到的人员列表
        detections: helmet/fire_smoke 模型的检测结果（用于判断装备）
        camera_id: 摄像头标识
    """
    workers = []
    for i, person in enumerate(persons):
        cx, cy = person["bbox_center"]
        # 像素坐标映射到3D场景坐标
        X, Z = coord_mapper.map([cx, cy], camera_id) if coord_mapper else (0.0, 0.0)
        helmet = has_equip(person, detections, ["helmet"])
        workers.append({
            "id": f"W{camera_id:02d}{i + 1:03d}",
            "x": round(X, 2),
            "z": round(Z, 2),
            "helmet": helmet,
        })
    return {"type": "track", "workers": workers}


def run_all_detectors(frame):
    """运行所有可用的检测模型，合并检测结果"""
    detections = []
    if helmet_detector:
        detections.extend(helmet_detector.detect(frame))
    if fire_smoke_detector:
        detections.extend(fire_smoke_detector.detect(frame))
    return detections


def process_real_frame(frame, camera_id):
    """处理真实视频帧，返回事件列表、轨迹消息与标注帧"""
    events = []
    # 合并所有检测模型的检测结果
    detections = run_all_detectors(frame)

    # 人员检测：优先用 pose 模型（同时用于跌倒检测）；pose 不可用时从 helmet 模型的
    # no_helmet/helmet 框无法得到完整人体框，此时人员相关功能降级
    persons = []
    if fall_detector:
        persons = fall_detector.detect_persons(frame)

    # 人员相关事件：区域入侵、跌倒
    for idx, person in enumerate(persons):
        cx, cy = person["bbox_center"]
        X, Z = coord_mapper.map([cx, cy], camera_id)

        # 区域入侵检测
        zone_name = zone_monitor.check(X, Z) if zone_monitor else None
        if zone_name:
            events.append({
                "type": "event",
                "x": round(X, 2), "z": round(Z, 2),
                "event": "intrusion",
                "camera_id": camera_id,
                "confidence": person["confidence"],
            })

        # 跌倒检测
        if fall_detector:
            fall_res = fall_detector.check_fall(frame, person["bbox"],
                                                person_id=f"{camera_id}-{idx}")
            if fall_res["is_fall"]:
                events.append({
                    "type": "event",
                    "x": round(X, 2), "z": round(Z, 2),
                    "event": "fall",
                    "camera_id": camera_id,
                    "confidence": person["confidence"],
                })

    # 违规装备 / 危险行为事件（no_helmet / smoke / fire）
    for det in detections:
        if det["cls"] in ("no_helmet", "smoke", "fire"):
            cx, cy = det["bbox_center"]
            X, Z = coord_mapper.map([cx, cy], camera_id) if coord_mapper else (0.0, 0.0)
            events.append({
                "type": "event",
                "x": round(X, 2), "z": round(Z, 2),
                "event": det["cls"],
                "camera_id": camera_id,
                "confidence": det["confidence"],
            })

    track_msg = build_track_message(persons, detections, camera_id)
    # 绘制检测结果（用 helmet_detector 的绘制方法，颜色映射在模块级统一）
    if helmet_detector:
        annotated = helmet_detector.draw_results(frame, detections)
    elif fire_smoke_detector:
        annotated = fire_smoke_detector.draw_results(frame, detections)
    else:
        annotated = frame.copy()
    return events, track_msg, annotated


# ============ 模拟模式数据生成 ============
MOCK_WORKERS = [
    {"id": "W001", "x": -20.0, "z": -20.0, "helmet": True, "vest": True, "phase": 0.0},
    {"id": "W002", "x": 5.0, "z": -10.0, "helmet": False, "vest": True, "phase": 1.5},
    {"id": "W003", "x": -30.0, "z": 30.0, "helmet": True, "vest": False, "phase": 3.0},
]
_mock_t = 0.0


def gen_mock_data(camera_id):
    """生成模拟事件与轨迹数据"""
    global _mock_t
    _mock_t += 0.2
    events = []
    workers = []
    for w in MOCK_WORKERS:
        # 让工人在场景内做小幅游走
        x = w["x"] + math.sin(_mock_t + w["phase"]) * 3.0
        z = w["z"] + math.cos(_mock_t + w["phase"]) * 3.0
        workers.append({
            "id": w["id"],
            "x": round(x, 2),
            "z": round(z, 2),
            "helmet": w["helmet"],
            "vest": w["vest"],
        })

        # 区域入侵检测
        zone_name = zone_monitor.check(x, z) if zone_monitor else None
        if zone_name:
            events.append({
                "type": "event",
                "x": round(x, 2), "z": round(z, 2),
                "event": "intrusion",
                "camera_id": camera_id,
                "confidence": 0.9,
            })
        # 未戴安全帽事件
        if not w["helmet"]:
            events.append({
                "type": "event",
                "x": round(x, 2), "z": round(z, 2),
                "event": "no_helmet",
                "camera_id": camera_id,
                "confidence": 0.85,
            })
        # 未穿反光背心事件
        if not w["vest"]:
            events.append({
                "type": "event",
                "x": round(x, 2), "z": round(z, 2),
                "event": "no_vest",
                "camera_id": camera_id,
                "confidence": 0.8,
            })

    # 偶发模拟吸烟/火灾事件
    if random.random() < 0.05:
        events.append({
            "type": "event",
            "x": round(random.uniform(-25, 25), 2),
            "z": round(random.uniform(-25, 25), 2),
            "event": random.choice(["smoke", "fire"]),
            "camera_id": camera_id,
            "confidence": round(random.uniform(0.7, 0.95), 2),
        })

    track_msg = {"type": "track", "workers": workers}
    return events, track_msg


def gen_mock_frame(camera_id):
    """生成模拟视频帧（带文字说明的占位图）"""
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:] = (40, 40, 40)
    cv2.putText(img, f"MOCK MODE - Camera {camera_id}", (40, 230),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)
    cv2.putText(img, "Model files not found", (40, 280),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 200), 1)
    cv2.putText(img, "Generating simulated data...", (40, 320),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 200), 1)
    return img


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    """WebSocket 端点：实时推送事件、轨迹与视频帧"""
    await ws.accept()
    # 从 query 参数获取摄像头标识，默认 1
    cam_param = ws.query_params.get("camera_id", "1")
    try:
        camera_id = int(cam_param)
    except (TypeError, ValueError):
        camera_id = 1

    try:
        while True:
            if MOCK_MODE:
                # 模拟模式：生成模拟数据与占位帧
                events, track_msg = gen_mock_data(camera_id)
                frame = gen_mock_frame(camera_id)
                b64 = encode_frame_to_jpeg(frame)
            else:
                # 真实检测模式：读取视频帧并进行检测
                frame = video_manager.read_frame(camera_id) if video_manager else None
                if frame is None:
                    # 无视频源时回退到模拟模式
                    events, track_msg = gen_mock_data(camera_id)
                    frame = gen_mock_frame(camera_id)
                    b64 = encode_frame_to_jpeg(frame)
                else:
                    events, track_msg, annotated = process_real_frame(frame, camera_id)
                    b64 = encode_frame_to_jpeg(annotated)

            # 推送事件
            for ev in events:
                await ws.send_json(ev)
            # 推送轨迹
            await ws.send_json(track_msg)
            # 推送视频帧
            if b64:
                await ws.send_json({
                    "type": "video_frame",
                    "camera_id": camera_id,
                    "frame": b64,
                })
            # 约15帧/秒
            await asyncio.sleep(1.0 / 15)
    except WebSocketDisconnect:
        print("[信息] WebSocket 客户端断开连接")
    except Exception as e:
        print(f"[错误] WebSocket 异常: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)

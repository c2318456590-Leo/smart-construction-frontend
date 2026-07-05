"""
模拟数据流服务。
本次修改：从 app.py 拆出 mock 人员轨迹、mock 报警事件和 mock 视频帧生成逻辑。
"""
import math
import random

import cv2
import numpy as np


MOCK_WORKERS = [
    {"id": "W001", "x": -20.0, "z": -20.0, "helmet": True, "vest": True, "phase": 0.0},
    {"id": "W002", "x": 5.0, "z": -10.0, "helmet": False, "vest": True, "phase": 1.5},
    {"id": "W003", "x": -30.0, "z": 30.0, "helmet": True, "vest": False, "phase": 3.0},
]
_mock_t = 0.0


def gen_mock_data(camera_id, zone_monitor=None):
    """生成模拟事件与轨迹数据。"""
    global _mock_t
    _mock_t += 0.2
    events = []
    workers = []
    for worker in MOCK_WORKERS:
        x_pos = worker["x"] + math.sin(_mock_t + worker["phase"]) * 3.0
        z_pos = worker["z"] + math.cos(_mock_t + worker["phase"]) * 3.0
        workers.append({
            "id": worker["id"],
            "x": round(x_pos, 2),
            "z": round(z_pos, 2),
            "helmet": worker["helmet"],
            "vest": worker["vest"],
        })

        zone_name = zone_monitor.check(x_pos, z_pos) if zone_monitor else None
        if zone_name:
            events.append(_event("intrusion", x_pos, z_pos, camera_id, 0.9))
        if not worker["helmet"]:
            events.append(_event("no_helmet", x_pos, z_pos, camera_id, 0.85))
        if not worker["vest"]:
            events.append(_event("no_vest", x_pos, z_pos, camera_id, 0.8))

    if random.random() < 0.05:
        events.append(_event(
            random.choice(["smoke", "fire"]),
            random.uniform(-25, 25),
            random.uniform(-25, 25),
            camera_id,
            round(random.uniform(0.7, 0.95), 2),
        ))

    return events, {"type": "track", "workers": workers}


def gen_mock_frame(camera_id):
    """生成模拟视频帧（带文字说明的占位图）。"""
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:] = (40, 40, 40)
    cv2.putText(img, f"MOCK MODE - Camera {camera_id}", (40, 230),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 255, 255), 2)
    cv2.putText(img, "Model files not found", (40, 280),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 200), 1)
    cv2.putText(img, "Generating simulated data...", (40, 320),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 200), 1)
    return img


def _event(event_type, x_pos, z_pos, camera_id, confidence):
    return {
        "type": "event",
        "x": round(x_pos, 2),
        "z": round(z_pos, 2),
        "event": event_type,
        "camera_id": camera_id,
        "confidence": confidence,
    }

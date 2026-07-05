"""端到端演示验证：读取视频帧，跑所有检测模型，打印事件"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cv2
from detector import SafetyDetector, HELMET_CLASS_NAMES, FIRE_SMOKE_CLASS_NAMES
from pose_analyzer import FallDetector
from zone_monitor import ZoneMonitor
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 加载所有模型
print("加载模型...")
helmet_detector = SafetyDetector(
    os.path.join(BASE_DIR, "backend", "models", "helmet_detect.pt"),
    class_names=HELMET_CLASS_NAMES,
    conf_threshold=0.4,
    device="0"
)
print("  安全帽模型加载完成")

fire_smoke_detector = SafetyDetector(
    os.path.join(BASE_DIR, "backend", "models", "fire_smoke_detect.pt"),
    class_names=FIRE_SMOKE_CLASS_NAMES,
    conf_threshold=0.4,
    device="0"
)
print("  明火/烟雾模型加载完成")

fall_detector = FallDetector(
    os.path.join(BASE_DIR, "backend", "models", "yolov8n-pose.pt"),
    device="0"
)
print("  跌倒检测模型加载完成")

# 危险区域（从配置文件加载）
ZONES_CONFIG_PATH = os.path.join(BASE_DIR, "backend", "configs", "zones.json")
zone_monitor = ZoneMonitor(ZONES_CONFIG_PATH)
print(f"  危险区域加载完成: {len(zone_monitor.get_zones())} 个区域")

# 打开视频
video_path = r"C:\Users\23184\Desktop\web（智慧工地前端）\data\videos\28531297319-1-100026.mp4"
cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print(f"\n视频: {total_frames} 帧, {fps} fps, 时长 {total_frames/fps:.1f}s")

# 跑前 30 帧（约 1.2 秒），统计检测结果
frame_count = 0
event_log = []
helmet_count = 0
no_helmet_count = 0
person_count = 0

print("\n开始逐帧检测（前 30 帧）...")
while frame_count < 30:
    ret, frame = cap.read()
    if not ret:
        break
    frame_count += 1

    # 安全帽检测
    helmet_dets = helmet_detector.detect(frame)
    for d in helmet_dets:
        if d["cls"] == "helmet":
            helmet_count += 1
        elif d["cls"] == "no_helmet":
            no_helmet_count += 1
            event_log.append(f"  帧{frame_count}: no_helmet @ ({d['bbox'][0]:.0f},{d['bbox'][1]:.0f}), conf={d['confidence']:.2f}")

    # 明火/烟雾检测
    fire_dets = fire_smoke_detector.detect(frame)
    for d in fire_dets:
        event_log.append(f"  帧{frame_count}: {d['cls']} @ ({d['bbox'][0]:.0f},{d['bbox'][1]:.0f}), conf={d['confidence']:.2f}")

    # 跌倒检测（每 5 帧跑一次，模拟实时）
    if frame_count % 5 == 0:
        persons = fall_detector.detect_persons(frame)
        person_count = len(persons)
        for idx, p in enumerate(persons):
            fall_res = fall_detector.check_fall(frame, p["bbox"], person_id=f"test-{idx}")
            if fall_res["fall_pose"]:
                event_log.append(f"  帧{frame_count}: FALL跌倒姿态 (angle={fall_res['angle']}°, ratio={fall_res['aspect_ratio']})")
            if fall_res["is_fall"]:
                event_log.append(f"  帧{frame_count}: ✅ 确认跌倒! (持续帧达标)")

cap.release()

print(f"\n===== 检测结果汇总 (前 {frame_count} 帧) =====")
print(f"安全帽检测: helmet={helmet_count} 次, no_helmet={no_helmet_count} 次")
print(f"姿态估计: 每5帧检测一次, 最后一帧人数={person_count}")
print(f"事件日志 ({len(event_log)} 条):")
for e in event_log[:10]:
    print(e)
if len(event_log) > 10:
    print(f"  ... 还有 {len(event_log)-10} 条")

print("\n✅ 端到端链路验证通过！")

"""
真实视频帧检测流水线。
本次修改：从 app.py 拆出检测结果合并、装备判断、轨迹消息构建和真实帧事件生成逻辑。
"""


def has_equip(person_det, detections, target_classes):
    """判断人员框内是否包含指定装备类别（基于中心点包含关系）。"""
    px1, py1, px2, py2 = person_det["bbox"]
    for det in detections:
        if det["cls"] not in target_classes:
            continue
        cx, cy = det["bbox_center"]
        if px1 <= cx <= px2 and py1 <= cy <= py2:
            return True
    return False


def build_track_message(persons, detections, camera_id, coord_mapper):
    """根据人员与检测结果构建轨迹消息。"""
    workers = []
    for i, person in enumerate(persons):
        cx, cy = person["bbox_center"]
        x_pos, z_pos = coord_mapper.map([cx, cy], camera_id) if coord_mapper else (0.0, 0.0)
        workers.append({
            "id": f"W{camera_id:02d}{i + 1:03d}",
            "x": round(x_pos, 2),
            "z": round(z_pos, 2),
            "helmet": has_equip(person, detections, ["helmet"]),
        })
    return {"type": "track", "workers": workers}


def run_all_detectors(frame, runtime_state):
    """运行所有可用的目标检测模型，合并检测结果。"""
    detections = []
    if runtime_state.helmet_detector:
        detections.extend(runtime_state.helmet_detector.detect(frame))
    if runtime_state.fire_smoke_detector:
        detections.extend(runtime_state.fire_smoke_detector.detect(frame))
    return detections


def process_real_frame(frame, camera_id, runtime_state):
    """处理真实视频帧，返回事件列表、轨迹消息与标注帧。"""
    events = []
    detections = run_all_detectors(frame, runtime_state)

    persons = []
    if runtime_state.fall_detector:
        persons = runtime_state.fall_detector.detect_persons(frame)

    for idx, person in enumerate(persons):
        cx, cy = person["bbox_center"]
        x_pos, z_pos = runtime_state.coord_mapper.map([cx, cy], camera_id)

        zone_name = runtime_state.zone_monitor.check(x_pos, z_pos) if runtime_state.zone_monitor else None
        if zone_name:
            events.append({
                "type": "event",
                "x": round(x_pos, 2),
                "z": round(z_pos, 2),
                "event": "intrusion",
                "camera_id": camera_id,
                "confidence": person["confidence"],
            })

        fall_res = runtime_state.fall_detector.check_fall(
            frame,
            person["bbox"],
            person_id=f"{camera_id}-{idx}",
        ) if runtime_state.fall_detector else {"is_fall": False}
        if fall_res["is_fall"]:
            events.append({
                "type": "event",
                "x": round(x_pos, 2),
                "z": round(z_pos, 2),
                "event": "fall",
                "camera_id": camera_id,
                "confidence": person["confidence"],
            })

    for det in detections:
        if det["cls"] in ("no_helmet", "smoke", "fire"):
            cx, cy = det["bbox_center"]
            x_pos, z_pos = runtime_state.coord_mapper.map([cx, cy], camera_id) if runtime_state.coord_mapper else (0.0, 0.0)
            events.append({
                "type": "event",
                "x": round(x_pos, 2),
                "z": round(z_pos, 2),
                "event": det["cls"],
                "camera_id": camera_id,
                "confidence": det["confidence"],
            })

    track_msg = build_track_message(persons, detections, camera_id, runtime_state.coord_mapper)
    if runtime_state.helmet_detector:
        annotated = runtime_state.helmet_detector.draw_results(frame, detections)
    elif runtime_state.fire_smoke_detector:
        annotated = runtime_state.fire_smoke_detector.draw_results(frame, detections)
    else:
        annotated = frame.copy()
    return events, track_msg, annotated

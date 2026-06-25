"""
跌倒检测模块
基于 YOLOv8-Pose 骨骼关键点分析人员是否跌倒
"""
import math
import numpy as np


class FallDetector:
    """跌倒检测器"""

    # COCO 17 关键点索引（此处仅列出用到的）
    # 5:左肩 6:右肩 11:左髋 12:右髋

    def __init__(self, model_path, conf_threshold=0.4, device="cpu",
                 min_angle=45.0, min_aspect_ratio=1.2, confirm_frames=15):
        """
        初始化跌倒检测器

        Args:
            model_path: YOLOv8-Pose 模型路径
            conf_threshold: 关键点置信度阈值
            device: 推理设备
            min_angle: 躯干与水平面夹角阈值（度），低于此值视为跌倒姿态
            min_aspect_ratio: 边界框宽高比阈值，大于此值视为跌倒姿态
            confirm_frames: 确认跌倒所需持续帧数（约1秒，15帧）
        """
        from ultralytics import YOLO
        self.model = YOLO(model_path)
        self.conf_threshold = conf_threshold
        self.device = device
        self.min_angle = min_angle
        self.min_aspect_ratio = min_aspect_ratio
        self.confirm_frames = confirm_frames
        # 持续帧计数器：{person_id: fall_frame_count}
        self._fall_counters = {}

    def detect_persons(self, frame):
        """
        用 pose 模型扫描全图，返回人员边界框列表

        Args:
            frame: BGR 图像帧

        Returns:
            list[dict]: 每个元素 {bbox:[x1,y1,x2,y2], confidence:float, bbox_center:[cx,cy]}
        """
        results = self.model(frame, conf=self.conf_threshold,
                             device=self.device, verbose=False)
        persons = []
        if not results:
            return persons
        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                conf = float(box.conf[0].item())
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0
                persons.append({
                    "bbox": [x1, y1, x2, y2],
                    "confidence": conf,
                    "bbox_center": [cx, cy],
                })
        return persons

    def check_fall(self, frame, person_bbox, person_id=None):
        """
        对给定人员区域提取骨骼关键点，判断是否跌倒

        Args:
            frame: 完整图像帧
            person_bbox: 人员边界框 [x1, y1, x2, y2]
            person_id: 人员标识，用于持续帧计数（None 时使用默认键）

        Returns:
            dict: {
                "is_fall": bool,        # 是否确认跌倒
                "fall_pose": bool,      # 当前帧是否为跌倒姿态
                "angle": float,         # 躯干与水平面夹角（度）
                "aspect_ratio": float,  # 边界框宽高比
                "keypoints": np.ndarray # 关键点数组 (17,3)
            }
        """
        x1, y1, x2, y2 = [int(v) for v in person_bbox]
        h, w = frame.shape[:2]
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(w, x2), min(h, y2)
        # 裁剪人员区域用于姿态估计
        person_crop = frame[y1:y2, x1:x2]

        # 默认返回值
        default_result = {
            "is_fall": False,
            "fall_pose": False,
            "angle": 90.0,
            "aspect_ratio": 0.0,
            "keypoints": None,
        }

        if person_crop.size == 0:
            return default_result

        results = self.model(person_crop, conf=self.conf_threshold,
                             device=self.device, verbose=False)
        if not results or results[0].keypoints is None:
            return default_result

        kpts = results[0].keypoints.data  # shape: (N, 17, 3)
        if len(kpts) == 0:
            return default_result

        # 取第一个人的关键点
        kpt = kpts[0].cpu().numpy()  # (17, 3) 每行 [x, y, conf]
        # 关键点坐标加回裁剪偏移，还原到原图坐标系
        kpt[:, 0] += x1
        kpt[:, 1] += y1

        l_hip = kpt[11]        # 左髋
        r_hip = kpt[12]        # 右髋
        l_shoulder = kpt[5]    # 左肩
        r_shoulder = kpt[6]    # 右肩

        # 关键点置信度不足时无法可靠计算
        if (l_hip[2] < self.conf_threshold or r_hip[2] < self.conf_threshold
                or l_shoulder[2] < self.conf_threshold or r_shoulder[2] < self.conf_threshold):
            return default_result

        # 髋关节中点
        hip_mid = np.array([(l_hip[0] + r_hip[0]) / 2.0, (l_hip[1] + r_hip[1]) / 2.0])
        # 颈部（左右肩中点近似）
        neck = np.array([(l_shoulder[0] + r_shoulder[0]) / 2.0,
                         (l_shoulder[1] + r_shoulder[1]) / 2.0])

        # 躯干向量（从髋关节中点指向颈部）
        torso = neck - hip_mid
        dx, dy = torso[0], torso[1]

        # 躯干与水平面的夹角（度）
        # 站立时向量接近垂直，角度接近90°；跌倒时接近水平，角度接近0°
        angle = math.degrees(math.atan2(abs(dy), abs(dx)))

        # 边界框宽高比（跌倒时宽>高，比值偏大）
        bbox_w = x2 - x1
        bbox_h = y2 - y1
        aspect_ratio = bbox_w / bbox_h if bbox_h > 0 else 0.0

        # 判定跌倒姿态：夹角<阈值 且 宽高比>阈值
        fall_pose = (angle < self.min_angle) and (aspect_ratio > self.min_aspect_ratio)

        # 持续帧计数：跌倒姿态需持续超过1秒（约15帧）才确认
        key = person_id if person_id is not None else "default"
        if fall_pose:
            self._fall_counters[key] = self._fall_counters.get(key, 0) + 1
        else:
            self._fall_counters[key] = 0

        is_fall = self._fall_counters.get(key, 0) >= self.confirm_frames

        return {
            "is_fall": is_fall,
            "fall_pose": fall_pose,
            "angle": round(angle, 2),
            "aspect_ratio": round(aspect_ratio, 3),
            "keypoints": kpt,
        }

    def reset(self, person_id=None):
        """重置指定人员或全部人员的跌倒计数"""
        if person_id is None:
            self._fall_counters.clear()
        else:
            self._fall_counters.pop(person_id, None)

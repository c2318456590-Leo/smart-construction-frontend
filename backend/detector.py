"""
安全检测封装模块
基于 YOLOv8 实现工地安全装备与危险行为检测
支持多模型：安全帽检测、明火/烟雾检测
"""
import cv2
import numpy as np


# 各类别对应的绘制颜色 (B, G, R)
CLASS_COLORS = {
    "helmet": (0, 255, 0),
    "no_helmet": (0, 0, 255),
    "vest": (0, 255, 0),
    "no_vest": (0, 0, 255),
    "smoke": (0, 165, 255),
    "fire": (0, 0, 255),
    "person": (255, 255, 0),
    "fall": (0, 0, 255),
}


class SafetyDetector:
    """YOLOv8 安全检测器封装类（单模型，自定义类别映射）"""

    def __init__(self, model_path, conf_threshold=0.4, iou_threshold=0.5, device="cpu",
                 class_names=None):
        """
        初始化检测器并加载 YOLO 模型

        Args:
            model_path: 模型权重文件路径
            conf_threshold: 置信度阈值
            iou_threshold: NMS IOU 阈值
            device: 推理设备 ('cpu' 或 'cuda')
            class_names: 类别索引到名称的映射 dict {0: 'name', ...}
                         为 None 时尝试从模型 names 属性读取
        """
        from ultralytics import YOLO
        self.model = YOLO(model_path)
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.device = device
        # 类别映射：优先使用传入的，否则从模型读取
        if class_names:
            self.class_names = class_names
        else:
            try:
                names = self.model.names
                self.class_names = {int(k): v for k, v in names.items()}
            except Exception:
                self.class_names = {}

    def detect(self, frame):
        """
        对输入帧执行目标检测

        Args:
            frame: BGR 格式的图像帧 (numpy 数组)

        Returns:
            list[dict]: 检测结果列表，每个元素包含：
                - cls: 类别名称
                - confidence: 置信度
                - bbox: 边界框 [x1, y1, x2, y2]
                - bbox_center: 边界框中心 [cx, cy]
        """
        results = self.model(
            frame,
            conf=self.conf_threshold,
            iou=self.iou_threshold,
            device=self.device,
            verbose=False,
        )
        detections = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                cls_idx = int(box.cls[0].item())
                confidence = float(box.conf[0].item())
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                cls_name = self.class_names.get(cls_idx, str(cls_idx))
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0
                detections.append({
                    "cls": cls_name,
                    "confidence": confidence,
                    "bbox": [x1, y1, x2, y2],
                    "bbox_center": [cx, cy],
                })
        return detections

    def draw_results(self, frame, detections=None):
        """
        在帧上绘制检测框与标签

        Args:
            frame: 原始帧
            detections: 检测结果列表，若为 None 则重新检测

        Returns:
            标注后的帧
        """
        if detections is None:
            detections = self.detect(frame)

        annotated = frame.copy()
        for det in detections:
            x1, y1, x2, y2 = [int(v) for v in det["bbox"]]
            cls_name = det["cls"]
            conf = det["confidence"]
            color = CLASS_COLORS.get(cls_name, (255, 255, 255))
            label = f"{cls_name} {conf:.2f}"

            # 绘制边界框
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            # 绘制标签背景与文字
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            cv2.rectangle(annotated, (x1, y1 - th - 6), (x1 + tw, y1), color, -1)
            cv2.putText(annotated, label, (x1, y1 - 4),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
        return annotated


# 各检测模型的类别映射（按训练时的类别顺序）
HELMET_CLASS_NAMES = {0: "helmet", 1: "no_helmet"}
FIRE_SMOKE_CLASS_NAMES = {0: "fire", 1: "smoke"}

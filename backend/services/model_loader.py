"""
模型加载与运行时状态服务。
本次修改：从 app.py 拆出模型配置读取、模型路径解析、检测器初始化、mock 模式判断和资源释放逻辑。
"""
import os
from dataclasses import dataclass
from typing import Optional


BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZONES_CONFIG_PATH = os.path.join(BASE_DIR, "configs", "zones.json")
MODEL_CONFIG_PATH = os.path.join(BASE_DIR, "configs", "model_config.yaml")


@dataclass
class RuntimeState:
    helmet_detector: Optional[object] = None
    fire_smoke_detector: Optional[object] = None
    fall_detector: Optional[object] = None
    zone_monitor: Optional[object] = None
    coord_mapper: Optional[object] = None
    video_manager: Optional[object] = None
    mock_mode: bool = False
    model_config: Optional[dict] = None


state = RuntimeState()


def load_model_config():
    """加载模型配置；pyyaml 不可用或配置缺失时使用默认值。"""
    config = {
        "model_paths": {
            "helmet": "models/helmet_detect.pt",
            "fire_smoke": "models/fire_smoke_detect.pt",
            "pose": "models/yolov8n-pose.pt",
        },
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
                    config["model_paths"] = {
                        **{
                            "helmet": "models/helmet_detect.pt",
                            "fire_smoke": "models/fire_smoke_detect.pt",
                            "pose": "models/yolov8n-pose.pt",
                        },
                        **(data.get("model_paths") or {}),
                    }
            except ImportError:
                pass
    except Exception as exc:
        print(f"[警告] 加载模型配置失败: {exc}")
    return config


def resolve_model_path(path):
    """按 backend/ 为基准解析模型相对路径。"""
    if not path:
        return ""
    if os.path.isabs(path):
        return path
    return os.path.join(BASE_DIR, path)


def init_components():
    """初始化检测组件；单个模型缺失只禁用对应检测器，全部缺失时进入 mock 模式。"""
    config = load_model_config()
    inference = config.get("inference", {})
    fall_cfg = config.get("fall_detection", {})
    model_paths = config.get("model_paths", {})
    conf = inference.get("conf_threshold", 0.4)
    iou = inference.get("iou_threshold", 0.5)
    dev = inference.get("device", "cpu")

    from coord_mapper import CoordMapper
    from zone_monitor import ZoneMonitor
    from video_source import VideoSourceManager

    state.coord_mapper = CoordMapper()
    state.zone_monitor = ZoneMonitor(ZONES_CONFIG_PATH)
    state.video_manager = VideoSourceManager()
    state.model_config = config

    state.helmet_detector = _load_safety_detector(
        resolve_model_path(model_paths.get("helmet")),
        "安全帽检测",
        conf,
        iou,
        dev,
        detector_type="helmet",
    )
    state.fire_smoke_detector = _load_safety_detector(
        resolve_model_path(model_paths.get("fire_smoke")),
        "明火/烟雾检测",
        conf,
        iou,
        dev,
        detector_type="fire_smoke",
    )
    state.fall_detector = _load_fall_detector(
        resolve_model_path(model_paths.get("pose")),
        conf,
        dev,
        fall_cfg,
    )

    state.mock_mode = (
        state.helmet_detector is None
        and state.fire_smoke_detector is None
        and state.fall_detector is None
    )
    if state.mock_mode:
        print("[警告] 所有检测模型均不可用，进入模拟模式")


def shutdown_components():
    """释放运行时资源。"""
    if state.video_manager:
        state.video_manager.release()


def get_state():
    """返回全局运行时状态。"""
    return state


def _load_safety_detector(model_path, label, conf, iou, device, detector_type):
    try:
        if not os.path.exists(model_path):
            raise FileNotFoundError(model_path)
        from detector import SafetyDetector, FIRE_SMOKE_CLASS_NAMES, HELMET_CLASS_NAMES
        class_names = HELMET_CLASS_NAMES if detector_type == "helmet" else FIRE_SMOKE_CLASS_NAMES
        detector = SafetyDetector(
            model_path,
            conf_threshold=conf,
            iou_threshold=iou,
            device=device,
            class_names=class_names,
        )
        print(f"[信息] {label}模型加载成功")
        return detector
    except Exception as exc:
        print(f"[警告] {label}模型加载失败: {exc}")
        return None


def _load_fall_detector(model_path, conf, device, fall_cfg):
    try:
        if not os.path.exists(model_path):
            raise FileNotFoundError(model_path)
        from pose_analyzer import FallDetector
        detector = FallDetector(
            model_path,
            conf_threshold=conf,
            device=device,
            min_angle=fall_cfg.get("min_angle", 45.0),
            min_aspect_ratio=fall_cfg.get("min_aspect_ratio", 1.2),
            confirm_frames=fall_cfg.get("confirm_frames", 15),
        )
        print("[信息] 跌倒检测模型加载成功")
        return detector
    except Exception as exc:
        print(f"[警告] 跌倒检测模型加载失败: {exc}")
        return None

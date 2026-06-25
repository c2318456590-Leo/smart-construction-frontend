"""
视频源管理模块
支持多摄像头视频源接入与循环播放
"""
import cv2


class VideoSourceManager:
    """多视频源管理器"""

    def __init__(self):
        """初始化视频源管理器"""
        # {cam_id: {"cap": VideoCapture, "source": source}}
        self._sources = {}

    def add_source(self, cam_id, source):
        """
        添加视频源

        Args:
            cam_id: 摄像头标识
            source: 视频源（文件路径 / RTSP 地址 / 摄像头索引）

        Returns:
            bool: 是否成功打开
        """
        # 已存在则先释放旧的
        if cam_id in self._sources:
            self._release_one(cam_id)

        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            return False
        self._sources[cam_id] = {"cap": cap, "source": source}
        return True

    def read_frame(self, cam_id):
        """
        读取一帧

        Args:
            cam_id: 摄像头标识

        Returns:
            frame or None: BGR 帧或 None（读取失败时尝试重新打开以实现循环播放）
        """
        info = self._sources.get(cam_id)
        if info is None:
            return None

        cap = info["cap"]
        ret, frame = cap.read()
        if ret and frame is not None:
            return frame

        # 文件结束或读取失败，尝试重新打开实现循环播放
        source = info["source"]
        # 仅对字符串类型的文件路径 / RTSP 进行循环重开（摄像头索引不循环）
        if isinstance(source, str) and not source.isdigit():
            cap.release()
            new_cap = cv2.VideoCapture(source)
            if new_cap.isOpened():
                ret2, frame2 = new_cap.read()
                self._sources[cam_id]["cap"] = new_cap
                if ret2 and frame2 is not None:
                    return frame2
        return None

    def _release_one(self, cam_id):
        """释放单个视频源"""
        info = self._sources.get(cam_id)
        if info:
            info["cap"].release()
            del self._sources[cam_id]

    def release(self):
        """释放所有视频源"""
        for cam_id in list(self._sources.keys()):
            self._release_one(cam_id)

    def list_sources(self):
        """返回当前所有摄像头标识及对应的视频源信息"""
        return [(cam_id, info["source"]) for cam_id, info in self._sources.items()]

    def remove_source(self, cam_id):
        """移除指定视频源

        Returns:
            bool: 是否成功移除
        """
        if cam_id in self._sources:
            self._release_one(cam_id)
            return True
        return False

"""
坐标映射模块
通过单应性矩阵将图像像素坐标映射到3D场景地面坐标 (X, Z)
"""
import numpy as np
import cv2


class CoordMapper:
    """像素坐标 → 3D 场景坐标映射器"""

    # 默认标定点配置：每个摄像头4个 (像素点, 场景点)
    # 像素点 [u, v]，场景点 [X, Z]（对应前端 Three.js 地面坐标）
    # 场景范围：200x200 单位，坐标范围 -100 到 100
    DEFAULT_CALIBRATION = {
        1: {
            # 主监控摄像头：覆盖主施工区（建筑附近）
            # 假设视频分辨率 640x480
            "img_pts": [[80, 400], [560, 400], [560, 80], [80, 80]],
            "world_pts": [[-60, -60], [60, -60], [60, 60], [-60, 60]],
        },
        2: {
            # 堆场监控摄像头
            "img_pts": [[100, 380], [540, 380], [540, 100], [100, 100]],
            "world_pts": [[-70, 30], [-30, 30], [-30, 70], [-70, 70]],
        },
    }

    def __init__(self):
        """初始化各摄像头的单应性矩阵（使用默认标定参数）"""
        # 各摄像头单应性矩阵 {camera_id: H(3x3)}
        self._homographies = {}
        # 保存标定点用于后续重标定
        self._calib_points = {}
        # 使用默认参数计算初始单应性矩阵
        for cam_id, calib in self.DEFAULT_CALIBRATION.items():
            img_pts = np.array(calib["img_pts"], dtype=np.float32)
            world_pts = np.array(calib["world_pts"], dtype=np.float32)
            H = self._calc_homography(img_pts, world_pts)
            self._homographies[cam_id] = H
            self._calib_points[cam_id] = (calib["img_pts"], calib["world_pts"])

    @staticmethod
    def _calc_homography(img_pts, world_pts):
        """
        使用 cv2.findHomography 计算从像素平面到场景平面的单应性矩阵

        Args:
            img_pts: 像素坐标点列表 (N, 2)
            world_pts: 场景坐标点列表 (N, 2)，仅使用 (X, Z)

        Returns:
            3x3 单应性矩阵
        """
        img_pts = np.array(img_pts, dtype=np.float32)
        world_pts = np.array(world_pts, dtype=np.float32)
        H, _ = cv2.findHomography(img_pts, world_pts)
        return H

    def map(self, pixel_xy, camera_id):
        """
        将像素坐标映射到3D场景坐标 (X, Z)

        Args:
            pixel_xy: 像素坐标 [u, v]
            camera_id: 摄像头标识

        Returns:
            tuple (X, Z) 场景坐标；若未标定且无可用矩阵返回 (0.0, 0.0)
        """
        H = self._homographies.get(camera_id)
        if H is None:
            # 未标定则回退到第一个可用摄像头
            if not self._homographies:
                return (0.0, 0.0)
            cam = next(iter(self._homographies))
            H = self._homographies[cam]

        u, v = float(pixel_xy[0]), float(pixel_xy[1])
        # 齐次坐标变换
        src = np.array([u, v, 1.0], dtype=np.float64)
        dst = H @ src
        if abs(dst[2]) < 1e-9:
            return (0.0, 0.0)
        X = dst[0] / dst[2]
        Z = dst[1] / dst[2]
        return (float(X), float(Z))

    def calibrate(self, camera_id, img_pts, world_pts):
        """
        重新标定指定摄像头

        Args:
            camera_id: 摄像头标识
            img_pts: 像素坐标点列表 (N, 2)
            world_pts: 场景坐标点列表 (N, 2)

        Returns:
            3x3 单应性矩阵
        """
        H = self._calc_homography(img_pts, world_pts)
        self._homographies[camera_id] = H
        self._calib_points[camera_id] = (list(img_pts), list(world_pts))
        return H

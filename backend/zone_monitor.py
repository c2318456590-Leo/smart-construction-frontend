"""
区域入侵检测模块
根据危险区域多边形定义检测人员是否进入危险区域
"""
import json
from shapely.geometry import Point, Polygon


class ZoneMonitor:
    """危险区域入侵监测器"""

    def __init__(self, config_path):
        """
        从 JSON 配置文件加载危险区域多边形定义

        Args:
            config_path: zones.json 文件路径
        """
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)

        # 构建 {区域id: (区域名, Polygon)} 映射
        self._zones = {}
        for zone in config.get("danger_zones", []):
            polygon = Polygon(zone["polygon"])
            # 修正无效多边形
            if not polygon.is_valid:
                polygon = polygon.buffer(0)
            self._zones[zone["id"]] = (zone["name"], polygon)

    def check(self, x, z):
        """
        检查坐标 (x, z) 是否落在任何危险区域内

        Args:
            x: 场景 X 坐标
            z: 场景 Z 坐标

        Returns:
            str or None: 命中区域名称，未命中返回 None
        """
        point = Point(x, z)
        for zone_id, (name, polygon) in self._zones.items():
            if polygon.contains(point) or polygon.touches(point):
                return name
        return None

    def get_zones(self):
        """返回所有危险区域定义（用于 API 返回）"""
        result = []
        for zone_id, (name, polygon) in self._zones.items():
            # 取多边形顶点（不重复首尾点）
            coords = list(polygon.exterior.coords)[:-1]
            result.append({
                "id": zone_id,
                "name": name,
                "polygon": [[p[0], p[1]] for p in coords],
            })
        return result

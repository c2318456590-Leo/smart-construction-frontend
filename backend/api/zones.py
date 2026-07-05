"""
危险区域路由。
本次修改：从 app.py 拆出 /api/zones，并保持 zones.json 为危险区域权威来源。
"""
import json

from fastapi import APIRouter

from services.model_loader import ZONES_CONFIG_PATH, get_state


router = APIRouter()


@router.get("/api/zones")
async def get_zones():
    """获取危险区域定义。"""
    runtime = get_state()
    if runtime.zone_monitor:
        return {"danger_zones": runtime.zone_monitor.get_zones()}
    try:
        with open(ZONES_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"danger_zones": []}

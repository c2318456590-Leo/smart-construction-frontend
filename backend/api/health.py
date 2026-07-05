"""
健康检查路由。
本次修改：从 app.py 拆出 /api/health。
"""
from fastapi import APIRouter

from services.model_loader import get_state


router = APIRouter()


@router.get("/api/health")
async def health():
    """健康检查端点。"""
    runtime = get_state()
    return {
        "status": "ok",
        "mock_mode": runtime.mock_mode,
        "helmet_detector_loaded": runtime.helmet_detector is not None,
        "fire_smoke_detector_loaded": runtime.fire_smoke_detector is not None,
        "fall_detector_loaded": runtime.fall_detector is not None,
    }

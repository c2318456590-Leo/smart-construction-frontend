"""
视频源路由。
本次修改：从 app.py 拆出 /api/videos、/api/videos/add 和 /api/videos/remove。
"""
from fastapi import APIRouter, Query

from services.model_loader import get_state


router = APIRouter()


@router.get("/api/videos")
async def list_videos():
    """列出当前所有视频源。"""
    runtime = get_state()
    sources = list(runtime.video_manager.list_sources()) if runtime.video_manager else []
    return {"sources": sources, "count": len(sources)}


@router.post("/api/videos/add")
async def add_video(camera_id: int = Query(1), source: str = Query(...)):
    """添加视频源：支持文件路径、RTSP 地址、摄像头索引。"""
    runtime = get_state()
    if not runtime.video_manager:
        return {"success": False, "error": "VideoSourceManager not initialized"}
    success = runtime.video_manager.add_source(camera_id, source)
    return {"success": success, "camera_id": camera_id, "source": source}


@router.post("/api/videos/remove")
async def remove_video(camera_id: int = Query(1)):
    """移除指定视频源。"""
    runtime = get_state()
    if not runtime.video_manager:
        return {"success": False, "error": "VideoSourceManager not initialized"}
    success = runtime.video_manager.remove_source(camera_id)
    return {"success": success, "camera_id": camera_id}

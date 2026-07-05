"""
WebSocket 推流端点。
本次修改：从 app.py 拆出 /ws 端点，保留 event、track、video_frame 推送协议。
"""
import asyncio

from fastapi import WebSocket, WebSocketDisconnect

from services.detection_pipeline import process_real_frame
from services.frame_codec import encode_frame_to_jpeg
from services.mock_stream import gen_mock_data, gen_mock_frame
from services.model_loader import get_state


async def websocket_endpoint(ws: WebSocket):
    """WebSocket 端点：实时推送事件、轨迹与视频帧。"""
    await ws.accept()
    cam_param = ws.query_params.get("camera_id", "1")
    try:
        camera_id = int(cam_param)
    except (TypeError, ValueError):
        camera_id = 1

    try:
        while True:
            runtime = get_state()
            if runtime.mock_mode:
                events, track_msg = gen_mock_data(camera_id, runtime.zone_monitor)
                frame = gen_mock_frame(camera_id)
                b64 = encode_frame_to_jpeg(frame)
            else:
                frame = runtime.video_manager.read_frame(camera_id) if runtime.video_manager else None
                if frame is None:
                    events, track_msg = gen_mock_data(camera_id, runtime.zone_monitor)
                    frame = gen_mock_frame(camera_id)
                    b64 = encode_frame_to_jpeg(frame)
                else:
                    events, track_msg, annotated = process_real_frame(frame, camera_id, runtime)
                    b64 = encode_frame_to_jpeg(annotated)

            for event in events:
                await ws.send_json(event)
            await ws.send_json(track_msg)
            if b64:
                await ws.send_json({
                    "type": "video_frame",
                    "camera_id": camera_id,
                    "frame": b64,
                })
            await asyncio.sleep(1.0 / 15)
    except WebSocketDisconnect:
        print("[信息] WebSocket 客户端断开连接")
    except Exception as exc:
        print(f"[错误] WebSocket 异常: {exc}")

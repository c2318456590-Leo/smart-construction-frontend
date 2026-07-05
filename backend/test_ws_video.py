# -*- coding: utf-8 -*-
"""测试 WebSocket 是否持续推送视频帧"""
import asyncio
import websockets
import json

async def test():
    uri = "ws://localhost:8000/ws?camera_id=1"
    print(f"连接 {uri} ...")
    async with websockets.connect(uri) as ws:
        frame_count = 0
        event_count = 0
        track_count = 0
        try:
            for _ in range(60):  # 约4秒
                msg = await asyncio.wait_for(ws.recv(), timeout=5)
                data = json.loads(msg)
                t = data.get("type", "")
                if t == "video_frame":
                    frame_count += 1
                    if frame_count <= 3:
                        print(f"  视频帧 #{frame_count}: base64长度={len(data.get('frame',''))}")
                elif t == "event":
                    event_count += 1
                    if event_count <= 3:
                        print(f"  报警事件: {data}")
                elif t == "track":
                    track_count += 1
                    if track_count <= 2:
                        print(f"  轨迹: {data}")
        except asyncio.TimeoutError:
            print("等待消息超时")
        print(f"\n统计: 视频帧={frame_count} 报警={event_count} 轨迹={track_count}")

asyncio.run(test())

"""
视频帧编码服务。
本次修改：从 app.py 拆出 JPEG/base64 编码逻辑。
"""
import base64

import cv2


def encode_frame_to_jpeg(frame):
    """将 BGR 帧编码为 base64 JPEG 字符串。"""
    try:
        ret, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        if not ret:
            return None
        b64 = base64.b64encode(buf.tobytes()).decode("utf-8")
        return f"data:image/jpeg;base64,{b64}"
    except Exception:
        return None

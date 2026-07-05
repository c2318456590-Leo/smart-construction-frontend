import requests

BASE = "http://localhost:8000"

video_path = r"C:\Users\23184\Desktop\web（智慧工地前端）\data\videos\28531297319-1-100026.mp4"

# 添加视频源
r = requests.post(f"{BASE}/api/videos/add", params={"camera_id": 1, "source": video_path})
print("添加视频源:", r.json())

# 列出视频源
r = requests.get(f"{BASE}/api/videos")
print("视频源列表:", r.json())

# 健康检查
r = requests.get(f"{BASE}/api/health")
print("健康检查:", r.json())

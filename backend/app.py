"""
智慧工地安全监测后端入口。
本次修改：拆分 HTTP 路由、WebSocket、模型加载、检测流水线、模拟数据与帧编码逻辑；
app.py 仅负责创建 FastAPI 应用、注册路由和管理生命周期。
"""
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

from api.health import router as health_router
from api.videos import router as videos_router
from api.zones import router as zones_router
from services.model_loader import init_components, shutdown_components
from ws import websocket_endpoint


@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期：启动时初始化组件，关闭时释放资源。"""
    init_components()
    yield
    shutdown_components()


app = FastAPI(title="智慧工地安全监测后端", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(zones_router)
app.include_router(videos_router)
app.websocket("/ws")(websocket_endpoint)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)

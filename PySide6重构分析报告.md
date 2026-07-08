# 智慧工地数字孪生平台 Qt6 / PySide6 重构分析报告

> 生成时间：2026-07-07
> 检查目录：`f:\ZJD\文档\机器视觉\实习\web（智慧工地前端）`
> 目标：完整梳理后端与前端现状、问题，给出 PySide6 / Qt6 重构方案，尽量复用后端代码。
> 约束：本报告不修改任何代码。

---

## 0. 总览结论

- **后端整体可复用度高**。`detector.py` / `pose_analyzer.py` / `zone_monitor.py` / `coord_mapper.py` / `video_source.py` 与 FastAPI 解耦干净，可被 PySide6 直接 `import` 使用，无需 HTTP/WebSocket 中转。
- **真正需要重写的是前端**。Three.js、ECharts、HTML/CSS、Import Map 在桌面端没有直接对应，必须用 Qt3D / QtCharts / QSS / Python 模块重新实现。
- **通信层可大幅简化**。桌面应用中 `ws.py` 与 `api/*.py` 可改为 Qt 信号槽直接调用，删除 base64 JPEG 编码开销，直接把 `numpy.ndarray` 帧交给 Qt 显示。
- **后端主要风险**：硬编码路径、宽泛 `except`、`Optional[object]` 类型注解含糊、`mock_stream` 的全局可变状态。
- **前端主要风险**：UIManager 职责过载、ECharts 强依赖外网 CDN、视频帧 base64 解码占用主线程、报警特效与场景渲染耦合在 Three.js 中无法平移到 Qt3D。
- **推荐方案**：保留 `backend/` 中所有算法模块原样，新增 `qt_app/` 目录承载 PySide6 应用，通过 QThread + 信号槽驱动 `detection_pipeline`。3D 渲染优先用 QtQuick3D（QML + Python 交互），其次考虑 pyqtgraph.opengl。

---

## 1. 后端文件清单与职责

### 1.1 核心算法与运行时

| 文件 | 行数 | 主要类/函数 | 职责 |
|------|------|-------------|------|
| [backend/app.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/app.py) | ~50 | `lifespan`、`app` | FastAPI 入口，注册路由与 WebSocket |
| [backend/ws.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/ws.py) | ~54 | `websocket_endpoint` | WS 推流循环，每秒 15 帧推送 event/track/video_frame |
| [backend/detector.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/detector.py) | ~127 | `SafetyDetector`、`CLASS_COLORS`、`HELMET_CLASS_NAMES`、`FIRE_SMOKE_CLASS_NAMES` | YOLOv8 目标检测封装 + 检测框绘制 |
| [backend/pose_analyzer.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/pose_analyzer.py) | ~175 | `FallDetector` | YOLOv8-Pose 跌倒检测：17 关键点 → 躯干角度 + 宽高比 + 持续帧确认 |
| [backend/zone_monitor.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/zone_monitor.py) | ~59 | `ZoneMonitor` | 基于 Shapely 的多边形入侵检测 |
| [backend/video_source.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/video_source.py) | ~94 | `VideoSourceManager` | cv2.VideoCapture 多路视频源管理 + 文件循环播放 |
| [backend/coord_mapper.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/coord_mapper.py) | ~104 | `CoordMapper`、`DEFAULT_CALIBRATION` | 像素→3D 场景坐标的单应性矩阵映射 |

### 1.2 服务层（拆分后的模块）

| 文件 | 行数 | 主要函数 | 职责 |
|------|------|---------|------|
| [backend/services/model_loader.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/services/model_loader.py) | ~172 | `RuntimeState`、`init_components`、`load_model_config`、`resolve_model_path`、`_load_safety_detector`、`_load_fall_detector` | 模型加载、运行时状态、mock 模式判定 |
| [backend/services/detection_pipeline.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/services/detection_pipeline.py) | ~103 | `process_real_frame`、`run_all_detectors`、`build_track_message`、`has_equip` | 单帧检测流水线串联 |
| [backend/services/frame_codec.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/services/frame_codec.py) | ~19 | `encode_frame_to_jpeg` | BGR → JPEG → base64 编码 |
| [backend/services/mock_stream.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/services/mock_stream.py) | ~78 | `gen_mock_data`、`gen_mock_frame`、`_event` | 模型缺失时的模拟数据与占位帧 |

### 1.3 HTTP 路由层

| 文件 | 行数 | 端点 | 职责 |
|------|------|------|------|
| [backend/api/health.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/api/health.py) | ~24 | `GET /api/health` | 返回模型加载状态与 mock_mode |
| [backend/api/videos.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/api/videos.py) | ~38 | `GET /api/videos`、`POST /api/videos/add`、`POST /api/videos/remove` | 视频源增删查 |
| [backend/api/zones.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/api/zones.py) | ~24 | `GET /api/zones` | 返回 zones.json 危险区域定义 |

### 1.4 配置

| 文件 | 内容 |
|------|------|
| [backend/configs/model_config.yaml](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/configs/model_config.yaml) | 模型路径、推理参数、跌倒阈值 |
| [backend/configs/zones.json](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/configs/zones.json) | 3 个危险区域多边形（tower_crane / building_edge / material_storage） |
| [backend/requirements.txt](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/requirements.txt) | ultralytics / opencv / fastapi / uvicorn / websockets / shapely / numpy / Pillow / PyYAML |

### 1.5 数据集脚本（与运行时无关，重构可忽略）

`download_dataset.py`、`download_multi.py`、`download_roboflow.py`、`convert_fall_dataset.py`、`convert_fire_smoke_dataset.py`、`test_*.py`。这些脚本存在硬编码路径与 Roboflow API Key 暴露问题（详见第 7 节），但不影响 PySide6 重构。

---

## 2. 前端文件清单与职责

### 2.1 入口与配置

| 文件 | 行数 | 职责 |
|------|------|------|
| [index.html](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/index.html) | ~135 | Import Map + 加载动画 + canvas + label 样式 |
| [src/App.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/App.js) | ~570 | 主入口：编排 UI / 场景 / 管理器 / WS / 演示模式 / 默认摄像头连接 |
| [src/config/Config.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/config/Config.js) | ~396 | 全局配置：颜色 / 场景 / 相机 / 渲染 / 主题 / 光照 / 建筑 / 塔吊 / 危险区域 / 摄像头 / 报警 / 雷达 / WS / API / 图表 |

### 2.2 3D 场景层

| 文件 | 行数 | 主要导出 | 职责 |
|------|------|---------|------|
| [src/scene/SceneManager.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/scene/SceneManager.js) | ~687 | `SceneManager` | renderer + scene + camera + OrbitControls + EffectComposer + Bloom + FXAA + 6 盏探照灯 + 昼夜主题过渡 |
| [src/models/Models.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/models/Models.js) | 多函数 | `createSiteGround` / `createBuilding` / `createCrane` / `createDangerZone` / `createPerimeterWall` / `createGate` / `createCameraModel` / `createWorkerMesh` | 8 个 3D 模型工厂（PBR 材质） |

### 2.3 管理器层

| 文件 | 行数 | 主要类 | 职责 |
|------|------|-------|------|
| [src/managers/CameraManager.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/managers/CameraManager.js) | ~522 | `CameraManager` | 4 个摄像头模型 + HTML 标签 + 飞行 lerp + 视锥透明度 + 报警闪烁 |
| [src/managers/WorkerManager.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/managers/WorkerManager.js) | ~125 | `WorkerManager` | 工人模型增删 + 朝向旋转 + 安全帽颜色切换 |
| [src/managers/AlertManager.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/managers/AlertManager.js) | ~295 | `AlertManager` | 发光柱 + Pulse Ring + 地面光圈 + HTML 浮动标签 + 节流去重 |
| [src/managers/WSManager.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/managers/WSManager.js) | ~227 | `WSManager` | WebSocket + 自动重连 + 事件分发 |

### 2.4 UI 层

| 文件 | 行数 | 主要类/函数 | 职责 |
|------|------|------------|------|
| [src/ui/UIManager.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/UIManager.js) | ~266 | `UIManager` | 编排 4 大面板 + 视频帧 + 状态指示 + 风险等级 + 数字滚动 |
| [src/ui/ChartManager.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/ChartManager.js) | ~457 | `ChartManager` | ECharts CDN 加载 + 5 个图表（报警/人员/佩戴率/FPS/延迟） |
| [src/ui/uiApi.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/uiApi.js) | ~18 | `addVideoSource`、`removeVideoSource` | 视频源 REST 调用封装 |
| [src/ui/styles.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/styles.js) | - | `injectUIStyles` | 深蓝科技风 + 玻璃拟态 CSS 注入 |
| [src/ui/components/TopBar.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/components/TopBar.js) | - | `TopBar` | 顶部状态栏 + 演示模式开关 |
| [src/ui/components/StatsPanel.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/components/StatsPanel.js) | - | `StatsPanel` | 左侧统计面板 |
| [src/ui/components/VideoPanel.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/components/VideoPanel.js) | - | `VideoPanel` | 右侧摄像头列表 + 视频源导入 + 视频画面 |
| [src/ui/components/EventPanel.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/components/EventPanel.js) | - | `EventPanel` | 事件流列表 |
| [src/ui/components/BottomPanel.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/components/BottomPanel.js) | - | `BottomPanel` | 底部图表面板 |
| [src/ui/components/ThemeSwitch.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/components/ThemeSwitch.js) | - | `ThemeSwitch` | 昼夜开关 |
| [src/ui/components/helpers.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/components/helpers.js) | - | `setText` 等 | DOM 工具函数 |

### 2.5 第三方库

| 文件 | 说明 |
|------|------|
| [libs/three.module.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/libs/three.module.js) | Three.js v0.157 本地副本 |
| [libs/OrbitControls.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/libs/OrbitControls.js) | 轨道控制器（备用，实际从 CDN 引入） |

---

## 3. 后端架构总览

### 3.1 启动流程

```
app.py
  └── lifespan → init_components()
        ├── load_model_config()       读取 model_config.yaml
        ├── CoordMapper()              默认 4 点标定
        ├── ZoneMonitor(zones.json)    Shapely 多边形
        ├── VideoSourceManager()       空 video_manager
        ├── _load_safety_detector(helmet)        SafetyDetector(helmet_detect.pt)
        ├── _load_safety_detector(fire_smoke)   SafetyDetector(fire_smoke_detect.pt)
        └── _load_fall_detector(pose)           FallDetector(yolov8n-pose.pt)
                                              ↓
                                任一加载成功 → 正常模式
                                全部失败    → mock_mode=True
```

### 3.2 检测流水线（`services/detection_pipeline.py`）

```
process_real_frame(frame, camera_id, runtime_state)
  ├── run_all_detectors(frame)
  │     ├── helmet_detector.detect(frame)       返回 [{cls, confidence, bbox, bbox_center}]
  │     └── fire_smoke_detector.detect(frame)  返回同上，合并
  │
  ├── fall_detector.detect_persons(frame)        YOLOv8-Pose 人员框
  │
  ├── 遍历 persons：
  │     ├── coord_mapper.map([cx,cy], camera_id)  像素 → (X, Z)
  │     ├── zone_monitor.check(X, Z)              → intrusion 事件
  │     └── fall_detector.check_fall(frame, bbox, person_id)
  │                                                  → fall 事件（持续 15 帧）
  │
  ├── 遍历 detections：
  │     └── cls ∈ {no_helmet, smoke, fire} → 对应事件
  │
  ├── build_track_message(persons, detections, camera_id, coord_mapper)
  │     返回 {type:"track", workers:[{id, x, z, helmet}]}
  │
  └── helmet_detector.draw_results(frame, detections) → 标注帧
```

### 3.3 WebSocket 推流（`ws.py`）

```python
while True:
    if mock_mode:
        events, track_msg = gen_mock_data(...)
        frame = gen_mock_frame(...)
    else:
        frame = video_manager.read_frame(camera_id)
        if frame is None:
            # 回退到 mock
        else:
            events, track_msg, annotated = process_real_frame(...)
    for event in events:    await ws.send_json(event)
    await ws.send_json(track_msg)
    await ws.send_json({"type":"video_frame", "camera_id":..., "frame":base64_jpeg})
    await asyncio.sleep(1/15)   # 15 FPS
```

### 3.4 坐标映射约定

`CoordMapper.DEFAULT_CALIBRATION`（`coord_mapper.py:15-27`）为 cam1 / cam2 硬编码 4 点标定，场景坐标范围 `[-100, 100]`。cam3 / cam4 未标定时回退到 cam1 的矩阵。

### 3.5 危险区域数据结构（`zones.json`）

```json
{
  "danger_zones": [
    {"name":"塔吊作业区","id":"tower_crane","polygon":[[-40,-40],[-10,-40],[-10,-10],[-40,-10]]},
    {"name":"临边防护区","id":"building_edge","polygon":[[10,-20],[50,-20],[50,-5],[10,-5]]},
    {"name":"材料堆放区","id":"material_storage","polygon":[[-30,40],[-5,40],[-5,60],[-30,60]]}
  ]
}
```

### 3.6 mock 模式回退

`mock_stream.py` 维护全局可变状态 `_mock_t`，生成 3 个绕圆运动的模拟工人，20% 概率随机产生 smoke/fire 事件。模型缺失时由 `ws.py` 调用。

---

## 4. 前后端通信协议详细分析

### 4.1 HTTP 接口

| 方法 | 路径 | 入参 | 返回 |
|------|------|------|------|
| GET | `/api/health` | 无 | `{status, mock_mode, helmet_detector_loaded, fire_smoke_detector_loaded, fall_detector_loaded}` |
| GET | `/api/zones` | 无 | `{danger_zones:[{id,name,polygon}]}` |
| GET | `/api/videos` | 无 | `{sources:[(cam_id, source)], count}` |
| POST | `/api/videos/add` | `camera_id:int, source:str` | `{success, camera_id, source}` |
| POST | `/api/videos/remove` | `camera_id:int` | `{success, camera_id}` |

### 4.2 WebSocket 消息协议

连接：`ws://localhost:8000/ws?camera_id=N`

| type | 字段 | 触发场景 |
|------|------|---------|
| `event` | `x, z, event, camera_id, confidence` | no_helmet / smoke / fire / intrusion / fall |
| `track` | `workers:[{id, x, z, helmet}]` | 每帧推送人员轨迹 |
| `video_frame` | `camera_id, frame(base64 JPEG)` | 每帧推送视频画面 |
| `alert_from_camera` | `camera_id, alert_type` | 跨摄像头报警（当前后端未发送，前端已实现监听） |

### 4.3 视频帧编码

`encode_frame_to_jpeg(frame)`（`frame_codec.py:10`）：BGR → `cv2.imencode('.jpg', quality=70)` → `base64.b64encode` → `data:image/jpeg;base64,...`。在 PySide6 中此步骤**完全可删除**，直接把 `numpy.ndarray` 转 `QImage` 即可。

### 4.4 前端 fallback 行为

| 场景 | 前端行为 |
|------|---------|
| `/api/zones` 请求失败 | 使用 `CONFIG.dangerZones`（`App.js:502-515`） |
| WS 断开 | 3 秒自动重连（`WSManager._scheduleReconnect`） |
| 演示模式 | `_startDemo` 断开 WS，本地生成 3 个模拟工人 + 6~9 秒一次报警 |
| 默认启动 | 自动连接 cam1，8 秒未收到首帧显示"视频连接超时" |

### 4.5 重构时的协议复用判断

| 协议元素 | 是否保留 | 备注 |
|---------|---------|------|
| event 字段结构 | **保留** | 直接作为 Qt 信号 payload |
| track workers 结构 | **保留** | 同上 |
| video_frame base64 | **删除** | 改为 `np.ndarray` 直接传给 `QLabel.setPixmap` |
| HTTP `/api/health` | **改写** | 改为直接调用 `model_loader.get_state()` |
| HTTP `/api/videos` | **改写** | 改为直接调用 `video_manager.list_sources()` |
| HTTP `/api/zones` | **改写** | 改为直接调用 `zone_monitor.get_zones()` |
| WebSocket | **删除** | Qt 信号槽替代 |

---

## 5. 后端代码质量问题

> 依据 `AGENTS.md` 中的代码质量强制要求逐条检查。

### 5.1 类型注解缺失

| 文件 | 问题 |
|------|------|
| `ws.py:15` | `websocket_endpoint(ws: WebSocket)` 无返回类型注解 |
| `detector.py:23-122` | `SafetyDetector.__init__` 参数无 `str`/`float` 注解；`detect` 返回 `list[dict]` 应改为 `list[Detection]` 自定义类型 |
| `pose_analyzer.py:9-175` | `FallDetector` 全部方法缺参数与返回类型注解；`keypoints` 标注为 `np.ndarray` 但实际可能为 `None` |
| `zone_monitor.py:9` | `ZoneMonitor.__init__(config_path: str)` 缺返回值；`check(x, z)` 缺 `float` 注解 |
| `video_source.py:8-94` | `VideoSourceManager` 全部方法缺类型注解；`add_source` 返回应为 `bool` 而非隐式 |
| `coord_mapper.py` | `map` 返回 `tuple[float, float]`，`calibrate` 返回 `np.ndarray`，均未声明 |
| `services/detection_pipeline.py` | 4 个函数全部缺类型注解，`runtime_state` 应为 `RuntimeState` 而非隐式 |
| `services/model_loader.py:15-25` | `RuntimeState` 字段类型为 `Optional[object]`，应改为具体类型 `Optional[SafetyDetector]` / `Optional[FallDetector]` 等 |
| `services/mock_stream.py` | `gen_mock_data` 返回 `tuple[list[dict], dict]`，未声明 |
| `services/frame_codec.py` | `encode_frame_to_jpeg` 返回 `Optional[str]`，未声明 |

### 5.2 Google 风格 docstring 不完整

- `ws.py:16` 仅有简短一行说明，缺 Args / Returns / Raises。
- `detection_pipeline.py` 全部函数仅有单行中文注释。
- `model_loader.py:73` `init_components` 无 docstring 说明 mock 触发条件。
- `frame_codec.py:11` docstring 缺 Args 与 Returns。
- `mock_stream.py:20` 缺 Args / Returns。
- `pose_analyzer.py:170` `reset` 缺 docstring。

### 5.3 硬编码路径与常量

| 位置 | 内容 | 建议 |
|------|------|------|
| `model_loader.py:10-12` | `ZONES_CONFIG_PATH` 与 `MODEL_CONFIG_PATH` 基于 `BASE_DIR`，但 `BASE_DIR` 是 `backend/` 的父目录，与实际不符（实际 `configs/` 在 `backend/configs/`） | 改为 `os.path.join(BASE_DIR, 'backend', 'configs', ...)` 或修正 `BASE_DIR` 定义 |
| `coord_mapper.py:15-27` | `DEFAULT_CALIBRATION` 摄像头标定点硬编码 | 抽取为独立 `calibration.json` 配置 |
| `pose_analyzer.py:13` | COCO 关键点索引 5/6/11/12 硬编码为注释 | 定义为模块级常量 `LEFT_SHOULDER_IDX = 5` 等 |
| `ws.py:50` | `1.0 / 15` 推流帧率硬编码 | 提取为 `TARGET_FPS = 15` |
| `mock_stream.py:12-16` | `MOCK_WORKERS` 硬编码 3 个工人 | 可保留，但应说明用途 |
| `detection_pipeline.py:84` | `("no_helmet", "smoke", "fire")` 报警类别硬编码 | 提取为 `ALERT_CLASSES` 常量 |

### 5.4 异常处理不完整或过宽

| 位置 | 问题 |
|------|------|
| `model_loader.py:59` | `except Exception as exc` 捕获所有异常，包括 `KeyboardInterrupt`，会把真正的 bug 吃掉只打印警告 |
| `model_loader.py:151` / `:170` | 同上，模型加载异常被宽泛捕获，仅返回 `None` |
| `frame_codec.py:18` | `except Exception` 静默吞掉编码异常，调用方无法感知 |
| `ws.py:53` | `except Exception as exc` 仅打印日志，不区分网络异常与代码 bug |
| `video_source.py:31` | `cv2.VideoCapture(source)` 失败仅返回 `False`，不区分"路径错误"与"摄像头被占用" |
| `zone_monitor.py:19` | `open(config_path)` 未做 `FileNotFoundError` 处理 |
| `pose_analyzer.py:106` | `self.model(...)` 未处理模型推理失败（OOM / 输入尺寸异常） |

### 5.5 函数过长与嵌套

- `ws.py:15-54` `websocket_endpoint` 含 mock/真实分支、事件循环、编码、推送，应拆为 `_decide_frame_source` / `_send_messages` 两步。
- `detection_pipeline.py:44-103` `process_real_frame` 103 行，同时处理 person 遍历、event 生成、track 构建、标注绘制，应拆分为 `_process_persons` / `_process_detections` / `_build_annotated_frame`。
- `mock_stream.py:20-54` `gen_mock_data` 同时处理轨迹、事件、随机报警，可拆分。
- `model_loader.py:73-122` `init_components` 50 行串行加载 3 个模型，可提取 `_load_all_detectors` 辅助函数。

### 5.6 命名与风格不统一

- `detector.py:23` 类名 `SafetyDetector` 与文件名 `detector.py` 不一致；后端注释中混用 `Detector`。
- `pose_analyzer.py` 文件名是 `pose_analyzer`，类名是 `FallDetector`，导出与命名错位。
- `detection_pipeline.py` 模块级函数式风格，`model_loader.py` 也是函数式，但 `detector.py` / `zone_monitor.py` 是类风格，整体不统一。
- `mock_stream.py:17` 模块级全局可变状态 `_mock_t`，难以并发安全。

### 5.7 数据集脚本问题（不影响重构，但需修复）

- `download_roboflow.py`、`download_multi.py`：API Key 写死在源码中。
- `convert_fall_dataset.py`：硬编码 `C:\Users\23184\Desktop\行人跌倒检测`。
- `convert_fire_smoke_dataset.py`：原始 VOC 路径硬编码。
- `data/*_yolo/dataset.yaml`：`path` 仍指向旧电脑 `C:/Users/23184/Desktop/...`。

---

## 6. 前端代码质量问题

### 6.1 UIManager 职责过载

[src/ui/UIManager.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/UIManager.js) 同时负责：

1. 4 大面板创建与编排
2. 视频帧显示与状态文案
3. WebSocket 连接状态指示
4. AI 运行状态指示
5. FPS / 延迟显示
6. 报警事件列表渲染
7. 风险等级计算与进度条
8. 数字滚动动画
9. 实时时钟
10. 事件分发（`_emit`）

应拆分为 `VideoController` / `AlertListController` / `StatusController` 三个独立控制器。

### 6.2 魔法数字与硬编码

| 位置 | 内容 |
|------|------|
| `App.js:26-27` | `DEFAULT_STARTUP_CAMERA_ID = 1`、`STARTUP_VIDEO_TIMEOUT_MS = 8000` 已提取，但 `CAMERA_SWITCH_CONNECT_DELAY_MS = 500` 应移入 `Config.js` |
| `App.js:386-409` | 演示模式 1.5 秒间隔、4~6 次触发报警的硬编码逻辑 |
| `App.js:482-485` | `helmetRate` 计算公式 `Math.max(60, 100 - no_helmet*5)` 与 `95 + Math.random()*5` 硬编码 |
| `AlertManager.js:23-24` | `_throttleMs = 3000`、`_moveThreshold = 8` 应进 Config |
| `CameraManager.js:267` | `Math.floor(phase / 400) % 2` 闪烁频率硬编码 |
| `CameraManager.js:262` | 报警闪烁持续 3000ms 硬编码 |
| `ChartManager.js:68-74` | ECharts CDN URL 列表硬编码在源码中 |

### 6.3 ECharts 强依赖外网 CDN

[ChartManager.js:60-105](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/ui/ChartManager.js) 动态加载 5 个 CDN 源，任意一个失败都会尝试下一个。**离线环境完全无法工作**。PySide6 重构应直接换为 `QtCharts` 或 `pyqtgraph`，无需任何外部依赖。

### 6.4 视频帧 base64 解码占用主线程

`WSManager.onmessage` → `JSON.parse` → `data.frame` base64 字符串 → `<img src="data:image/jpeg;base64,...">`。每帧 ~50KB base64 字符串解析在主线程进行，15 FPS 下占用可观。重构后 `numpy.ndarray → QImage → QPixmap` 直接零拷贝传递。

### 6.5 报警特效与 Three.js 深度耦合

[AlertManager.js](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/src/managers/AlertManager.js) 中发光柱 / Pulse Ring / 地面光圈都依赖 `THREE.CylinderGeometry` / `RingGeometry` / `CircleGeometry`，且 HTML 浮动标签通过 `Vector3.project(camera)` 投影到屏幕坐标。这部分在 Qt3D 中**没有等价 API**，必须用 QML 粒子系统或自绘 QQuickItem 重写。

### 6.6 重复代码

- `CameraManager._clampCameraView`（`CameraManager.js:340`）与 `SceneManager._clampCameraView`（`SceneManager.js:656`）逻辑几乎一致，应抽取为公共工具。
- `App._connectDefaultCamera` 与 `App._bindUI` 中的 WS 重连逻辑有重复。
- `App._clearStartupVideoTimer` / `_resetStartupVideoWait` / `_markStartupVideoReady` 三个方法职责接近，可合并为状态机。

### 6.7 错误处理不完善

- `WSManager._emit` 中 `try/catch` 仅 `console.error`，调用方无感知。
- `ChartManager._loadECharts` 全部 CDN 失败时仅 `console.error`，UI 不会显示错误提示。
- `App._init` 的 catch 块用 inline style 显示错误，未提供重试按钮。

### 6.8 与后端的协议散落各处

- `Config.js:357-372` 定义了 `ws.url` 与 `api.base`。
- `WSManager.js:55` 拼接 URL `${CONFIG.ws.url}?camera_id=${this.cameraId}`。
- `uiApi.js:9` 拼接 `${CONFIG.api.base}${CONFIG.api.endpoints.addVideo}?...`。
- `App.js:504` 直接拼接 `${CONFIG.api.base}${CONFIG.api.endpoints.zones}`。

重构时这些 URL 拼接逻辑全部删除。

---

## 7. PySide6 / Qt6 重构技术映射

### 7.1 3D 场景渲染

| 前端技术 | Qt6 对应方案 | 推荐度 |
|---------|-------------|--------|
| Three.js v0.157 + EffectComposer + UnrealBloom + FXAA | **QtQuick3D**（QML 内置后处理） | ⭐⭐⭐⭐⭐ |
| ↑ | Qt3D Framework（C++ 风格，Python 绑定完整） | ⭐⭐⭐⭐ |
| ↑ | pyqtgraph.opengl（轻量，但缺 EffectComposer） | ⭐⭐⭐ |
| ↑ | PySide6 + 嵌入 WebGL Three.js（用 QWebChannelView） | ⭐⭐ 不推荐 |

**推荐**：QtQuick3D。它原生支持 PBR 材质、阴影、EffectComposer 等价的 postprocessing 效果。PySide6 6.5+ 可直接 `import QtQuick3D`。

### 7.2 图表

| 前端技术 | Qt6 对应方案 | 推荐度 |
|---------|-------------|--------|
| ECharts 5.4.3（5 个实时折线图） | **QtCharts**（QChart + QLineSeries） | ⭐⭐⭐⭐⭐ |
| ↑ | pyqtgraph（性能更高，API 偏底层） | ⭐⭐⭐⭐ |
| ↑ | 嵌入 ECharts via QWebEngineView | ⭐⭐ 不推荐（依赖 Chromium） |

**推荐**：QtCharts。原生支持实时数据流、深色主题、动画。

### 7.3 WebSocket 通信

| 前端技术 | Qt6 对应方案 |
|---------|-------------|
| `WebSocket` + 自定义事件分发 | **直接删除**，改为 `from backend.services.detection_pipeline import process_real_frame` 直接调用 + Qt 信号槽 |

### 7.4 视频帧显示

| 前端技术 | Qt6 对应方案 |
|---------|-------------|
| `<img src="data:image/jpeg;base64,...">` | `QLabel.setPixmap(QPixmap.fromImage(QImage(frame.data, w, h, QImage.Format_BGR888)))` 直接零拷贝 |

### 7.5 UI 面板

| 前端技术 | Qt6 对应方案 |
|---------|-------------|
| 4 大浮动面板（顶/左/右/底） | `QMainWindow` + `QDockWidget` × 4 |
| 玻璃拟态 CSS | QSS `border-radius` + `background: rgba(...)` + QGraphicsDropShadowEffect |
| 加载动画 spinner | `QMovie` 或 `QPropertyAnimation` 旋转图标 |
| 数字滚动动画 | `QPropertyAnimation` 配合 `QLabel.setText` |

### 7.6 昼夜主题切换

| 前端技术 | Qt6 对应方案 |
|---------|-------------|
| `SceneManager.setTheme` + 1.2 秒 lerp 过渡 | QtQuick3D 场景环境光 / 雾色 `QPropertyAnimation` 插值；QSS 主题切换 |
| 6 盏探照灯 + 光束 / 光斑 / 灯头 | QtQuick3D `SpotLight` + 自定义 mesh |

### 7.7 摄像头飞行动画

| 前端技术 | Qt6 对应方案 |
|---------|-------------|
| `CameraManager.update` lerp + 速度上限钳制 | `QPropertyAnimation` 对 `camera.position` 插值 + `QVector3D` 距离判定 |
| OrbitControls | QtQuick3D `OrbitCamera` 或 `wasdController` |

### 7.8 报警特效

| 前端技术 | Qt6 对应方案 |
|---------|-------------|
| 发光柱 CylinderGeometry | QtQuick3D `Model` + `PrincipledMaterial.emissive` |
| Pulse Ring 扩散环 | QML `ParticleEmitter` 或自绘 `QQuickItem` |
| 地面光圈 | QtQuick3D `Model` 平面 + `OpacityMask` |
| HTML 浮动标签 3D→屏幕投影 | `QQuickItem` 在 `Viewport` 上叠加，`mapFrom3D` 投影 |

### 7.9 配置中心

| 前端技术 | Qt6 对应方案 |
|---------|-------------|
| `Config.js` 单文件导出 `CONFIG` 对象 | Python 模块 `qt_app/config.py`，定义 `@dataclass(frozen=True)` |

### 7.10 模块加载

| 前端技术 | Qt6 对应方案 |
|---------|-------------|
| Import Map + ES6 Modules | Python `import` |
| `archive/legacy/main.legacy.js` | 不迁移，归档参考 |

---

## 8. 后端复用策略

### 8.1 可 100% 直接复用的模块（与 FastAPI 完全解耦）

| 模块 | 复用方式 |
|------|---------|
| [detector.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/detector.py) | `from backend.detector import SafetyDetector` 直接调用 `.detect()` / `.draw_results()` |
| [pose_analyzer.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/pose_analyzer.py) | `from backend.pose_analyzer import FallDetector` 直接调用 `.detect_persons()` / `.check_fall()` |
| [zone_monitor.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/zone_monitor.py) | `from backend.zone_monitor import ZoneMonitor` 直接调用 `.check()` / `.get_zones()` |
| [coord_mapper.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/coord_mapper.py) | `from backend.coord_mapper import CoordMapper` 直接调用 `.map()` / `.calibrate()` |
| [video_source.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/video_source.py) | `from backend.video_source import VideoSourceManager` 直接调用 `.add_source()` / `.read_frame()` |

### 8.2 需要轻量适配的模块

| 模块 | 适配要点 |
|------|---------|
| [services/model_loader.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/services/model_loader.py) | `BASE_DIR` 计算需修正（当前指向项目根而非 `backend/`），调用 `init_components()` 即可 |
| [services/detection_pipeline.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/services/detection_pipeline.py) | `process_real_frame()` 是纯函数，可直接调用；建议补充 `RuntimeState` 类型注解 |
| [services/mock_stream.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/services/mock_stream.py) | 全局可变状态 `_mock_t` 改为 `MockStream` 类的实例字段，便于多实例 |
| [services/frame_codec.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/services/frame_codec.py) | PySide6 中**不再需要**，删除即可 |

### 8.3 应删除或废弃的模块

| 模块 | 原因 |
|------|------|
| [app.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/app.py) | FastAPI 入口，桌面应用不需要 |
| [ws.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/ws.py) | WebSocket 推流，Qt 信号槽替代 |
| [api/health.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/api/health.py) | HTTP 端点，直接调用 `get_state()` |
| [api/videos.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/api/videos.py) | 同上 |
| [api/zones.py](file:///f:/ZJD/文档/机器视觉/实习/web（智慧工地前端）/backend/api/zones.py) | 同上 |

> **注意**：建议**保留** `app.py` / `ws.py` / `api/*`，作为可选的"Web 服务模式"，方便未来需要远程访问时启用。重构时不修改它们，仅在 PySide6 应用中不引用即可。

### 8.4 配置文件复用

| 文件 | 复用方式 |
|------|---------|
| `backend/configs/model_config.yaml` | PySide6 应用启动时 `load_model_config()` 读取，路径通过 `model_loader.MODEL_CONFIG_PATH` |
| `backend/configs/zones.json` | `ZoneMonitor(ZONES_CONFIG_PATH)` 直接读取 |
| `backend/models/*.pt` | 模型权重原样保留 |

---

## 9. 推荐的 PySide6 项目结构

```
智慧工地数字孪生监控平台/
├── backend/                        # 后端原样保留，仅算法模块被 import
│   ├── detector.py                # ✓ 直接复用
│   ├── pose_analyzer.py           # ✓ 直接复用
│   ├── zone_monitor.py            # ✓ 直接复用
│   ├── coord_mapper.py             # ✓ 直接复用
│   ├── video_source.py            # ✓ 直接复用
│   ├── services/
│   │   ├── model_loader.py        # ✓ 直接复用（修正 BASE_DIR）
│   │   ├── detection_pipeline.py  # ✓ 直接复用
│   │   ├── mock_stream.py         # ✓ 直接复用（建议改为类）
│   │   └── frame_codec.py         # ✗ 不再使用
│   ├── configs/
│   │   ├── model_config.yaml     # ✓ 直接复用
│   │   └── zones.json            # ✓ 直接复用
│   ├── models/*.pt                # ✓ 直接复用
│   ├── app.py / ws.py / api/      # 保留但 PySide6 不引用
│   └── requirements.txt          # 移除 fastapi/uvicorn/websockets，新增 PySide6
│
├── qt_app/                        # 新增：PySide6 桌面应用
│   ├── __init__.py
│   ├── main.py                    # QApplication 入口
│   ├── config.py                  # 从 Config.js 迁移的全局配置（@dataclass）
│   │
│   ├── core/                      # 核心控制器
│   │   ├── __init__.py
│   │   ├── app_controller.py      # 主控制器：编排所有 manager
│   │   ├── detection_worker.py    # QThread 子类：循环调用 process_real_frame
│   │   └── signals.py             # 自定义 QObject 信号定义
│   │
│   ├── scene/                     # 3D 场景（QtQuick3D）
│   │   ├── __init__.py
│   │   ├── scene_manager.py       # 对应 SceneManager.js
│   │   ├── models.py              # 对应 Models.js（QML 模型工厂）
│   │   ├── camera_manager.py     # 对应 CameraManager.js
│   │   ├── worker_manager.py      # 对应 WorkerManager.js
│   │   └── alert_manager.py       # 对应 AlertManager.js
│   │
│   ├── ui/                        # 2D UI（QWidget / QSS）
│   │   ├── __init__.py
│   │   ├── main_window.py         # QMainWindow + 4 个 QDockWidget
│   │   ├── top_bar.py             # 顶部状态栏
│   │   ├── stats_panel.py         # 左侧统计面板
│   │   ├── video_panel.py         # 右侧视频面板
│   │   ├── event_panel.py         # 事件流
│   │   ├── bottom_panel.py        # 底部图表面板
│   │   ├── theme_switch.py        # 昼夜开关
│   │   ├── chart_manager.py       # QtCharts 替代 ECharts
│   │   └── styles.qss             # 玻璃拟态样式表
│   │
│   └── resources/                 # Qt 资源
│       ├── qml/                   # QML 文件（3D 场景定义）
│       │   ├── Main.qml
│       │   ├── Scene.qml
│       │   └── AlertEffect.qml
│       ├── icons/
│       └── qt_app.qrc
│
├── archive/                       # 旧前端归档
│   ├── legacy/
│   └── web_frontend/              # 移动现有 src/ index.html libs/ 到此
│
└── README.md
```

### 9.1 主线程与推理线程划分

```
主线程（Qt GUI 事件循环）
  ├── SceneManager.update()       每帧 60 FPS
  ├── ChartManager.refresh()       每 2 秒
  └── 接收 detection_worker 信号 → 更新 3D 场景与 UI
                                          ↑
                                   (signal/slot 跨线程安全)
                                          ↑
推理线程 (QThread)
  └── DetectionWorker.run()
        ├── video_manager.read_frame(cam_id)
        ├── process_real_frame(frame, cam_id, runtime_state)
        │     → events: list[dict]
        │     → track_msg: dict
        │     → annotated: np.ndarray
        ├── emit frame_ready(annotated)         → QLabel.setPixmap
        ├── emit events_ready(events)            → AlertManager.addAlert
        └── emit track_ready(track_msg)          → WorkerManager.update
        sleep(1/15)
```

### 9.2 信号定义示例

```python
# qt_app/core/signals.py
from PySide6.QtCore import QObject, Signal
from typing import List, Dict
import numpy as np

class DetectionSignals(QObject):
    frame_ready = Signal(np.ndarray)              # 标注后的视频帧
    events_ready = Signal(list)                   # 报警事件列表
    track_ready = Signal(dict)                    # 工人轨迹消息
    state_changed = Signal(dict)                  # 模型加载状态变化
    error_occurred = Signal(str)                  # 错误信息
```

---

## 10. 关键风险与注意事项

### 10.1 模型路径与工作目录

`model_loader.py:10` 中 `BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))` 指向**项目根目录**而非 `backend/`，但 `resolve_model_path` 中 `os.path.join(BASE_DIR, path)` 会把相对路径 `models/helmet_detect.pt` 解析为 `<项目根>/models/helmet_detect.pt`，实际模型在 `backend/models/`。

**当前 FastAPI 模式下能跑通**是因为 `app.py` 启动时 cwd 通常为 `backend/`，但 PySide6 从项目根启动时会失败。**重构时必须修正 `BASE_DIR` 或在 `init_components()` 中显式传入 `backend_dir` 参数。**

### 10.2 OpenCV VideoCapture 线程安全

`cv2.VideoCapture` 实例**不能跨线程使用**。`VideoSourceManager` 当前在 `ws.py` 的 asyncio 协程中调用，本质是单线程。PySide6 重构后必须保证：

- `VideoSourceManager` 实例仅在 `DetectionWorker`（QThread）中持有
- 主线程**不直接**调用 `read_frame()`
- UI 想要切换视频源时，通过信号通知 worker 线程调用 `add_source()`

### 10.3 ultralytics 与 PySide6 依赖冲突

- `ultralytics` 依赖 `torch`，体积庞大（~2GB）。
- `PySide6` 与 `torch` 在 Windows 上**通常可共存**，但需注意：
  - 不要把 `torch` 装到 base 环境，建议 `conda create -n smart-site-qt python=3.10`
  - 安装顺序：先 `pip install PySide6`，再 `pip install ultralytics`
  - 若出现 DLL 冲突，尝试 `pip install --force-reinstall PySide6`

### 10.4 推理阻塞主线程的风险

YOLOv8 在 CPU 上单帧推理 200~500ms，**绝不能在主线程调用**。必须严格通过 `QThread + moveToThread` 或 `QThreadPool` 隔离。`process_real_frame` 应整体在 worker 线程执行。

### 10.5 QtQuick3D 成熟度

- QtQuick3D 在 Qt 6.5+ 才稳定支持 PBR + 后处理。
- UnrealBloom 等效效果在 QtQuick3D 中需要 `Effect` + 自定义着色器。
- 推荐使用 **PySide6 6.6 LTS** 或更高版本。
- 若 QtQuick3D 学习成本过高，**退路**是使用 `QQuickWindow` 嵌入 Three.js（通过 `QQuickPaintedItem` + canvas），但失去 Qt 原生优势。

### 10.6 ECharts 迁移成本

5 个图表（报警趋势 / 人员数量 / 安全帽佩戴率 / FPS / 延迟）均为简单实时折线图，QtCharts 可完全覆盖。`ChartManager.js` 中渐变面积、末端高亮点、虚线轴指示器等效果在 QtCharts 中需要自定义 `QAreaSeries` + `QScatterSeries`，工作量约 1~2 天。

### 10.7 WebSocket 视频帧性能

当前 base64 JPEG 编码 + 解码占 WS 带宽与主线程 30%+ CPU。重构后**直接删除** `frame_codec.py`，`np.ndarray` 通过 Qt 信号槽传递（信号槽是线程安全的引用传递，无拷贝开销），UI 端 `QImage(frame.data, ...)` 直接构造。

### 10.8 玻璃拟态 UI 在 Qt 中实现

QSS 不支持 `backdrop-filter: blur()`，需用 `QGraphicsBlurEffect` + `QGraphicsDropShadowEffect` 配合透明 `QWidget` 实现。复杂度高于 CSS，建议简化设计，保留深蓝主题色但放弃玻璃模糊效果。

### 10.9 演示模式与降级

`App.js` 的 `_startDemo` / `_stopDemo` 与默认摄像头连接、首帧等待状态机交织复杂。PySide6 重构时建议简化为：

- 模型缺失 → 自动进入 mock 模式（复用 `mock_stream.py`）
- 视频源未配置 → 视频区显示占位图
- 不再单独提供"演示模式开关"，统一由 mock 模式接管

---

## 11. 重构路线图

### 阶段 1：后端最小修改（仅修复阻塞性问题）

1. 修正 `model_loader.py` 中 `BASE_DIR` 计算
2. 为 `RuntimeState` 字段补充具体类型注解（`Optional[SafetyDetector]` 等）
3. 为 `detection_pipeline.py` 4 个函数补充类型注解与 Google docstring
4. `mock_stream.py` 改为 `MockStream` 类，消除全局状态
5. **不修改** `app.py` / `ws.py` / `api/*`，保留 Web 服务模式可用

### 阶段 2：PySide6 骨架

1. 创建 `qt_app/` 目录结构与 `requirements.txt`
2. 实现 `main.py` + `MainWindow` + 4 个空 `QDockWidget`
3. 实现 `DetectionWorker`（QThread）调用 `init_components()` + `process_real_frame()`
4. 验证：能在 QLabel 中看到视频帧，控制台输出事件

### 阶段 3：UI 面板迁移

1. 迁移 `TopBar` / `StatsPanel` / `VideoPanel` / `EventPanel` / `BottomPanel`
2. 实现 `ChartManager` 用 QtCharts 替代 ECharts
3. 实现 QSS 玻璃拟态主题
4. 实现 `ThemeSwitch` 昼夜切换

### 阶段 4：3D 场景迁移

1. 用 QtQuick3D 重建工地场景（地面 / 建筑 / 塔吊 / 危险区域 / 围墙 / 大门）
2. 实现摄像头模型 + 飞行动画 + 视锥
3. 实现工人模型管理
4. 实现报警特效（发光柱 + Pulse Ring + 浮动标签）

### 阶段 5：联调与优化

1. 演示模式 / mock 模式回归
2. 性能优化：推理线程帧率、3D 渲染帧率、UI 刷新频率解耦
3. 错误处理：模型缺失、视频源错误、CUDA 不可用
4. 打包：PyInstaller / Nuitka 生成 Windows 可执行文件

---

## 12. 代码质量复盘

### 12.1 后端已做的拆分

- `app.py` 仅做路由注册与生命周期，50 行精简。
- 检测流水线从 `app.py` 拆出为 `detection_pipeline.py`，函数式风格清晰。
- 模型加载逻辑独立为 `model_loader.py`，单一职责。
- 帧编码、mock 数据各成模块，便于替换。
- HTTP 路由按业务域拆分（health / videos / zones）。

### 12.2 后端避免的过度设计

- 未引入 DI 容器、抽象基类、工厂模式。
- `SafetyDetector` / `FallDetector` 各自独立，无强行继承。
- `RuntimeState` 用 `@dataclass` 而非自定义类层级。
- `ZoneMonitor` 直接用 Shapely，未封装"区域服务"层。

### 12.3 后端最容易扩展的入口

| 扩展目标 | 入口 |
|---------|------|
| 新增检测模型 | `model_config.yaml` + `model_loader._load_safety_detector` |
| 新增报警类别 | `detection_pipeline.process_real_frame` 中追加事件生成分支 |
| 调整跌倒判定 | `pose_analyzer.FallDetector.__init__` 阈值参数 |
| 新增危险区域 | `configs/zones.json` |
| 新增视频源类型 | `video_source.VideoSourceManager.add_source`（cv2 已支持 RTSP/USB/文件） |
| 重新标定摄像头 | `coord_mapper.CoordMapper.calibrate` |

### 12.4 仍值得重构的部分

- **`model_loader.BASE_DIR` 计算错误**——这是阻塞性 bug，PySide6 重构前必须修复。
- `RuntimeState` 字段类型从 `Optional[object]` 改为具体类型。
- `detection_pipeline.process_real_frame` 103 行可拆为 `_process_persons` / `_process_detections` / `_build_annotated`。
- `mock_stream` 全局可变状态改为类实例。
- 数据集脚本的硬编码路径与 API Key 暴露（独立任务，不阻塞重构）。
- `detector.py` 与 `pose_analyzer.py` 的模型推理调用缺少 `try/except` 处理 OOM 与输入异常。

---

## 13. 总结

本次重构的**核心判断**是：

> **后端代码质量足以支撑直接复用，重构工作量集中在 PySide6 前端重写。**

具体而言：

1. **后端 7 个核心模块**（detector / pose_analyzer / zone_monitor / coord_mapper / video_source / model_loader / detection_pipeline）可在 PySide6 中直接 `import` 使用，无需任何中转层。
2. **FastAPI / WebSocket / HTTP API 层**在桌面应用中**完全删除**，改为 Qt 信号槽直接调用，减少 base64 编码与网络开销。
3. **前端 Three.js + ECharts + HTML/CSS 全部重写**为 QtQuick3D + QtCharts + QWidget/QSS。
4. **后端需先修复** `BASE_DIR` 计算错误，否则 PySide6 启动时找不到模型文件。
5. **推荐项目结构**：保留 `backend/` 原样，新增 `qt_app/` 承载桌面应用，旧 `src/` 归档到 `archive/web_frontend/`。
6. **风险可控**：3D 渲染是最大不确定性，若 QtQuick3D 成本过高可退回 pyqtgraph.opengl 或保留 Three.js 通过 QWebEngineView 嵌入（最后选项）。

预计工作量分布：

- 阶段 1 后端修复：~5%
- 阶段 2 PySide6 骨架：~10%
- 阶段 3 UI 面板迁移：~25%
- 阶段 4 3D 场景迁移：~50%
- 阶段 5 联调优化：~10%

3D 场景迁移是工作量主体，建议优先评估 QtQuick3D 学习成本，必要时考虑简化 3D 视觉效果（去掉 Bloom、FXAA、6 盏探照灯光束，保留基本 PBR 材质与阴影），换取开发速度。

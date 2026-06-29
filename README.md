# 智慧工地数字孪生监控平台

基于 Three.js + FastAPI + YOLOv8 的企业级数字孪生监控平台，实现工地实时人员不安全行为智能监控与 3D 可视化预警。

## 功能特性

### AI 智能检测
- 安全帽佩戴检测（helmet / no_helmet）
- 明火 / 烟雾检测（fire / smoke）
- 跌倒检测（基于 YOLOv8-Pose 17 关键点 + 躯干角度 + 宽高比 + 持续帧确认）
- 危险区域入侵检测（shapely 多边形几何）
- 多路视频同时分析（支持文件 / RTSP / USB 摄像头）

### 数字孪生 3D 可视化
- PBR 材质 + ACES 电影级色调映射
- EffectComposer 后处理（UnrealBloom 泛光 + FXAA 抗锯齿）
- 动态天空、HDR 环境光、PCFSoft 软阴影
- 雷达扫描、粒子系统、工业风报警特效（发光柱 / Pulse Ring / 浮动标签）
- 摄像头视锥可视化 + 飞行动画切换

### 企业级监控大屏
- 深蓝科技风 + Glassmorphism 玻璃拟态
- 四周悬浮面板布局（顶部 / 左侧 / 右侧 / 底部）
- ECharts 实时图表（报警趋势 / 人员数量 / 安全帽佩戴率 / FPS / 延迟）
- 风险等级动态评估、实时事件流、数字滚动动画

### 工程化架构
- ES6 模块化开发 + Import Map
- 配置集中管理（Config.js）
- 管理器独立封装（Camera / Worker / Alert / WS / Scene / UI / Chart）
- 优雅降级（模型缺失进模拟模式、WS 断开自动重连）

## 技术栈

| 层 | 技术 |
|----|------|
| 前端渲染 | Three.js v0.157（ES Module） |
| 前端图表 | ECharts 5.4.3 |
| 前端架构 | ES6 Modules + Import Map |
| 后端服务 | FastAPI + WebSocket + Uvicorn |
| AI 检测 | YOLOv8（Ultralytics）+ YOLOv8-Pose |
| 几何检测 | shapely |
| 视频处理 | OpenCV（cv2.VideoCapture） |
| 坐标映射 | OpenCV 单应性矩阵（findHomography） |

## 目录结构

```
智慧工地数字孪生监控平台/
├── index.html                      # 主页面（Import Map + 加载动画）
├── README.md
├── .gitignore
│
├── libs/                           # 本地 Three.js 库
│   ├── three.module.js             # Three.js 核心（v0.157）
│   └── OrbitControls.js            # 轨道控制器（备用）
│
├── src/                            # 前端源码（ES6 模块化）
│   ├── App.js                      # 主入口，编排所有模块
│   │
│   ├── config/
│   │   └── Config.js               # 全局配置中心（颜色/场景/摄像头/报警等）
│   │
│   ├── scene/
│   │   └── SceneManager.js         # Three.js 场景+后处理+光照+控制器
│   │
│   ├── models/
│   │   └── Models.js               # 8 个 3D 模型工厂函数（PBR 材质）
│   │
│   ├── managers/
│   │   ├── CameraManager.js        # 多摄像头管理+飞行切换+报警闪烁
│   │   ├── WorkerManager.js        # 工人模型增删+朝向+安全帽状态
│   │   ├── AlertManager.js         # 工业风报警特效（发光柱/Pulse Ring）
│   │   └── WSManager.js            # WebSocket 通信+自动重连
│   │
│   └── ui/
│       ├── UIManager.js            # UI 面板（顶/左/右/底）+视频源导入
│       └── ChartManager.js         # ECharts 实时图表管理
│
├── backend/                        # 后端 AI 推理服务
│   ├── app.py                      # FastAPI 主服务（HTTP + WebSocket）
│   ├── detector.py                 # YOLOv8 安全检测器（安全帽/明火烟雾）
│   ├── pose_analyzer.py            # 跌倒检测（YOLOv8-Pose）
│   ├── zone_monitor.py             # 危险区域入侵检测（shapely）
│   ├── video_source.py             # 多路视频源管理（cv2）
│   ├── coord_mapper.py             # 像素→3D 坐标映射（单应性矩阵）
│   ├── requirements.txt
│   ├── configs/
│   │   ├── model_config.yaml       # 模型路径+推理参数+跌倒阈值
│   │   └── zones.json              # 危险区域多边形定义
│   └── *.py                        # 数据集转换/下载/测试脚本
│
└── main.js                         # 旧版前端（已被 src/ 架构替代，保留）
```

## 架构总览

### 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                        后端 (FastAPI)                        │
│                                                             │
│  VideoSourceManager ──读取帧──► YOLOv8 检测器（helmet/fire） │
│                                │                            │
│                                ├──► PoseAnalyzer（跌倒）     │
│                                ├──► ZoneMonitor（入侵）      │
│                                └──► CoordMapper（坐标映射）  │
│                                                             │
│  WebSocket /ws?camera_id=1 ──推送──► event/track/video_frame │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼ WS（~15fps）
┌─────────────────────────────────────────────────────────────┐
│                      前端 (Three.js)                         │
│                                                             │
│  WSManager ──分发事件──► AlertManager   ──► 3D 报警特效     │
│         └──────────────► WorkerManager  ──► 工人模型更新     │
│         └──────────────► UIManager      ──► 视频画面/事件流  │
│                                                             │
│  SceneManager ──渲染──► EffectComposer ──► Bloom + FXAA     │
│  ChartManager ──更新──► ECharts 实时图表                     │
└─────────────────────────────────────────────────────────────┘
```

### 前端模块依赖

```
App.js（主入口）
  │
  ├── config/Config.js          ← 所有颜色/尺寸/动画/场景参数
  │
  ├── scene/SceneManager.js     ← renderer + scene + camera + controls + composer
  │     └── models/Models.js    ← 8 个 3D 模型工厂（地面/工人/建筑/塔吊/危险区/摄像头/雷达/粒子）
  │
  ├── managers/
  │     ├── CameraManager.js    ← 4 个摄像头模型 + 标签 + 飞行动画 + 报警闪烁
  │     ├── WorkerManager.js    ← 工人模型增删 + 移动朝向 + 安全帽状态
  │     ├── AlertManager.js     ← 发光柱 + Pulse Ring + 地面光圈 + 浮动标签
  │     └── WSManager.js        ← WebSocket 连接 + 自动重连 + 事件分发
  │
  └── ui/
        ├── UIManager.js        ← 顶/左/右/底 4 大面板 + 视频源导入 UI
        └── ChartManager.js     ← ECharts 5 个实时图表
```

### 后端模块协作

```
app.py（FastAPI 主服务）
  │
  ├── detector.py               ← SafetyDetector 封装 YOLOv8
  │     ├── helmet_detect.pt    ← 安全帽检测
  │     └── fire_smoke_detect.pt← 明火/烟雾检测
  │
  ├── pose_analyzer.py          ← FallDetector（YOLOv8-Pose 17 关键点）
  │     └── yolov8n-pose.pt     ← 姿态估计
  │
  ├── zone_monitor.py           ← ZoneMonitor（shapely 多边形）
  │     └── configs/zones.json  ← 3 个危险区域定义
  │
  ├── video_source.py           ← VideoSourceManager（cv2.VideoCapture）
  │
  ├── coord_mapper.py           ← CoordMapper（单应性矩阵）
  │
  └── configs/model_config.yaml ← 模型路径 + 推理参数 + 跌倒阈值
```

## 快速开始

### 环境要求

- Python 3.8+（推荐 3.10）
- Node.js（仅需静态服务器，无需构建）
- 现代浏览器（支持 ES Modules + WebGL2）

### 1. 启动后端

```bash
cd backend
pip install -r requirements.txt

# （可选）放置训练好的模型到 backend/models/ 目录
# helmet_detect.pt / fire_smoke_detect.pt / yolov8n-pose.pt

python app.py
# 或: uvicorn app:app --host 0.0.0.0 --port 8000
```

后端启动后访问 http://localhost:8000/api/health 检查状态。
模型缺失时自动进入**模拟模式**（MOCK_MODE），仍可演示前端。

### 2. 启动前端

```bash
# 在项目根目录
python -m http.server 8080
# 或: npx serve -p 8080
```

访问 http://localhost:8080

### 3. 导入视频源

在右侧"摄像头列表"下方的**导入视频源**面板：

1. 下拉选择摄像头 ID（Cam1-4）
2. 输入视频源：
   - 本地文件：`data/videos/demo.mp4`
   - RTSP 流：`rtsp://admin:123456@192.168.1.100:554/stream1`
   - USB 摄像头：`0` 或 `1`
3. 点击"添加视频源"
4. 点击对应摄像头按钮即可在视频监控区看到画面并启动 AI 检测

## 配置说明

### 前端配置（src/config/Config.js）

所有参数集中管理，主要分类：

| 分类 | 说明 | 关键参数 |
|------|------|---------|
| `colors` | 深蓝科技风主题色 | accent / danger / warning / success |
| `scene` | 3D 场景尺寸与雾效 | size=200, fogNear=150, fogFar=500 |
| `camera` | 主相机参数 | fov=50, position=[140,110,140] |
| `render` | 渲染与后处理 | shadowMapSize=4096, bloom(strength=0.8) |
| `buildings` | 建筑配置 | 2 栋楼（主楼A/B） |
| `cranes` | 塔吊配置 | height=60, armLength=35 |
| `dangerZones` | 危险区域 | 3 个（与后端 zones.json 对齐） |
| `cameras` | 摄像头配置 | 4 个（主监控/堆场/塔吊/入口） |
| `alert` | 报警特效 | pulseRings=3, fadeOutDuration=8000ms |
| `ws` | WebSocket | url=ws://localhost:8000/ws, reconnectInterval=3000 |
| `api` | 后端 API | base=http://localhost:8000 |
| `charts` | 图表刷新 | refreshInterval=2000ms, maxDataPoints=30 |

### 后端配置（backend/configs/）

**model_config.yaml**：
- `model_paths`：3 个模型文件路径
- `inference`：conf_threshold=0.4, iou_threshold=0.5, device=cpu, imgsz=640
- `fall_detection`：min_angle=45°, min_aspect_ratio=1.2, confirm_frames=15

**zones.json**：3 个危险区域多边形定义
- `tower_crane` 塔吊作业区
- `building_edge` 临边防护区
- `material_storage` 材料堆放区

## API 接口

### HTTP

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查，返回模型加载状态与 mock_mode |
| GET | `/api/zones` | 获取危险区域定义 |
| GET | `/api/videos` | 列出所有视频源 |
| POST | `/api/videos/add?camera_id=1&source=...` | 添加视频源 |
| POST | `/api/videos/remove?camera_id=1` | 移除视频源 |

### WebSocket

**端点**：`ws://localhost:8000/ws?camera_id=1`

**消息类型**（JSON）：

```js
// 报警事件
{ "type": "event", "x": 12.5, "z": -8.3, "event": "no_helmet", "camera_id": 1, "confidence": 0.92 }

// 工人轨迹
{ "type": "track", "workers": [{ "id": "W001", "x": 10, "z": 5, "helmet": true }] }

// 视频帧（base64 JPEG）
{ "type": "video_frame", "frame": "data:image/jpeg;base64,...", "camera_id": 1 }

// 跨摄像头报警
{ "type": "alert_from_camera", "camera_id": 2, "alert_type": "smoke" }
```

## AI 检测说明

### 检测类别（7 类）

| ID | 类别 | 说明 |
|----|------|------|
| 0 | helmet | 已戴安全帽 |
| 1 | no_helmet | 未戴安全帽（报警） |
| 2 | vest | 已穿反光衣 |
| 3 | no_vest | 未穿反光衣 |
| 4 | smoke | 吸烟/烟雾（报警） |
| 5 | fire | 明火（报警） |
| 6 | person | 人员 |

### 跌倒检测逻辑

1. YOLOv8-Pose 提取 17 关键点
2. 计算躯干角度（髋中点→肩中点向量与水平面夹角）
3. 计算边界框宽高比
4. 判定：`角度 < 45°` 且 `宽高比 > 1.2` → 跌倒姿态
5. 持续 15 帧（约 1 秒）确认 → 触发跌倒报警

### 坐标映射

通过单应性矩阵（Homography）将视频像素坐标映射到 3D 场景坐标：

```
图像像素 (u, v) ──H矩阵──► 3D 场景坐标 (X, Z)
```

每个摄像头独立标定，支持 4 点标定法重新校准。

## 优雅降级机制

| 场景 | 行为 |
|------|------|
| 后端模型缺失 | 自动进入 MOCK_MODE，生成 3 个模拟工人 + 随机报警 |
| 后端未启动 | 前端 WS 连接失败，每 3 秒自动重连 |
| WS 断开 | 前端生成模拟工人移动 + 20% 概率随机报警，UI 仍可演示 |
| 视频源未配置 | 摄像头按钮可点击切换 3D 视角，视频区显示"无视频信号" |

## 浏览器支持

- Chrome / Edge 90+（推荐）
- Firefox 88+
- Safari 14+
- 需支持 WebGL2 + ES Modules

## 许可证

本项目仅用于学习与演示。

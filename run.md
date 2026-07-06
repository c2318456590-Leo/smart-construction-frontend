# run.bat 使用与迁移说明

本文说明如何在其他 Windows 电脑上复用和修改 `run.bat`。当前脚本负责三件事：

1. 启动后端 FastAPI：`http://127.0.0.1:8000`
2. 启动前端静态服务：`http://127.0.0.1:8080`
3. 等待后端健康检查通过后自动打开浏览器

## 1. 其他电脑如何复用

### 1.1 复制项目

把整个项目目录复制到目标电脑，例如：

```bat
D:\smart-site\
```

不要只复制 `run.bat`，它依赖这些目录：

```text
backend\
src\
libs\
index.html
```

### 1.2 准备 Python 环境

推荐 Python 3.10。后端依赖安装一次即可：

```bat
cd /d D:\smart-site\backend
pip install -r requirements.txt
```

如果使用 conda 或 uv，先按下面第 3 节准备环境，再安装依赖。

### 1.3 检查脚本

在项目根目录运行：

```bat
run.bat --check
```

看到以下信息表示脚本基础配置可用：

```text
[CHECK] run.bat check passed.
```

### 1.4 一键启动

双击项目根目录下的：

```text
run.bat
```

脚本会打开两个命令行窗口：

```text
SmartSite Backend
SmartSite Frontend
```

关闭这两个窗口即可停止服务。

## 2. 其他电脑如何更改

只建议修改 `run.bat` 顶部配置区，不建议改脚本中间的 `start` 命令。

### 2.1 修改前端端口

如果 `8080` 被占用，只改这一行：

```bat
set "FRONTEND_PORT=8080"
```

例如改成：

```bat
set "FRONTEND_PORT=8090"
```

前端访问地址会自动变为：

```text
http://127.0.0.1:8090/
```

### 2.2 修改后端端口

如果要把后端从 `8000` 改成其他端口，需要同时修改三处：

`run.bat`：

```bat
set "BACKEND_PORT=8000"
```

`backend/app.py`：

```python
uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
```

`src/config/Config.js`：

```js
url: 'ws://localhost:8000/ws',
base: 'http://localhost:8000',
```

只改 `run.bat` 不够，因为前端 WebSocket 和 API 地址目前写在 `Config.js` 中。

### 2.3 修改模型路径

模型路径不要写进 `run.bat`。统一改这里：

```text
backend/configs/model_config.yaml
```

当前推荐结构：

```yaml
model_paths:
  helmet: models/helmet_detect.pt
  fire_smoke: models/fire_smoke_detect.pt
  pose: models/yolov8n-pose.pt
```

相对路径以 `backend/` 为基准。

### 2.4 修改危险区域

危险区域不要改前端旧配置。权威配置在：

```text
backend/configs/zones.json
```

前端启动后会通过 `/api/zones` 读取后端危险区域。

## 3. Python 环境配置方式

不同电脑只需要按实际情况修改 `run.bat` 顶部这几行：

```bat
set "PYTHON_MODE=python"
set "PYTHON_EXE=python"
set "CONDA_ENV="
set "CONDA_ACTIVATE_BAT="
```

### 3.1 conda 环境，推荐方式

大多数电脑如果使用 conda，推荐先创建环境：

```bat
conda create -n smart-site python=3.10
conda activate smart-site
cd /d D:\smart-site\backend
pip install -r requirements.txt
```

然后修改 `run.bat`：

```bat
set "PYTHON_MODE=conda"
set "CONDA_ENV=smart-site"
set "CONDA_ACTIVATE_BAT="
```

如果双击脚本时提示找不到 `conda`，填写 Anaconda/Miniconda 的 `activate.bat` 路径：

```bat
set "CONDA_ACTIVATE_BAT=C:\ProgramData\anaconda3\Scripts\activate.bat"
```

常见路径还可能是：

```text
C:\Users\你的用户名\anaconda3\Scripts\activate.bat
C:\Users\你的用户名\miniconda3\Scripts\activate.bat
```

### 3.2 uv 环境，当前项目推荐方式

当前项目没有 `pyproject.toml` 和 `uv.lock`，因此更稳的做法是用 uv 创建 `.venv`，再让 `run.bat` 直接调用这个 Python：

```bat
cd /d D:\smart-site
uv venv .venv --python 3.10
.\.venv\Scripts\activate
uv pip install -r backend\requirements.txt
```

然后修改 `run.bat`：

```bat
set "PYTHON_MODE=python"
set "PYTHON_EXE=%PROJECT_ROOT%\.venv\Scripts\python.exe"
```

如果后续项目补充了 `pyproject.toml` 和 `uv.lock`，也可以改用：

```bat
set "PYTHON_MODE=uv"
```

这种模式会执行：

```bat
uv run python app.py
uv run python -m http.server 8080
```

### 3.3 直接使用系统 Python

少数电脑如果不使用环境管理，先安装依赖：

```bat
cd /d D:\smart-site\backend
pip install -r requirements.txt
```

然后保持 `run.bat` 默认配置：

```bat
set "PYTHON_MODE=python"
set "PYTHON_EXE=python"
```

如果电脑上有多个 Python，可以把 `PYTHON_EXE` 改成完整路径：

```bat
set "PYTHON_EXE=C:\Users\你的用户名\AppData\Local\Programs\Python\Python310\python.exe"
```

## 4. 常见问题

### 4.1 后端 30 秒内未就绪

脚本会继续打开前端，但页面可能需要刷新。常见原因：

- 第一次导入 `ultralytics` 或 `torch` 较慢
- 依赖没有安装完整
- 模型文件过大，初始化较慢
- `8000` 端口被占用

先看 `SmartSite Backend` 窗口里的错误信息。

### 4.2 前端打开但无法连接后端

检查：

```text
http://127.0.0.1:8000/api/health
```

如果打不开，说明后端没有正常启动。

如果改过后端端口，确认 `src/config/Config.js` 里的 API 和 WebSocket 端口也同步修改。

### 4.3 端口被占用

查看占用端口的进程：

```bat
netstat -ano | findstr :8000
netstat -ano | findstr :8080
```

可以结束占用进程，也可以按第 2 节修改端口。

## 5. 推荐迁移顺序

1. 复制完整项目目录
2. 选择 Python 环境方式：优先 conda，其次 uv `.venv`，最后系统 Python
3. 安装 `backend/requirements.txt`
4. 按需修改 `run.bat` 顶部配置区
5. 执行 `run.bat --check`
6. 双击 `run.bat` 启动

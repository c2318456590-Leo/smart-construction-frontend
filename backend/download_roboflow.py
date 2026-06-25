"""
从 Roboflow 下载多类别工地安全数据集
包含: helmet, no-helmet, vest, no-vest
"""
import os
from roboflow import Roboflow

DATASET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
os.makedirs(DATASET_DIR, exist_ok=True)

# Roboflow 公开数据集 - 工地安全穿戴检测
# 包含: Helmet, No Helmet, Safety Vest, NO-Safety Vest
rf = Roboflow(api_key="rf_3qBvMnJYiUYJiUYJiUYJiUYJiUYJiUYJ")
project = rf.workspace("roboflow-universe-projects").project("construction-site-safety")
dataset = project.version(1).download("yolov8", location=os.path.join(DATASET_DIR, "construction_safety"))
print(f"数据集已下载到: {dataset.location}")

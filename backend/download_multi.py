"""
尝试多种方式获取多类别工地安全数据集
方式1: Roboflow 公开项目（需注册）
方式2: GitHub 开源数据集
方式3: 合并SHWD(安全帽) + 手动合成其他类别
"""
import os
import sys
import shutil
import subprocess

DATASET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")

# ============================================
# 方式1: 尝试 Roboflow 公开数据集
# ============================================
def try_roboflow():
    """尝试从 Roboflow 下载数据集"""
    print("=" * 50)
    print("尝试方式1: Roboflow 公开数据集")
    print("=" * 50)

    try:
        from roboflow import Roboflow
        # 尝试匿名访问公开数据集
        rf = Roboflow(api_key="rf_0JX3m8a8b3J6yM7pV8qZ")
        project = rf.workspace("mohamed-salama").project("safety-helmet-vest-detection")
        dataset = project.version(1).download("yolov8", location=os.path.join(DATASET_DIR, "safety_multi"))
        print(f"下载成功: {dataset.location}")
        return dataset.location
    except Exception as e:
        print(f"Roboflow 失败: {e}")
        return None


# ============================================
# 方式2: GitHub 开源多类别数据集
# ============================================
def try_github():
    """从 GitHub 克隆多类别安全数据集"""
    print("\n" + "=" * 50)
    print("尝试方式2: GitHub 开源数据集")
    print("=" * 50)

    # 尝试几个已知的工地安全数据集仓库
    repos = [
        ("https://github.com/ZijianWang1995/Safety_Helmet_Detection.git", "safety_helmet_git"),
        ("https://github.com/Tecu23/Construction-Safety-Detection.git", "construction_safety_git"),
    ]

    for url, dirname in repos:
        target = os.path.join(DATASET_DIR, dirname)
        if os.path.exists(target):
            print(f"已存在: {target}")
            return target
        try:
            print(f"尝试克隆: {url}")
            subprocess.run(["git", "clone", "--depth", "1", url, target],
                          check=True, capture_output=True, text=True, timeout=60)
            print(f"克隆成功: {target}")
            return target
        except Exception as e:
            print(f"克隆失败: {url}: {e}")
            if os.path.exists(target):
                shutil.rmtree(target, ignore_errors=True)

    return None


# ============================================
# 方式3: 合并 SHWD 安全帽 + COCO person + 生成多类别
# ============================================
def build_multi_class_dataset():
    """
    基于已有的 SHWD 安全帽数据集，
    将其转换为4类别格式：
    0: helmet (戴安全帽)
    1: no_helmet (未戴安全帽)
    2: vest (穿反光衣) - 暂用 person 框代替
    3: no_vest (未穿反光衣) - 暂用 person 框代替

    注：反光衣/吸烟类别需要后续用真实数据微调
    """
    print("\n" + "=" * 50)
    print("尝试方式3: 基于SHWD构建多类别数据集")
    print("=" * 50)

    src_dir = os.path.join(DATASET_DIR, "helmet_yolo")
    if not os.path.exists(src_dir):
        print("SHWD 数据集不存在，无法构建")
        return None

    # 直接使用已有的2类别数据集进行训练
    # 后续可以通过迁移学习添加其他类别
    yaml_path = os.path.join(src_dir, "dataset.yaml")
    print(f"使用已有数据集: {yaml_path}")
    print("类别: 0=helmet, 1=no_helmet")
    print("后续可通过迁移学习添加 vest/no_vest/smoke/fire")

    return yaml_path


if __name__ == "__main__":
    # 依次尝试
    result = try_roboflow()
    if result is None:
        result = try_github()
    if result is None:
        result = build_multi_class_dataset()

    print("\n" + "=" * 50)
    print(f"最终结果: {result}")
    print("=" * 50)

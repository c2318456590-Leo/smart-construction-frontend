"""
数据集下载脚本 - 最终版
从 Google Drive 下载 SHWD 安全帽检测数据集 (7581张)
然后转换为 YOLO 格式
"""
import os
import sys
import subprocess

DATASET_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
os.makedirs(DATASET_DIR, exist_ok=True)

# SHWD 数据集 Google Drive ID
# 来自 https://github.com/njvisionpower/Safety-Helmet-Wearing-Dataset
SHWD_GDRIVE_ID = "1qWm7rrwvjAWs1slymbrLaCf7Q-wnGLEX"

def download_shwd():
    """从 Google Drive 下载 SHWD 数据集"""
    import gdown

    target = os.path.join(DATASET_DIR, "SHWD.zip")
    print("=" * 60)
    print("下载 SHWD 安全帽检测数据集 (7581张)...")
    print("=" * 60)

    if os.path.exists(target):
        print(f"文件已存在: {target}")
    else:
        try:
            gdown.download(id=SHWD_GDRIVE_ID, output=target, quiet=False)
            print(f"下载完成: {target}")
        except Exception as e:
            print(f"Google Drive 下载失败: {e}")
            print("\n备选方案：使用 COCO128 数据集进行训练演示")
            return None

    # 解压
    extract_dir = os.path.join(DATASET_DIR, "SHWD_full")
    if not os.path.exists(extract_dir):
        print("解压中...")
        import zipfile
        with zipfile.ZipFile(target, 'r') as z:
            z.extractall(extract_dir)
        print(f"解压到: {extract_dir}")

    return extract_dir


def convert_voc_to_yolo(voc_dir):
    """将 VOC 格式标注转换为 YOLO 格式"""
    import xml.etree.ElementTree as ET
    from pathlib import Path

    print("\n转换 VOC → YOLO 格式...")

    # SHWD 类别: hat (戴安全帽) → 0, person (未戴安全帽的人头) → 1
    classes = {'hat': 0, 'person': 1}

    # 查找 Annotations 和 JPEGImages
    annotations_dir = os.path.join(voc_dir, "Annotations")
    images_dir = os.path.join(voc_dir, "JPEGImages")

    if not os.path.exists(annotations_dir):
        # 尝试在子目录中查找
        for root, dirs, files in os.walk(voc_dir):
            if "Annotations" in dirs:
                annotations_dir = os.path.join(root, "Annotations")
                images_dir = os.path.join(root, "JPEGImages")
                break

    if not os.path.exists(annotations_dir):
        print(f"未找到 Annotations 目录")
        return None

    # 创建 YOLO 目录结构
    yolo_dir = os.path.join(DATASET_DIR, "helmet_yolo")
    for split in ['train', 'val']:
        os.makedirs(os.path.join(yolo_dir, "images", split), exist_ok=True)
        os.makedirs(os.path.join(yolo_dir, "labels", split), exist_ok=True)

    # 获取所有 XML 文件
    xml_files = [f for f in os.listdir(annotations_dir) if f.endswith('.xml')]
    print(f"找到 {len(xml_files)} 个标注文件")

    # 按 8:2 划分训练/验证
    split_idx = int(len(xml_files) * 0.8)

    for i, xml_file in enumerate(xml_files):
        xml_path = os.path.join(annotations_dir, xml_file)
        tree = ET.parse(xml_path)
        root = tree.getroot()

        # 获取图像尺寸
        size = root.find('size')
        if size is None:
            continue
        w = int(size.find('width').text)
        h = int(size.find('height').text)

        # 解析目标
        yolo_lines = []
        for obj in root.findall('object'):
            name = obj.find('name').text
            if name not in classes:
                continue
            cls_id = classes[name]

            bbox = obj.find('bndbox')
            xmin = float(bbox.find('xmin').text)
            ymin = float(bbox.find('ymin').text)
            xmax = float(bbox.find('xmax').text)
            ymax = float(bbox.find('ymax').text)

            # 转换为 YOLO 格式 (归一化中心坐标)
            x_center = (xmin + xmax) / 2.0 / w
            y_center = (ymin + ymax) / 2.0 / h
            width = (xmax - xmin) / w
            height = (ymax - ymin) / h

            yolo_lines.append(f"{cls_id} {x_center:.6f} {y_center:.6f} {width:.6f} {height:.6f}")

        # 确定划分
        split = 'train' if i < split_idx else 'val'

        # 写入标签文件
        txt_name = xml_file.replace('.xml', '.txt')
        txt_path = os.path.join(yolo_dir, "labels", split, txt_name)
        with open(txt_path, 'w') as f:
            f.write('\n'.join(yolo_lines))

        # 复制图像
        img_name = xml_file.replace('.xml', '.jpg')
        img_src = os.path.join(images_dir, img_name)
        img_dst = os.path.join(yolo_dir, "images", split, img_name)
        if os.path.exists(img_src):
            import shutil
            shutil.copy2(img_src, img_dst)

    # 创建 YAML 配置
    yaml_path = os.path.join(yolo_dir, "dataset.yaml")
    with open(yaml_path, 'w') as f:
        f.write(f"""# SHWD 安全帽检测数据集 (YOLO格式)
path: {yolo_dir.replace(os.sep, '/')}
train: images/train
val: images/val

names:
  0: helmet
  1: no_helmet
""")

    print(f"转换完成！YOLO 数据集: {yolo_dir}")
    print(f"训练集: {split_idx} 张, 验证集: {len(xml_files) - split_idx} 张")
    print(f"YAML 配置: {yaml_path}")
    return yaml_path


if __name__ == "__main__":
    result = download_shwd()
    if result:
        yaml_path = convert_voc_to_yolo(result)
        if yaml_path:
            print(f"\n数据集准备完成: {yaml_path}")

"""
将烟火检测数据集从 VOC XML 格式转换为 YOLO 格式
源路径: data/fire_smoke_voc/VOC2020 (来自 gengyanlei/fire-smoke-detect-yolov4, 2059张)
类别: 0: fire (火灾), 1: smoke (烟雾)
"""
import os
import xml.etree.ElementTree as ET
import shutil
import random

# 源数据路径 (VOC 格式)
SRC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "fire_smoke_voc", "VOC2020")
SRC_IMAGES = os.path.join(SRC_DIR, "JPEGImages")
SRC_ANNOTATIONS = os.path.join(SRC_DIR, "Annotations")

# 目标 YOLO 数据集路径
DST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "fire_smoke_yolo")
for split in ['train', 'val']:
    os.makedirs(os.path.join(DST_DIR, "images", split), exist_ok=True)
    os.makedirs(os.path.join(DST_DIR, "labels", split), exist_ok=True)

# 类别映射
classes = {'fire': 0, 'smoke': 1}

# 获取所有 XML 文件
xml_files = sorted([f for f in os.listdir(SRC_ANNOTATIONS) if f.endswith('.xml')])
print(f"共 {len(xml_files)} 个标注文件")

# 随机打乱并按 8:2 划分
random.seed(42)
random.shuffle(xml_files)
split_idx = int(len(xml_files) * 0.8)
train_files = xml_files[:split_idx]
val_files = xml_files[split_idx:]

print(f"训练集: {len(train_files)} 张, 验证集: {len(val_files)} 张")

def convert_box(size, box):
    """VOC (xmin,ymin,xmax,ymax) → YOLO (x_center,y_center,w,h) 归一化"""
    dw = 1.0 / size[0]
    dh = 1.0 / size[1]
    x_center = (box[0] + box[2]) / 2.0 * dw
    y_center = (box[1] + box[3]) / 2.0 * dh
    w = (box[2] - box[0]) * dw
    h = (box[3] - box[1]) * dh
    return x_center, y_center, w, h

def process_split(file_list, split):
    count = 0
    skipped = 0
    for xml_file in file_list:
        xml_path = os.path.join(SRC_ANNOTATIONS, xml_file)
        tree = ET.parse(xml_path)
        root = tree.getroot()

        size = root.find('size')
        if size is None:
            skipped += 1
            continue
        w = int(size.find('width').text)
        h = int(size.find('height').text)
        if w == 0 or h == 0:
            skipped += 1
            continue

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
            xc, yc, bw, bh = convert_box((w, h), (xmin, ymin, xmax, ymax))
            yolo_lines.append(f"{cls_id} {xc:.6f} {yc:.6f} {bw:.6f} {bh:.6f}")

        if not yolo_lines:
            skipped += 1
            continue

        # 写入标签
        txt_name = xml_file.replace('.xml', '.txt')
        txt_path = os.path.join(DST_DIR, "labels", split, txt_name)
        with open(txt_path, 'w') as f:
            f.write('\n'.join(yolo_lines))

        # 复制图片
        img_name = xml_file.replace('.xml', '.jpg')
        img_src = os.path.join(SRC_IMAGES, img_name)
        img_dst = os.path.join(DST_DIR, "images", split, img_name)
        if os.path.exists(img_src):
            shutil.copy2(img_src, img_dst)
            count += 1

    print(f"  {split}: 处理 {count} 张, 跳过 {skipped} 张")

process_split(train_files, 'train')
process_split(val_files, 'val')

# 创建 YAML 配置
yaml_path = os.path.join(DST_DIR, "dataset.yaml")
with open(yaml_path, 'w', encoding='utf-8') as f:
    f.write(f"""# 烟火检测数据集 (YOLO格式)
path: {DST_DIR.replace(os.sep, '/')}
train: images/train
val: images/val

names:
  0: fire
  1: smoke
""")

print(f"\n转换完成！YOLO 数据集: {DST_DIR}")
print(f"YAML 配置: {yaml_path}")

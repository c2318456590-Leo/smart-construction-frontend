"""
初始版本：将 merged_dataset 中的 YOLO bbox 标签转换为多边形分割标签格式，
输出到 merged_dataset_seg。图片通过软链接复用，失败时降级为复制。
"""

import os
import shutil
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# 关键常量
# ---------------------------------------------------------------------------

# 项目根目录
PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent

# 源数据集目录（已存在的 merged_dataset）
SRC_DATASET_DIR: Path = PROJECT_ROOT / "deeplearn" / "merged_dataset"

# 输出目录
SEG_DATASET_DIR: Path = PROJECT_ROOT / "deeplearn" / "merged_dataset_seg"

# 数据集划分
SPLITS: tuple[str, ...] = ("train", "val")

# 合并后的类别名称
CLASS_NAMES: dict[int, str] = {0: "helmet", 1: "no_helmet", 2: "fire", 3: "smoke"}

# 软链接可用性标记，首次失败后设为 False，后续直接走复制
_SYMLINK_AVAILABLE: bool = True


# ---------------------------------------------------------------------------
# 函数实现
# ---------------------------------------------------------------------------


def ensure_output_dirs() -> None:
    """创建输出目录结构。

    构建 merged_dataset_seg 下的 images/{train,val} 和 labels/{train,val} 目录。
    如果目录已存在则不做任何操作。
    """
    for split in SPLITS:
        (SEG_DATASET_DIR / "images" / split).mkdir(parents=True, exist_ok=True)
        (SEG_DATASET_DIR / "labels" / split).mkdir(parents=True, exist_ok=True)


def bbox_to_polygon(cx: float, cy: float, w: float, h: float) -> tuple[float, ...]:
    """将 YOLO bbox 坐标转为 4 点矩形多边形坐标。

    Args:
        cx: 边界框中心 x（归一化）。
        cy: 边界框中心 y（归一化）。
        w: 边界框宽度（归一化）。
        h: 边界框高度（归一化）。

    Returns:
        包含 8 个浮点数的元组 (x1, y1, x2, y2, x3, y3, x4, y4)，
        表示矩形的 4 个角点坐标。
    """
    x1 = cx - w / 2
    y1 = cy - h / 2
    x2 = cx + w / 2
    y2 = cy - h / 2
    x3 = cx + w / 2
    y3 = cy + h / 2
    x4 = cx - w / 2
    y4 = cy + h / 2
    return (x1, y1, x2, y2, x3, y3, x4, y4)


def convert_label_file(src_label: Path, dst_label: Path) -> int:
    """读取 bbox 标签文件，转换并写入 seg 标签文件。

    Args:
        src_label: 源 bbox 标签文件路径。
        dst_label: 目标 seg 标签文件路径。

    Returns:
        成功转换的标签行数。如果源文件为空或不存在，返回 0。
    """
    if not src_label.exists():
        return 0

    try:
        lines = src_label.read_text(encoding="utf-8").strip().splitlines()
    except OSError as exc:
        print(f"[警告] 无法读取标签文件 {src_label}: {exc}", file=sys.stderr)
        return 0

    if not lines:
        return 0

    converted: list[str] = []
    for line in lines:
        parts = line.strip().split()
        if len(parts) < 5:
            continue
        class_id = parts[0]
        try:
            cx = float(parts[1])
            cy = float(parts[2])
            w = float(parts[3])
            h = float(parts[4])
        except ValueError:
            continue
        polygon = bbox_to_polygon(cx, cy, w, h)
        coords_str = " ".join(f"{v:.6f}" for v in polygon)
        converted.append(f"{class_id} {coords_str}")

    try:
        dst_label.write_text("\n".join(converted) + "\n", encoding="utf-8")
    except OSError as exc:
        print(f"[警告] 无法写入标签文件 {dst_label}: {exc}", file=sys.stderr)
        return 0

    return len(converted)


def link_or_copy_image(src: Path, dst: Path) -> str:
    """通过软链接或复制复用图片文件。

    优先尝试 os.symlink 创建软链接；如果失败则降级为 shutil.copy2 复制。
    首次软链接失败后，全局标记 _SYMLINK_AVAILABLE 设为 False，后续直接走复制。

    Args:
        src: 源图片路径。
        dst: 目标图片路径。

    Returns:
        "symlink" 表示使用了软链接，"copy" 表示使用了复制。
    """
    global _SYMLINK_AVAILABLE

    # 如果目标已存在，直接返回对应的类型标记
    if dst.exists() or dst.is_symlink():
        if dst.is_symlink():
            return "symlink"
        return "copy"

    if _SYMLINK_AVAILABLE:
        try:
            os.symlink(str(src), str(dst))
            if dst.is_symlink() and dst.exists():
                return "symlink"
            # 验证失败，清理可能残留的链接
            if dst.is_symlink():
                dst.unlink()
        except OSError:
            pass

        # 软链接失败，降级并标记
        if _SYMLINK_AVAILABLE:
            _SYMLINK_AVAILABLE = False
            print(
                "[警告] 软链接不可用，后续将使用文件复制替代。",
                file=sys.stderr,
            )

    # 降级：复制文件
    try:
        shutil.copy2(str(src), str(dst))
    except OSError as exc:
        print(f"[警告] 无法复制图片 {src} -> {dst}: {exc}", file=sys.stderr)
        return "copy"

    return "copy"


def process_split(split: str, stats: dict) -> None:
    """处理一个数据集划分（train 或 val）。

    遍历源标签目录，将每个 bbox 标签转换为 seg 标签；
    同时对对应图片创建软链接或复制。

    Args:
        split: 数据集划分名称，如 "train" 或 "val"。
        stats: 统计字典，用于累计标签数和软链接/复制计数。
    """
    src_label_dir = SRC_DATASET_DIR / "labels" / split
    src_image_dir = SRC_DATASET_DIR / "images" / split
    dst_label_dir = SEG_DATASET_DIR / "labels" / split
    dst_image_dir = SEG_DATASET_DIR / "images" / split

    if not src_label_dir.exists():
        print(f"[警告] 源标签目录不存在: {src_label_dir}", file=sys.stderr)
        return

    label_files = sorted(src_label_dir.glob("*.txt"))
    for label_file in label_files:
        dst_label = dst_label_dir / label_file.name
        count = convert_label_file(label_file, dst_label)
        stats["label_count"] += count

        # 查找同名图片（可能为 jpg / png / jpeg 等后缀）
        stem = label_file.stem
        for ext in (".jpg", ".jpeg", ".png", ".bmp"):
            src_img = src_image_dir / f"{stem}{ext}"
            if src_img.exists():
                dst_img = dst_image_dir / f"{stem}{ext}"
                method = link_or_copy_image(src_img, dst_img)
                if method == "symlink":
                    stats["symlink_count"] += 1
                else:
                    stats["copy_count"] += 1
                break


def write_dataset_yaml() -> None:
    """写入 dataset.yaml 配置文件到输出目录。"""
    yaml_path = SEG_DATASET_DIR / "dataset.yaml"
    lines = [
        "path: .",
        "train: images/train",
        "val: images/val",
        "names:",
    ]
    for idx, name in CLASS_NAMES.items():
        lines.append(f"  {idx}: {name}")
    try:
        yaml_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    except OSError as exc:
        print(f"[警告] 无法写入 dataset.yaml: {exc}", file=sys.stderr)


def main() -> None:
    """主流程：创建输出目录、转换标签、链接/复制图片、写入配置、打印统计。"""
    print("=" * 60)
    print("YOLO bbox -> seg 标签转换")
    print("=" * 60)

    ensure_output_dirs()

    # 统计信息
    total_stats: dict[str, int] = {
        "label_count": 0,
        "symlink_count": 0,
        "copy_count": 0,
    }

    for split in SPLITS:
        split_stats: dict[str, int] = {
            "label_count": 0,
            "symlink_count": 0,
            "copy_count": 0,
        }
        process_split(split, split_stats)
        print(
            f"[{split}] 标签: {split_stats['label_count']} 行, "
            f"软链接: {split_stats['symlink_count']}, "
            f"复制: {split_stats['copy_count']}"
        )
        total_stats["label_count"] += split_stats["label_count"]
        total_stats["symlink_count"] += split_stats["symlink_count"]
        total_stats["copy_count"] += split_stats["copy_count"]

    write_dataset_yaml()

    print("-" * 60)
    print(f"总计  标签: {total_stats['label_count']} 行, "
          f"软链接: {total_stats['symlink_count']}, "
          f"复制: {total_stats['copy_count']}")
    print(f"输出目录: {SEG_DATASET_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()

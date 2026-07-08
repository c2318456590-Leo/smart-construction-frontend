"""
prepare_merged_dataset.py

功能：
    将两份 YOLO 格式数据集（helmet_yolo 与 fire_smoke_yolo）合并为一份统一的
    YOLO 数据集，输出到 deeplearn/merged_dataset/。

    - 不修改原始数据集
    - 类别重映射：helmet/no_helmet 保持 0/1，fire/smoke 映射为 2/3
    - 图片通过软链接复用，Windows 权限失败时降级为复制（仅提示一次）
    - 文件名加来源前缀（helmet_ / fire_）避免冲突
    - 自动生成 dataset.yaml 并打印合并统计

修改说明：
    - 修复 os.symlink 在沙盒/受限权限下静默返回成功但实际未创建链接的问题：
      link_or_copy_image 在调用后用 is_symlink() 验证目标确实存在，验证
      失败时同样进入降级复制路径。
"""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path
from typing import TypedDict


# ===================== 类型定义 =====================

class SourceConfig(TypedDict):
    """单个源数据集的合并配置。"""
    name: str
    dataset_dir: Path
    class_map: dict[int, int]
    file_prefix: str


class SplitStats(TypedDict):
    """单个源、单个 split 的统计计数。"""
    images: int
    labels: int
    skipped: int


class Stats(TypedDict):
    """合并过程的整体统计。"""
    sources: dict[str, dict[str, SplitStats]]
    totals: dict[str, int]
    link_count: int
    copy_count: int


# ===================== 常量定义 =====================

# 项目根目录（即 web（智慧工地前端）），通过 __file__ 推导
PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent

# 原始数据集目录
HELMET_DATASET_DIR: Path = PROJECT_ROOT / "data" / "helmet_yolo"
FIRE_SMOKEDATASET_DIR: Path = PROJECT_ROOT / "data" / "fire_smoke_yolo"

# 合并后输出目录
MERGED_DATASET_DIR: Path = PROJECT_ROOT / "deeplearn" / "merged_dataset"

# 数据集划分
SPLITS: tuple[str, ...] = ("train", "val")

# 合并后的类别名称（键为类别 ID，值为名称）
CLASS_NAMES: dict[int, str] = {0: "helmet", 1: "no_helmet", 2: "fire", 3: "smoke"}

# 各源数据集的类别重映射表
HELMET_CLASS_MAP: dict[int, int] = {0: 0, 1: 1}
FIRE_SMOKE_CLASS_MAP: dict[int, int] = {0: 2, 1: 3}

# 源数据集配置列表：名称、路径、类别映射、文件前缀
SOURCE_CONFIGS: list[SourceConfig] = [
    {
        "name": "helmet",
        "dataset_dir": HELMET_DATASET_DIR,
        "class_map": HELMET_CLASS_MAP,
        "file_prefix": "helmet_",
    },
    {
        "name": "fire",
        "dataset_dir": FIRE_SMOKEDATASET_DIR,
        "class_map": FIRE_SMOKE_CLASS_MAP,
        "file_prefix": "fire_",
    },
]

# 图片扩展名过滤
IMAGE_SUFFIX: str = ".jpg"

# 模块级标记：Windows 下首次软链接失败后置为 False，后续全部走复制
_SYMLINK_AVAILABLE: bool = True


# ===================== 函数实现 =====================

def ensure_output_dirs() -> None:
    """创建合并数据集的输出目录结构。

    在 MERGED_DATASET_DIR 下创建 images/<split> 与 labels/<split> 子目录。
    已存在的目录不会被覆盖。

    Raises:
        OSError: 目录创建失败时抛出，错误信息包含目标路径。
    """
    for split in SPLITS:
        for sub in ("images", "labels"):
            target_dir = MERGED_DATASET_DIR / sub / split
            try:
                target_dir.mkdir(parents=True, exist_ok=True)
            except OSError as exc:
                raise OSError(f"创建输出目录失败: {target_dir} ({exc})") from exc


def remap_label_line(line: str, class_map: dict[int, int]) -> str | None:
    """重映射单行 YOLO 标签。

    解析 "class_id x_center y_center w h" 格式的行，将 class_id 按映射表替换。
    空行、字段数不为 5、class_id 非整数或不在映射表中的行视为无法解析。

    Args:
        line: 单行标签文本。
        class_map: 原始类别 ID 到合并后类别 ID 的映射表。

    Returns:
        重映射后的行文本（末尾带换行符）；无法解析时返回 None。
    """
    stripped = line.strip()
    if not stripped:
        return None
    parts = stripped.split()
    if len(parts) != 5:
        return None
    try:
        orig_class = int(parts[0])
    except ValueError:
        return None
    if orig_class not in class_map:
        return None
    new_class = class_map[orig_class]
    return f"{new_class} {parts[1]} {parts[2]} {parts[3]} {parts[4]}\n"


def remap_label_file(src_label_path: Path, dst_label_path: Path,
                     class_map: dict[int, int]) -> int:
    """读取原标签文件、重映射类别后写入新标签文件。

    Args:
        src_label_path: 原始标签文件路径。
        dst_label_path: 输出标签文件路径。
        class_map: 类别重映射表。

    Returns:
        写入的有效标签行数。

    Raises:
        OSError: 读取或写入文件失败时抛出，错误信息包含具体路径。
    """
    try:
        raw_text = src_label_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise OSError(f"读取标签文件失败: {src_label_path} ({exc})") from exc

    remapped: list[str] = []
    for line in raw_text.splitlines():
        new_line = remap_label_line(line, class_map)
        if new_line is not None:
            remapped.append(new_line)

    try:
        dst_label_path.write_text("".join(remapped), encoding="utf-8")
    except OSError as exc:
        raise OSError(f"写入标签文件失败: {dst_label_path} ({exc})") from exc

    return len(remapped)


def link_or_copy_image(src_image_path: Path, dst_image_path: Path) -> str:
    """创建图片软链接，失败时降级为复制。

    使用模块级 _SYMLINK_AVAILABLE 标记：首次软链接失败后将其置为 False，
    后续调用直接走复制路径，避免反复抛异常。降级仅打印一次警告。

    注意：某些环境（如沙盒或受限权限）下 os.symlink 可能静默返回成功
    但实际未创建链接。因此调用后必须用 is_symlink() 验证目标确实存在，
    验证失败时同样进入降级路径。

    Args:
        src_image_path: 原始图片路径。
        dst_image_path: 输出图片路径。

    Returns:
        'link' 表示软链接成功；'copy' 表示降级复制成功。

    Raises:
        OSError: 软链接与复制均失败时抛出，错误信息包含源与目标路径。
    """
    global _SYMLINK_AVAILABLE

    if _SYMLINK_AVAILABLE:
        try:
            dst_image_path.unlink(missing_ok=True)
            os.symlink(src_image_path, dst_image_path)
            # 验证软链接确实创建成功（防御静默失败环境）
            if dst_image_path.is_symlink() and dst_image_path.exists():
                return "link"
            # 静默失败：清理可能残留的空文件，进入降级路径
            dst_image_path.unlink(missing_ok=True)
            _SYMLINK_AVAILABLE = False
            print(
                "[警告] os.symlink 未抛异常但软链接实际未创建（可能受沙盒"
                "或权限限制），已降级为复制模式，后续图片均复制。",
                file=sys.stderr,
            )
        except OSError as exc:
            _SYMLINK_AVAILABLE = False
            print(
                "[警告] 创建软链接失败，已降级为复制模式（后续图片均复制）。"
                f"原因: {exc}",
                file=sys.stderr,
            )

    try:
        dst_image_path.unlink(missing_ok=True)
        shutil.copy2(src_image_path, dst_image_path)
        return "copy"
    except OSError as exc:
        raise OSError(
            f"复制图片失败: {src_image_path} -> {dst_image_path} ({exc})"
        ) from exc


def process_split(source_config: SourceConfig, split: str, stats: Stats) -> None:
    """处理单个源数据集的单个 split。

    遍历源图片目录中的 .jpg 文件，对每张图片：
      1. 检查对应标签文件是否存在，不存在则跳过并计入 skipped；
      2. 重映射标签并写入输出目录；
      3. 软链接/复制图片到输出目录（图片失败时回滚已写标签）；
      4. 更新 stats 中的计数。

    Args:
        source_config: 源数据集配置。
        split: 数据集划分名称（train 或 val）。
        stats: 统计字典，函数内就地更新 images/labels/skipped/link_count/copy_count。

    Note:
        单张图片处理过程中的非致命错误会被打印为警告并计入 skipped，
        不中断整体流程。
    """
    name = source_config["name"]
    src_img_dir = source_config["dataset_dir"] / "images" / split
    src_lbl_dir = source_config["dataset_dir"] / "labels" / split
    dst_img_dir = MERGED_DATASET_DIR / "images" / split
    dst_lbl_dir = MERGED_DATASET_DIR / "labels" / split
    prefix = source_config["file_prefix"]
    class_map = source_config["class_map"]

    split_stats = stats["sources"][name][split]

    if not src_img_dir.is_dir():
        print(f"[警告] 源图片目录不存在，跳过该 split: {src_img_dir}", file=sys.stderr)
        return

    for img_path in sorted(src_img_dir.iterdir()):
        if not img_path.is_file():
            continue
        if img_path.suffix.lower() != IMAGE_SUFFIX:
            continue

        stem = img_path.stem
        suffix = img_path.suffix
        src_label_path = src_lbl_dir / f"{stem}.txt"

        # 无标注则跳过该图片
        if not src_label_path.is_file():
            split_stats["skipped"] += 1
            continue

        dst_img_path = dst_img_dir / f"{prefix}{stem}{suffix}"
        dst_label_path = dst_lbl_dir / f"{prefix}{stem}.txt"

        # 写标签
        try:
            remap_label_file(src_label_path, dst_label_path, class_map)
        except OSError as exc:
            print(f"[警告] {exc}", file=sys.stderr)
            split_stats["skipped"] += 1
            continue

        # 写图片，失败则回滚标签
        try:
            result = link_or_copy_image(img_path, dst_img_path)
        except OSError as exc:
            print(f"[警告] 图片处理失败，回滚已写标签: {exc}", file=sys.stderr)
            try:
                dst_label_path.unlink(missing_ok=True)
            except OSError:
                pass
            split_stats["skipped"] += 1
            continue

        split_stats["images"] += 1
        split_stats["labels"] += 1
        if result == "link":
            stats["link_count"] += 1
        else:
            stats["copy_count"] += 1


def write_dataset_yaml() -> None:
    """写入合并数据集的 dataset.yaml 配置文件。

    path 字段使用相对路径 '.'，train/val 指向 images 子目录，
    names 字段列出全部 4 个类别。

    Raises:
        OSError: 写入文件失败时抛出，错误信息包含目标路径。
    """
    yaml_path = MERGED_DATASET_DIR / "dataset.yaml"
    lines: list[str] = [
        "path: .",
        "train: images/train",
        "val: images/val",
        "names:",
    ]
    for cls_id, cls_name in CLASS_NAMES.items():
        lines.append(f"  {cls_id}: {cls_name}")
    content = "\n".join(lines) + "\n"
    try:
        yaml_path.write_text(content, encoding="utf-8")
    except OSError as exc:
        raise OSError(f"写入 dataset.yaml 失败: {yaml_path} ({exc})") from exc


def print_stats(stats: Stats) -> None:
    """打印合并统计信息到控制台。

    按源数据集、split 输出图片/标签/跳过计数，再输出合并总数与
    软链接/复制计数。

    Args:
        stats: 已完成的统计字典。
    """
    sep = "=" * 60
    print(sep)
    print("合并数据集统计")
    print(sep)

    for source in SOURCE_CONFIGS:
        name = source["name"]
        print(f"\n[{name}]")
        for split in SPLITS:
            s = stats["sources"][name][split]
            print(f"  {split}: 图片={s['images']} 标签={s['labels']} 跳过={s['skipped']}")

    print("\n[合并总数]")
    for split in SPLITS:
        print(f"  {split}: {stats['totals'][split]}")

    print("\n[图片复用方式]")
    print(f"  软链接成功: {stats['link_count']}")
    print(f"  降级复制: {stats['copy_count']}")
    print(sep)


def _init_stats() -> Stats:
    """初始化统计字典结构。

    Returns:
        填充零值的 Stats 字典。
    """
    return Stats(
        sources={
            cfg["name"]: {
                split: SplitStats(images=0, labels=0, skipped=0)
                for split in SPLITS
            }
            for cfg in SOURCE_CONFIGS
        },
        totals={split: 0 for split in SPLITS},
        link_count=0,
        copy_count=0,
    )


def main() -> None:
    """主流程：校验源目录、准备输出目录、遍历源处理 splits、写 yaml、打印统计。

    Raises:
        SystemExit: 源数据集目录不存在时以非零状态退出。
    """
    # 校验源目录存在
    for source in SOURCE_CONFIGS:
        if not source["dataset_dir"].is_dir():
            print(
                f"[错误] 源数据集目录不存在: {source['dataset_dir']}",
                file=sys.stderr,
            )
            sys.exit(1)

    # 准备输出目录
    ensure_output_dirs()

    # 初始化统计
    stats: Stats = _init_stats()

    # 遍历每个源的每个 split
    for source in SOURCE_CONFIGS:
        for split in SPLITS:
            process_split(source, split, stats)

    # 计算合并总数（按图片数）
    for split in SPLITS:
        total = 0
        for source in SOURCE_CONFIGS:
            total += stats["sources"][source["name"]][split]["images"]
        stats["totals"][split] = total

    # 写 dataset.yaml
    write_dataset_yaml()

    # 打印统计
    print_stats(stats)


if __name__ == "__main__":
    main()

"""
合并数据集上的 YOLO 单模型训练。

本脚本基于 Ultralytics YOLO API，在 deeplearn/merged_dataset/dataset.yaml
所描述的合并数据集（4 类：helmet / no_helmet / fire / smoke）上训练单一目标检测模型。
支持通过命令行参数调整训练轮数、batch size、图像尺寸、设备、基础模型与运行名。

运行环境：本机 conda 环境 yolov8（已安装 CUDA 与 ultralytics）。
    conda activate yolov8
    python deeplearn/train.py

修改说明：
    - 适配本机硬件（4090 GPU + CUDA）：默认 device 由 cpu 改为 0，
      默认 epochs 由 50 提升至 120（满足至少 120 轮的要求）。
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

from ultralytics import YOLO


# ---------------------------------------------------------------------------
# 路径常量（基于本文件位置推导，避免依赖运行时工作目录）
# ---------------------------------------------------------------------------

PROJECT_ROOT: Path = Path(__file__).resolve().parent
DATASET_YAML: Path = PROJECT_ROOT / "merged_dataset" / "dataset.yaml"
OUTPUT_ROOT: Path = PROJECT_ROOT / "runs" / "detect"

# ---------------------------------------------------------------------------
# 默认训练参数
# ---------------------------------------------------------------------------

DEFAULT_EPOCHS: int = 120
DEFAULT_BATCH: int = 16
DEFAULT_IMGSZ: int = 640
DEFAULT_DEVICE: str = "0"
DEFAULT_MODEL: str = "yolo26m.pt"
DEFAULT_NAME: str = "unified_detect"

# results.csv 中需要打印的末轮关键指标列名
SUMMARY_METRIC_COLUMNS: tuple[str, ...] = (
    "epoch",
    "metrics/precision(B)",
    "metrics/recall(B)",
    "metrics/mAP50(B)",
    "metrics/mAP50-95(B)",
)


def parse_args() -> argparse.Namespace:
    """解析命令行参数。

    Returns:
        argparse.Namespace: 包含 epochs、batch、imgsz、device、model、name 字段的命名空间。
    """
    parser = argparse.ArgumentParser(
        description="在合并数据集上训练 YOLO 目标检测模型",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=DEFAULT_EPOCHS,
        help=f"训练轮数（默认 {DEFAULT_EPOCHS}）",
    )
    parser.add_argument(
        "--batch",
        type=int,
        default=DEFAULT_BATCH,
        help=f"batch size（默认 {DEFAULT_BATCH}）",
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=DEFAULT_IMGSZ,
        help=f"推理图像尺寸（默认 {DEFAULT_IMGSZ}）",
    )
    parser.add_argument(
        "--device",
        type=str,
        default=DEFAULT_DEVICE,
        help=f"推理设备，例如 cpu、0、0,1（默认 {DEFAULT_DEVICE}）",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=DEFAULT_MODEL,
        help=f"基础预训练模型路径（默认 {DEFAULT_MODEL}）",
    )
    parser.add_argument(
        "--name",
        type=str,
        default=DEFAULT_NAME,
        help=f"训练运行名，影响输出目录名（默认 {DEFAULT_NAME}）",
    )
    return parser.parse_args()


def validate_inputs(model_path: str, dataset_yaml: Path) -> None:
    """校验预训练模型文件与数据集 yaml 是否存在。

    Args:
        model_path: 预训练模型文件路径。
        dataset_yaml: 数据集 yaml 路径。

    Raises:
        SystemExit: 当模型文件或数据集 yaml 不存在时，打印清晰错误并以退出码 1 结束。
    """
    model_file = Path(model_path)
    if not model_file.is_file():
        print(
            f"[错误] 预训练模型文件不存在: {model_file}\n"
            f"请通过 --model 参数指定有效的 .pt 文件路径。",
            file=sys.stderr,
        )
        sys.exit(1)

    if not dataset_yaml.is_file():
        print(
            f"[错误] 数据集配置文件不存在: {dataset_yaml}\n"
            f"请先运行数据集合并脚本生成 merged_dataset/dataset.yaml。",
            file=sys.stderr,
        )
        sys.exit(1)


def train_model(args: argparse.Namespace) -> Path:
    """调用 Ultralytics YOLO 完成训练。

    Args:
        args: 命令行参数命名空间，需包含 model、epochs、batch、imgsz、device、name 字段。

    Returns:
        Path: 训练产物 best.pt 的预期路径。
    """
    model = YOLO(args.model)
    model.train(
        data=str(DATASET_YAML),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        device=args.device,
        name=args.name,
        project=str(OUTPUT_ROOT),
    )
    return OUTPUT_ROOT / args.name / "weights" / "best.pt"


def print_final_summary(run_dir: Path) -> None:
    """打印 best.pt 路径与 results.csv 末轮关键指标。

    若 results.csv 不存在、为空或缺少所需列，则仅打印 best.pt 路径，不抛出异常。

    Args:
        run_dir: 训练运行目录，例如 OUTPUT_ROOT / <name>。
    """
    best_pt = run_dir / "weights" / "best.pt"
    print("\n========== 训练完成 ==========")
    print(f"best.pt 路径: {best_pt}")

    results_csv = run_dir / "results.csv"
    if not results_csv.is_file():
        print(f"[提示] 未找到 results.csv: {results_csv}，跳过指标打印。")
        return

    last_row = _read_last_csv_row(results_csv)
    if last_row is None:
        print("[提示] results.csv 为空，跳过指标打印。")
        return

    print("末轮关键指标:")
    for column in SUMMARY_METRIC_COLUMNS:
        if column in last_row:
            print(f"  {column}: {last_row[column]}")


def _read_last_csv_row(csv_path: Path) -> dict[str, str] | None:
    """读取 CSV 文件最后一行，返回去除列名首尾空白后的列名-值映射。

    Args:
        csv_path: CSV 文件路径。

    Returns:
        dict[str, str] | None: 最后一行的列名-值映射；文件无数据行时返回 None。
    """
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        return None
    raw = rows[-1]
    return {
        key.strip(): value
        for key, value in raw.items()
        if key is not None
    }


def main() -> None:
    """主流程：解析参数 -> 校验输入 -> 训练 -> 打印汇总。"""
    args = parse_args()
    validate_inputs(args.model, DATASET_YAML)

    print(
        f"开始训练: model={args.model}, epochs={args.epochs}, "
        f"batch={args.batch}, imgsz={args.imgsz}, device={args.device}, "
        f"name={args.name}"
    )
    print(f"数据集: {DATASET_YAML}")
    print(f"输出目录: {OUTPUT_ROOT / args.name}")

    train_model(args)
    print_final_summary(OUTPUT_ROOT / args.name)


if __name__ == "__main__":
    main()

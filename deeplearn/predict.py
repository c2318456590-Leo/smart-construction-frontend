"""
初始版本：基于训练后的统一模型对图片/视频/目录执行推理验证。

本脚本加载 deeplearn/runs/detect/unified_detect/weights/best.pt 统一检测模型，
对用户指定的图片、视频或目录执行推理，将可视化结果保存至 deeplearn/runs/predict/，
并在控制台打印每张图（或每帧）的检测目标计数与类别分布。
"""

import argparse
import sys
from pathlib import Path

from ultralytics import YOLO
from ultralytics.engine.results import Results

# 项目根目录（web（智慧工地前端））
PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
# 默认权重路径：训练脚本生成的统一检测模型
DEFAULT_WEIGHTS: Path = Path(__file__).resolve().parent / "runs" / "detect" / "unified_detect" / "weights" / "best.pt"
# 推理结果输出根目录
OUTPUT_ROOT: Path = Path(__file__).resolve().parent / "runs" / "predict"
# 默认置信度阈值
DEFAULT_CONF: float = 0.4
# 推理结果保存子目录名
PREDICT_NAME: str = "predict"
# 类别索引到名称的映射（与训练数据集 data.yaml 保持一致）
CLASS_NAMES: dict[int, str] = {
    0: "helmet",
    1: "no_helmet",
    2: "fire",
    3: "smoke",
}


def parse_args() -> argparse.Namespace:
    """解析命令行参数。

    Returns:
        argparse.Namespace: 包含 source、weights、conf 字段的命名空间对象。
    """
    parser = argparse.ArgumentParser(
        description="基于训练后的统一 YOLO 模型对图片/视频/目录执行推理验证"
    )
    parser.add_argument(
        "--source",
        type=str,
        required=True,
        help="推理输入源：图片 / 视频 / 目录路径",
    )
    parser.add_argument(
        "--weights",
        type=str,
        default=str(DEFAULT_WEIGHTS),
        help=f"模型权重路径（默认：{DEFAULT_WEIGHTS}）",
    )
    parser.add_argument(
        "--conf",
        type=float,
        default=DEFAULT_CONF,
        help=f"置信度阈值（默认：{DEFAULT_CONF}）",
    )
    return parser.parse_args()


def validate_inputs(weights_path: Path, source_path: Path) -> None:
    """校验权重文件与推理源是否存在，不存在则打印清晰错误并退出。

    Args:
        weights_path: 模型权重文件路径。
        source_path: 推理输入源路径（图片 / 视频 / 目录）。

    Exits:
        当权重文件或推理源不存在时，以状态码 1 退出进程。
    """
    if not weights_path.exists():
        print(f"[错误] 权重文件不存在: {weights_path}")
        print("请先运行训练脚本生成 best.pt，或通过 --weights 指定正确路径。")
        sys.exit(1)
    if not source_path.exists():
        print(f"[错误] 推理源不存在: {source_path}")
        print("请检查 --source 参数是否指向有效的图片 / 视频 / 目录路径。")
        sys.exit(1)


def _print_result_summary(results: list[Results]) -> None:
    """打印每张图（或每帧）的检测目标计数与类别分布。

    Args:
        results: Ultralytics YOLO predict 返回的结果列表。
    """
    for index, result in enumerate(results):
        boxes = result.boxes
        if boxes is None or len(boxes) == 0:
            print(f"[{index}] 未检测到目标")
            continue

        cls_ids = boxes.cls.tolist()
        class_counts: dict[str, int] = {}
        for cls_id in cls_ids:
            name = CLASS_NAMES.get(int(cls_id), f"class_{int(cls_id)}")
            class_counts[name] = class_counts.get(name, 0) + 1

        distribution = ", ".join(f"{name}={count}" for name, count in class_counts.items())
        print(f"[{index}] 共检测到 {len(cls_ids)} 个目标 | 类别分布: {distribution}")


def run_predict(args: argparse.Namespace) -> None:
    """调用 Ultralytics YOLO 执行推理并保存可视化结果。

    Args:
        args: 命名空间对象，需包含 source、weights、conf 字段。
    """
    weights_path = Path(args.weights)
    source_path = Path(args.source)
    validate_inputs(weights_path, source_path)

    print(f"[信息] 加载模型: {weights_path}")
    model = YOLO(str(weights_path))

    print(f"[信息] 推理源: {source_path}")
    print(f"[信息] 置信度阈值: {args.conf}")
    results = model.predict(
        source=str(source_path),
        conf=args.conf,
        save=True,
        project=str(OUTPUT_ROOT),
        name=PREDICT_NAME,
        exist_ok=True,
    )

    _print_result_summary(results)
    save_dir = OUTPUT_ROOT / PREDICT_NAME
    print(f"[完成] 可视化结果已保存至: {save_dir}")


def main() -> None:
    """脚本主流程：解析参数 -> 校验输入 -> 执行推理 -> 打印结果。"""
    args = parse_args()
    run_predict(args)


if __name__ == "__main__":
    main()

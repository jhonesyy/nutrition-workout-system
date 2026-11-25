"""
Central configuration for the Nutrition and Workout AI Platform.
Hardware target: AMD Ryzen 5 5600X + NVIDIA GTX 1650 4GB.
Model: DistilGPT-2 + LoRA fine-tuning.
"""

from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional
import torch

BASE_DIR = Path(__file__).parent.resolve()
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"
LOGS_DIR = BASE_DIR / "logs"
CHECKPOINTS_DIR = MODELS_DIR / "checkpoints"
for directory in [DATA_DIR, MODELS_DIR, LOGS_DIR, CHECKPOINTS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

CUDA_AVAILABLE = torch.cuda.is_available()
DEVICE = "cuda" if CUDA_AVAILABLE else "cpu"
GPU_NAME = torch.cuda.get_device_name(0) if CUDA_AVAILABLE else "CPU"
GPU_MEMORY_GB = (
    torch.cuda.get_device_properties(0).total_memory / 1024**3
    if CUDA_AVAILABLE
    else 0.0
)

print("=" * 55)
print("NUTRITION AI - HARDWARE DETECTION")
print("=" * 55)
print("Device:", DEVICE)
print("GPU:", GPU_NAME)
print("GPU Memory:", round(GPU_MEMORY_GB, 2), "GB")
print("=" * 55)


@dataclass
class TrainingConfig:
    # Model
    model_name_or_path: str = "distilgpt2"
    train_from_scratch: bool = False
    use_lora: bool = True

    # Dataset
    train_file: Optional[str] = None
    validation_split: float = 0.10
    test_split: float = 0.05
    max_seq_length: int = 256
    text_column: str = "text"
    prompt_column: str = "prompt"
    completion_column: str = "completion"

    # Training (tuned for 4GB VRAM)
    num_epochs: int = 3
    batch_size: int = 1
    gradient_accumulation_steps: int = 8
    learning_rate: float = 2e-5
    weight_decay: float = 0.01
    warmup_ratio: float = 0.03
    max_grad_norm: float = 1.0
    lr_scheduler_type: str = "cosine"

    # Logging / checkpoints
    logging_steps: int = 5
    save_steps: int = 50
    eval_steps: int = 50
    save_total_limit: int = 2
    output_dir: str = str(MODELS_DIR / "nutrition-demo-v3")
    run_name: str = "nutrition-workout-lora-v3"

    # Hardware
    fp16: bool = CUDA_AVAILABLE
    bf16: bool = False
    gradient_checkpointing: bool = True
    dataloader_num_workers: int = 0
    dataloader_pin_memory: bool = CUDA_AVAILABLE

    # LoRA
    lora_r: int = 8
    lora_alpha: int = 16
    lora_dropout: float = 0.05
    lora_target_modules: List[str] = field(
        default_factory=lambda: ["c_attn", "c_proj"]
    )

    # Misc
    seed: int = 42
    push_to_hub: bool = False


default_config = TrainingConfig()


def validate_config(config: TrainingConfig):
    if config.num_epochs < 1:
        raise ValueError("Epochs must be at least 1.")
    if config.batch_size < 1:
        raise ValueError("Batch size must be at least 1.")
    if config.max_seq_length < 2:
        raise ValueError("Sequence length must be at least 2.")
    if config.gradient_accumulation_steps < 1:
        raise ValueError("Gradient accumulation must be positive.")
    if not 0 <= config.validation_split < 1:
        raise ValueError("Validation split must be between 0 and 1.")
    if not 0 <= config.test_split < 1:
        raise ValueError("Test split must be between 0 and 1.")
    if config.validation_split + config.test_split >= 1:
        raise ValueError("Validation and test splits must total less than 1.")
    if config.fp16 and not CUDA_AVAILABLE:
        config.fp16 = False
    if config.bf16 and not CUDA_AVAILABLE:
        config.bf16 = False
    if config.fp16 and config.bf16:
        raise ValueError("FP16 and BF16 cannot both be enabled.")
    if config.bf16 and CUDA_AVAILABLE and not torch.cuda.is_bf16_supported():
        raise ValueError("This GPU does not support BF16.")
    if config.lora_r < 1:
        raise ValueError("LoRA rank must be positive.")
    return True


validate_config(default_config)


def print_config(config=default_config):
    print("\n" + "=" * 55)
    print("TRAINING CONFIGURATION")
    print("=" * 55)
    print("Model:", config.model_name_or_path)
    print("Device:", DEVICE)
    print("GPU:", GPU_NAME)
    print("LoRA:", config.use_lora)
    print("Epochs:", config.num_epochs)
    print("Batch size:", config.batch_size)
    print("Effective batch size:", config.batch_size * config.gradient_accumulation_steps)
    print("Learning rate:", config.learning_rate)
    print("Sequence length:", config.max_seq_length)
    print("FP16:", config.fp16)
    print("Gradient checkpointing:", config.gradient_checkpointing)
    print("DataLoader pin memory:", config.dataloader_pin_memory)
    print("LoRA rank:", config.lora_r)
    print("LoRA alpha:", config.lora_alpha)
    print("Output:", config.output_dir)
    print("=" * 55)


if __name__ == "__main__":
    print_config()
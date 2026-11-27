
"""
Central configuration for NutriFit AI Training Platform.
"""

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"
LOGS_DIR = BASE_DIR / "logs"

for directory in (DATA_DIR, MODELS_DIR, LOGS_DIR):
    directory.mkdir(parents=True, exist_ok=True)


@dataclass
class TrainingConfig:
    model_name_or_path: str = "distilgpt2"
    train_from_scratch: bool = False

    num_epochs: int = 3
    batch_size: int = 1
    learning_rate: float = 2e-5
    max_seq_length: int = 512

    validation_split: float = 0.1
    test_split: float = 0.1
    seed: int = 42

    use_lora: bool = True
    lora_r: int = 8
    lora_alpha: int = 16
    lora_dropout: float = 0.05
    lora_target_modules: List[str] = field(
        default_factory=lambda: ["c_attn", "c_proj"]
    )

    fp16: bool = True
    bf16: bool = False
    gradient_checkpointing: bool = True
    gradient_accumulation_steps: int = 8

    weight_decay: float = 0.01
    lr_scheduler_type: str = "cosine"
    warmup_ratio: float = 0.05
    max_grad_norm: float = 1.0

    logging_steps: int = 10
    save_steps: int = 250
    save_total_limit: int = 2
    eval_steps: int = 250
    run_name: str = "custom-run"

    dataloader_num_workers: int = 0
    dataloader_pin_memory: bool = True

    output_dir: Optional[str] = None

    def __post_init__(self):
        if self.num_epochs <= 0:
            raise ValueError("num_epochs must be greater than zero.")

        if self.batch_size <= 0:
            raise ValueError("batch_size must be greater than zero.")

        if self.learning_rate <= 0:
            raise ValueError("learning_rate must be greater than zero.")

        if self.max_seq_length <= 0:
            raise ValueError("max_seq_length must be greater than zero.")

        if self.validation_split < 0 or self.test_split < 0:
            raise ValueError("Dataset splits cannot be negative.")

        if self.validation_split + self.test_split >= 1:
            raise ValueError(
                "validation_split + test_split must be less than 1."
            )

        if self.output_dir is None:
            self.output_dir = str(MODELS_DIR / self.run_name)

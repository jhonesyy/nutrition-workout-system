"""
Central configuration for the AI Training Platform.
All paths, hyperparameters, and defaults live here.
"""

from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional
import torch

# ------------------------------------------------------------------
# Paths
# ------------------------------------------------------------------
BASE_DIR = Path(__file__).parent.resolve()
DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"
LOGS_DIR = BASE_DIR / "logs"
CHECKPOINTS_DIR = MODELS_DIR / "checkpoints"

# Create directories automatically
for d in [DATA_DIR, MODELS_DIR, LOGS_DIR, CHECKPOINTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)


@dataclass
class TrainingConfig:
    # Model
    model_name_or_path: str = "distilgpt2"          # small & fast for testing
    # Alternatives: "gpt2", "microsoft/phi-2", "TinyLlama/TinyLlama-1.1B-Chat-v1.0"
    # For serious work use larger models + LoRA

    # Training mode
    train_from_scratch: bool = False                # True = random weights (not recommended)
    use_lora: bool = True                           # Parameter-efficient fine-tuning (recommended)

    # Data
    train_file: Optional[str] = None
    validation_split: float = 0.1
    test_split: float = 0.05
    max_seq_length: int = 512
    text_column: str = "text"                       # for plain text / JSONL
    prompt_column: str = "prompt"                   # for instruction datasets
    completion_column: str = "completion"

    # Hyperparameters
    num_epochs: int = 3
    batch_size: int = 4
    gradient_accumulation_steps: int = 4
    learning_rate: float = 2e-5
    weight_decay: float = 0.01
    warmup_ratio: float = 0.03
    max_grad_norm: float = 1.0
    lr_scheduler_type: str = "cosine"

    # Logging & saving
    logging_steps: int = 10
    save_steps: int = 100
    eval_steps: int = 100
    save_total_limit: int = 3
    output_dir: str = str(MODELS_DIR / "finetuned")
    run_name: str = "custom-finetune"

    # Hardware
    fp16: bool = torch.cuda.is_available()
    bf16: bool = False
    gradient_checkpointing: bool = True
    dataloader_num_workers: int = 2

    # LoRA specific
    lora_r: int = 16
    lora_alpha: int = 32
    lora_dropout: float = 0.05
    lora_target_modules: List[str] = field(default_factory=lambda: ["c_attn", "c_proj"])

    # Misc
    seed: int = 42
    push_to_hub: bool = False


# Global default instance
default_config = TrainingConfig()
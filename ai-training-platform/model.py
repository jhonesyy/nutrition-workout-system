"""
Model loading, LoRA setup, and saving utilities.
"""

import logging
from pathlib import Path
from typing import Optional, Tuple

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    PreTrainedModel,
    PreTrainedTokenizerBase,
)
from peft import LoraConfig, get_peft_model, PeftModel, TaskType

from config import TrainingConfig

logger = logging.getLogger(__name__)


def get_device() -> torch.device:
    if torch.cuda.is_available():
        device = torch.device("cuda")
        logger.info(f"Using GPU: {torch.cuda.get_device_name(0)}")
    else:
        device = torch.device("cpu")
        logger.info("Using CPU")
    return device


def load_tokenizer(model_name_or_path: str) -> PreTrainedTokenizerBase:
    tokenizer = AutoTokenizer.from_pretrained(
        model_name_or_path,
        trust_remote_code=True,
        use_fast=True,
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id
    tokenizer.padding_side = "right"
    return tokenizer


def load_base_model(
    config: TrainingConfig,
    device: Optional[torch.device] = None,
) -> Tuple[PreTrainedModel, PreTrainedTokenizerBase]:
    """
    Load either a pretrained model (for fine-tuning)
    or a randomly initialized model (train from scratch).
    """
    device = device or get_device()
    tokenizer = load_tokenizer(config.model_name_or_path)

    if config.train_from_scratch:
        logger.warning(
            "TRAINING FROM SCRATCH selected. "
            "This requires enormous data and compute. Prefer fine-tuning."
        )
        from transformers import AutoConfig
        model_config = AutoConfig.from_pretrained(config.model_name_or_path)
        model = AutoModelForCausalLM.from_config(model_config)
    else:
        logger.info(f"Loading pretrained model: {config.model_name_or_path}")
        model = AutoModelForCausalLM.from_pretrained(
            config.model_name_or_path,
            torch_dtype=torch.float16 if config.fp16 else torch.float32,
            trust_remote_code=True,
            device_map="auto" if torch.cuda.is_available() else None,
        )

    if config.gradient_checkpointing:
        model.gradient_checkpointing_enable()

    # Apply LoRA if requested (only makes sense for fine-tuning)
    if config.use_lora and not config.train_from_scratch:
        logger.info("Applying LoRA adapters...")
        lora_config = LoraConfig(
            r=config.lora_r,
            lora_alpha=config.lora_alpha,
            lora_dropout=config.lora_dropout,
            target_modules=config.lora_target_modules,
            bias="none",
            task_type=TaskType.CAUSAL_LM,
        )
        model = get_peft_model(model, lora_config)
        model.print_trainable_parameters()

    model.config.pad_token_id = tokenizer.pad_token_id
    return model, tokenizer


def save_model_and_tokenizer(
    model: PreTrainedModel,
    tokenizer: PreTrainedTokenizerBase,
    output_dir: str,
    is_lora: bool = False,
):
    path = Path(output_dir)
    path.mkdir(parents=True, exist_ok=True)

    logger.info(f"Saving model to {path}")
    model.save_pretrained(path)
    tokenizer.save_pretrained(path)

    # Also save a small metadata file
    meta = {
        "is_lora": is_lora,
        "base_model": getattr(model.config, "_name_or_path", "unknown"),
    }
    import json
    with open(path / "training_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    logger.info("Model and tokenizer saved successfully")


def load_trained_model(
    model_dir: str,
    device: Optional[torch.device] = None,
) -> Tuple[PreTrainedModel, PreTrainedTokenizerBase]:
    """Load a previously fine-tuned model (supports both full and LoRA)."""
    device = device or get_device()
    path = Path(model_dir)

    tokenizer = load_tokenizer(str(path))

    # Try loading as PEFT/LoRA first
    try:
        from peft import PeftConfig
        peft_config = PeftConfig.from_pretrained(path)
        base_model = AutoModelForCausalLM.from_pretrained(
            peft_config.base_model_name_or_path,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            device_map="auto" if torch.cuda.is_available() else None,
            trust_remote_code=True,
        )
        model = PeftModel.from_pretrained(base_model, path)
        logger.info(f"Loaded LoRA model from {path}")
    except Exception:
        model = AutoModelForCausalLM.from_pretrained(
            path,
            torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32,
            device_map="auto" if torch.cuda.is_available() else None,
            trust_remote_code=True,
        )
        logger.info(f"Loaded full model from {path}")

    model.eval()
    return model, tokenizer
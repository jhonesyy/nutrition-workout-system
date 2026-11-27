
"""
Model loading, LoRA setup, and saving utilities.
Supports pretrained models, LoRA adapters, and full fine-tuned models.
"""

import json
import logging
from pathlib import Path
from typing import Optional, Tuple

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    PreTrainedModel,
    PreTrainedTokenizerBase,
    AutoConfig,
)
from peft import (
    LoraConfig,
    get_peft_model,
    PeftModel,
    PeftConfig,
    TaskType,
)

from config import TrainingConfig

logger = logging.getLogger(__name__)


def get_device() -> torch.device:
    """Detect available computing device."""

    if torch.cuda.is_available():
        device = torch.device("cuda")
        logger.info("Using GPU: %s", torch.cuda.get_device_name(0))
    else:
        device = torch.device("cpu")
        logger.info("Using CPU")

    return device


def load_tokenizer(
    model_name_or_path: str
) -> PreTrainedTokenizerBase:

    tokenizer = AutoTokenizer.from_pretrained(
        model_name_or_path,
        trust_remote_code=True,
        use_fast=True,
    )

    if tokenizer.pad_token is None:
        if tokenizer.eos_token is None:
            raise ValueError(
                "Tokenizer has neither a padding token nor an EOS token."
            )

        tokenizer.pad_token = tokenizer.eos_token

    tokenizer.padding_side = "right"

    return tokenizer


def load_base_model(
    config: TrainingConfig,
    device: Optional[torch.device] = None,
) -> Tuple[PreTrainedModel, PreTrainedTokenizerBase]:
    """Load pretrained model for training and optionally apply LoRA."""

    device = device or get_device()

    tokenizer = load_tokenizer(config.model_name_or_path)

    if config.train_from_scratch:
        logger.warning("Training from scratch selected.")

        model_config = AutoConfig.from_pretrained(
            config.model_name_or_path
        )

        model = AutoModelForCausalLM.from_config(model_config)

    else:
        logger.info(
            "Loading pretrained model: %s",
            config.model_name_or_path
        )

        model = AutoModelForCausalLM.from_pretrained(
            config.model_name_or_path,
            torch_dtype=(
                torch.float16
                if config.fp16 and device.type == "cuda"
                else torch.float32
            ),
            trust_remote_code=True,
            device_map="auto" if device.type == "cuda" else None,
        )

    if config.gradient_checkpointing:
        model.gradient_checkpointing_enable()

    if config.use_lora and not config.train_from_scratch:
        logger.info("Applying LoRA adapters.")

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
    """Save trained model, tokenizer, and metadata."""

    path = Path(output_dir)
    path.mkdir(parents=True, exist_ok=True)

    logger.info("Saving model to %s", path)

    model.save_pretrained(path)
    tokenizer.save_pretrained(path)

    if is_lora:
        base_model_name = (
            model.peft_config["default"].base_model_name_or_path
        )
    else:
        base_model_name = getattr(
            model.config,
            "_name_or_path",
            "unknown"
        )

    metadata = {
        "is_lora": is_lora,
        "base_model": base_model_name,
    }

    with open(path / "training_meta.json", "w", encoding="utf-8") as file:
        json.dump(metadata, file, indent=2)

    logger.info("Model saved successfully.")


def load_trained_model(
    model_dir: str,
    device: Optional[torch.device] = None,
) -> Tuple[PreTrainedModel, PreTrainedTokenizerBase]:
    """
    Load either a LoRA adapter or a complete fine-tuned model.

    For LoRA adapters without tokenizer files, load tokenizer
    from the original base model.
    """

    device = device or get_device()
    path = Path(model_dir)

    if not path.exists():
        raise FileNotFoundError(
            f"Model directory does not exist: {path}"
        )

    if not path.is_dir():
        raise NotADirectoryError(
            f"Model path is not a directory: {path}"
        )

    adapter_config_path = path / "adapter_config.json"

    if adapter_config_path.exists():
        logger.info("LoRA adapter detected: %s", path)

        peft_config = PeftConfig.from_pretrained(str(path))

        base_model_name = peft_config.base_model_name_or_path

        if not base_model_name:
            raise ValueError(
                "LoRA adapter does not specify its base model."
            )

        # Prefer tokenizer stored beside adapter.
        # Otherwise load tokenizer from original base model.
        tokenizer_files = [
            "tokenizer.json",
            "tokenizer_config.json",
            "vocab.json",
            "spiece.model",
            "tokenizer.model",
        ]

        has_local_tokenizer = any(
            (path / filename).exists()
            for filename in tokenizer_files
        )

        tokenizer_source = (
            str(path) if has_local_tokenizer else base_model_name
        )

        logger.info("Loading tokenizer from: %s", tokenizer_source)

        tokenizer = load_tokenizer(tokenizer_source)

        logger.info("Loading original base model: %s", base_model_name)

        base_model = AutoModelForCausalLM.from_pretrained(
            base_model_name,
            torch_dtype=(
                torch.float16
                if device.type == "cuda"
                else torch.float32
            ),
            device_map="auto" if device.type == "cuda" else None,
            trust_remote_code=True,
        )

        model = PeftModel.from_pretrained(
            base_model,
            str(path),
            is_trainable=False,
        )

        logger.info("LoRA adapter loaded successfully.")

    else:
        logger.info("Loading full fine-tuned model: %s", path)

        tokenizer = load_tokenizer(str(path))

        model = AutoModelForCausalLM.from_pretrained(
            str(path),
            torch_dtype=(
                torch.float16
                if device.type == "cuda"
                else torch.float32
            ),
            device_map="auto" if device.type == "cuda" else None,
            trust_remote_code=True,
        )

    model.eval()

    if tokenizer.pad_token_id is not None:
        model.config.pad_token_id = tokenizer.pad_token_id

    logger.info("Model loading completed.")

    return model, tokenizer

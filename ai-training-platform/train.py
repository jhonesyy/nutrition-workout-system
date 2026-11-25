"""
AI Training Loop.
Optimized for NVIDIA GTX 1650 4GB.
Supports automatic checkpoint recovery.
Signature-safe TrainingArguments construction (works across transformers versions).
"""

import logging
import inspect
import math
from pathlib import Path

import torch

from transformers import (
    Trainer,
    TrainingArguments,
    default_data_collator,
)
from transformers.trainer_utils import get_last_checkpoint
from datasets import DatasetDict

from config import TrainingConfig
from model import load_base_model, save_model_and_tokenizer, get_device

logger = logging.getLogger(__name__)


def validate_dataset(datasets):
    if "train" not in datasets:
        raise ValueError("Training dataset is missing.")
    if len(datasets["train"]) == 0:
        raise ValueError("Training dataset is empty.")

    required_columns = {"input_ids", "attention_mask", "labels"}
    for split_name, dataset in datasets.items():
        if len(dataset) == 0:
            continue
        missing = required_columns - set(dataset.column_names)
        if missing:
            raise ValueError(f"{split_name} dataset missing columns: {sorted(missing)}")

    logger.info("Dataset validation successful.")


def print_gpu_information():
    if not torch.cuda.is_available():
        logger.warning("CUDA unavailable. Training on CPU.")
        return
    logger.info("GPU detected: %s", torch.cuda.get_device_name(0))
    total_memory = torch.cuda.get_device_properties(0).total_memory / 1024**3
    logger.info("Total GPU memory: %.2f GB", total_memory)
    torch.cuda.empty_cache()
    allocated = torch.cuda.memory_allocated(0) / 1024**3
    logger.info("Currently allocated GPU memory: %.2f GB", allocated)


def create_training_arguments(config, output_dir, has_validation, total_steps):
    """
    Build TrainingArguments safely by filtering every kwarg against the
    actual signature of the installed transformers version.
    """
    params = inspect.signature(TrainingArguments.__init__).parameters
    use_gpu = torch.cuda.is_available()

    candidate_kwargs = {
        "output_dir": str(output_dir),
        "num_train_epochs": config.num_epochs,
        "per_device_train_batch_size": config.batch_size,
        "gradient_accumulation_steps": config.gradient_accumulation_steps,
        "learning_rate": config.learning_rate,
        "weight_decay": config.weight_decay,
        "logging_steps": config.logging_steps,
        "save_steps": config.save_steps,
        "save_total_limit": config.save_total_limit,
        "fp16": bool(config.fp16 and use_gpu),
        "bf16": bool(config.bf16 and use_gpu),
        "seed": config.seed,
        "remove_unused_columns": True,
        "report_to": "none",
        "save_strategy": "steps",
        "gradient_checkpointing": config.gradient_checkpointing,
        "dataloader_num_workers": config.dataloader_num_workers,
        "dataloader_pin_memory": bool(config.dataloader_pin_memory and use_gpu),
        "lr_scheduler_type": config.lr_scheduler_type,
        "max_grad_norm": config.max_grad_norm,
        "run_name": config.run_name,
        "warmup_ratio": config.warmup_ratio,
    }

    # Eval strategy name differs across versions.
    if has_validation:
        if "eval_strategy" in params:
            candidate_kwargs["eval_strategy"] = "steps"
            candidate_kwargs["eval_steps"] = config.eval_steps
        elif "evaluation_strategy" in params:
            candidate_kwargs["evaluation_strategy"] = "steps"
            candidate_kwargs["eval_steps"] = config.eval_steps

    # Keep ONLY arguments the installed version actually accepts.
    supported = {k: v for k, v in candidate_kwargs.items() if k in params}

    # Fallback: if warmup_ratio is unsupported but warmup_steps is, convert it.
    if (
        "warmup_ratio" not in supported
        and "warmup_steps" in params
        and config.warmup_ratio > 0
    ):
        supported["warmup_steps"] = max(1, int(config.warmup_ratio * total_steps))

    logger.info("TrainingArguments keys used: %s", sorted(supported.keys()))
    return TrainingArguments(**supported)


def train_model(tokenized_datasets: DatasetDict, config: TrainingConfig) -> str:
    logger.info("=" * 60)
    logger.info("INITIALIZING AI TRAINING PLATFORM")
    logger.info("=" * 60)

    validate_dataset(tokenized_datasets)

    device = get_device()
    logger.info("Selected device: %s", device)
    print_gpu_information()

    model, tokenizer = load_base_model(config, device)

    if hasattr(model, "config"):
        model.config.use_cache = False

    if config.gradient_checkpointing and hasattr(model, "enable_input_require_grads"):
        model.enable_input_require_grads()

    data_collator = default_data_collator
    output_dir = Path(config.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    has_validation = (
        "validation" in tokenized_datasets
        and len(tokenized_datasets["validation"]) > 0
    )

    # Estimate total optimization steps for warmup fallback.
    train_len = len(tokenized_datasets["train"])
    effective_batch = max(1, config.batch_size * config.gradient_accumulation_steps)
    steps_per_epoch = max(1, math.ceil(train_len / effective_batch))
    total_steps = steps_per_epoch * config.num_epochs

    training_args = create_training_arguments(
        config, output_dir, has_validation, total_steps
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=(
            tokenized_datasets["validation"] if has_validation else None
        ),
        data_collator=data_collator,
    )

    logger.info("Training examples: %d", train_len)
    if has_validation:
        logger.info("Validation examples: %d", len(tokenized_datasets["validation"]))
    logger.info("Epochs: %s", config.num_epochs)
    logger.info("Batch size: %s", config.batch_size)
    logger.info("Gradient accumulation: %s", config.gradient_accumulation_steps)
    logger.info("FP16 enabled: %s", training_args.fp16)

    last_checkpoint = None
    if output_dir.exists():
        last_checkpoint = get_last_checkpoint(str(output_dir))

    if last_checkpoint:
        logger.info("Resuming training from checkpoint: %s", last_checkpoint)

    if last_checkpoint:
        train_result = trainer.train(resume_from_checkpoint=last_checkpoint)
    else:
        train_result = trainer.train()

    final_path = output_dir / "final"
    final_path.mkdir(parents=True, exist_ok=True)

    save_model_and_tokenizer(
        trainer.model,
        tokenizer,
        str(final_path),
        is_lora=(config.use_lora and not config.train_from_scratch),
    )

    metrics = train_result.metrics
    trainer.log_metrics("train", metrics)
    trainer.save_metrics("train", metrics)
    trainer.save_state()

    if has_validation:
        logger.info("Running final evaluation...")
        eval_metrics = trainer.evaluate()
        trainer.log_metrics("eval", eval_metrics)
        trainer.save_metrics("eval", eval_metrics)

    if hasattr(trainer.model, "config"):
        trainer.model.config.use_cache = True

    logger.info("=" * 60)
    logger.info("TRAINING COMPLETED SUCCESSFULLY")
    logger.info("Final model saved to: %s", final_path)
    logger.info("=" * 60)

    return str(final_path)
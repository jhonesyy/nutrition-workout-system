
"""
AI Training Loop
Compatible with older and newer Hugging Face Transformers versions.

Expected dataset columns:
- input_ids
- attention_mask
- labels

The dataset must already be tokenized and padded.
"""

import logging
import inspect
from pathlib import Path

import torch

from transformers import (
    Trainer,
    TrainingArguments,
    default_data_collator,
)

from datasets import DatasetDict

from config import TrainingConfig
from model import (
    load_base_model,
    save_model_and_tokenizer,
    get_device,
)

logger = logging.getLogger(__name__)


def validate_dataset(datasets):
    """Validate datasets before starting training."""

    if "train" not in datasets:
        raise ValueError("Training dataset is missing.")

    if len(datasets["train"]) == 0:
        raise ValueError("Training dataset is empty.")

    required_columns = {
        "input_ids",
        "attention_mask",
        "labels",
    }

    for split_name, dataset in datasets.items():

        if len(dataset) == 0:
            logger.warning(
                "%s dataset is empty. Skipping validation.",
                split_name,
            )
            continue

        missing = required_columns - set(dataset.column_names)

        if missing:
            raise ValueError(
                f"{split_name} dataset is missing columns: "
                f"{sorted(missing)}. "
                "Check preprocessing.py."
            )

    logger.info("Dataset validation successful.")


def create_training_arguments(config, output_dir, has_validation):
    """Create version-compatible TrainingArguments."""

    parameters = inspect.signature(
        TrainingArguments.__init__
    ).parameters

    training_kwargs = {
        "output_dir": str(output_dir),
        "num_train_epochs": config.num_epochs,
        "per_device_train_batch_size": config.batch_size,
        "gradient_accumulation_steps": (
            config.gradient_accumulation_steps
        ),
        "learning_rate": config.learning_rate,
        "weight_decay": config.weight_decay,
        "warmup_steps": 30,
        "logging_steps": 5,
        "save_steps": 50,
        "save_total_limit": 2,
        "fp16": (
            config.fp16
            and torch.cuda.is_available()
        ),
        "seed": config.seed,
        "remove_unused_columns": True,
    }

    if "per_device_eval_batch_size" in parameters:
        training_kwargs["per_device_eval_batch_size"] = (
            config.batch_size
        )

    if "report_to" in parameters:
        training_kwargs["report_to"] = "none"

    if "save_strategy" in parameters:
        training_kwargs["save_strategy"] = "steps"

    # Support old and new Transformers versions.
    if has_validation:

        if "eval_strategy" in parameters:
            training_kwargs["eval_strategy"] = "epoch"

        elif "evaluation_strategy" in parameters:
            training_kwargs["evaluation_strategy"] = "epoch"

    training_args = TrainingArguments(
        **training_kwargs
    )

    return training_args


def train_model(
    tokenized_datasets: DatasetDict,
    config: TrainingConfig,
) -> str:

    logger.info("Initializing AI training platform...")

    # Validate datasets.
    validate_dataset(tokenized_datasets)

    # Select device.
    device = get_device()

    logger.info("Using device: %s", device)

    # Load model and tokenizer.
    model, tokenizer = load_base_model(
        config,
        device,
    )

    # Use default collator because data is already padded
    # and labels are already generated.
    data_collator = default_data_collator

    # Prepare output directory.
    output_dir = Path(config.output_dir)
    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    # Check validation dataset.
    has_validation = (
        "validation" in tokenized_datasets
        and len(tokenized_datasets["validation"]) > 0
    )

    # Configure training.
    training_args = create_training_arguments(
        config,
        output_dir,
        has_validation,
    )

    # Initialize Trainer.
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_datasets["train"],
        eval_dataset=(
            tokenized_datasets["validation"]
            if has_validation
            else None
        ),
        data_collator=data_collator,
    )

    # Display training information.
    logger.info("=" * 50)
    logger.info("STARTING AI MODEL TRAINING")
    logger.info("=" * 50)

    logger.info(
        "Training examples: %s",
        len(tokenized_datasets["train"]),
    )

    if has_validation:
        logger.info(
            "Validation examples: %s",
            len(tokenized_datasets["validation"]),
        )

    logger.info(
        "Epochs: %s",
        config.num_epochs,
    )

    logger.info(
        "Batch size: %s",
        config.batch_size,
    )

    logger.info(
        "Learning rate: %s",
        config.learning_rate,
    )

    # Start training.
    train_result = trainer.train()

    # Save final model.
    final_path = output_dir / "final"

    final_path.mkdir(
        parents=True,
        exist_ok=True,
    )

    save_model_and_tokenizer(
        trainer.model,
        tokenizer,
        str(final_path),
        is_lora=(
            config.use_lora
            and not config.train_from_scratch
        ),
    )

    # Save training metrics.
    metrics = train_result.metrics

    trainer.log_metrics(
        "train",
        metrics,
    )

    trainer.save_metrics(
        "train",
        metrics,
    )

    trainer.save_state()

    # Evaluate after training.
    if has_validation:

        logger.info("Running final validation...")

        eval_metrics = trainer.evaluate()

        trainer.log_metrics(
            "eval",
            eval_metrics,
        )

        trainer.save_metrics(
            "eval",
            eval_metrics,
        )

    logger.info("=" * 50)
    logger.info("TRAINING COMPLETED SUCCESSFULLY")
    logger.info("Final model: %s", final_path)
    logger.info("=" * 50)

    return str(final_path)

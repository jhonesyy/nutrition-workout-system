
"""
Preprocessing and tokenization for causal language models.

Supports:
- Plain text datasets
- Instruction/completion datasets
- Padding masking
- Prompt masking
"""

import logging

from typing import Dict, List

from datasets import DatasetDict

from transformers import PreTrainedTokenizerBase


logger = logging.getLogger(__name__)


def tokenize_instruction_batch(
    examples,
    tokenizer,
    max_seq_length,
):

    prompts = examples["prompt"]
    completions = examples["completion"]

    input_ids_batch = []
    attention_batch = []
    labels_batch = []

    for prompt, completion in zip(prompts, completions):

        prefix = (
            "### Instruction:\n"
            f"{prompt}\n\n"
            "### Response:\n"
        )

        response = str(completion).strip()

        # Tokenize prefix and answer separately so the
        # instruction tokens can be excluded from the loss.
        prefix_ids = tokenizer(
            prefix,
            add_special_tokens=False,
        )["input_ids"]

        response_ids = tokenizer(
            response,
            add_special_tokens=False,
        )["input_ids"]

        eos_id = tokenizer.eos_token_id

        if eos_id is not None:
            response_ids = response_ids + [eos_id]

        # Ensure that at least one response token remains.
        if len(prefix_ids) >= max_seq_length:
            prefix_ids = prefix_ids[:max_seq_length - 1]

        remaining = max_seq_length - len(prefix_ids)

        response_ids = response_ids[:remaining]

        input_ids = prefix_ids + response_ids

        labels = (
            [-100] * len(prefix_ids)
            + response_ids.copy()
        )

        attention_mask = [1] * len(input_ids)

        padding_length = max_seq_length - len(input_ids)

        pad_id = tokenizer.pad_token_id

        input_ids += [pad_id] * padding_length

        attention_mask += [0] * padding_length

        labels += [-100] * padding_length

        input_ids_batch.append(input_ids)
        attention_batch.append(attention_mask)
        labels_batch.append(labels)

    return {
        "input_ids": input_ids_batch,
        "attention_mask": attention_batch,
        "labels": labels_batch,
    }


def tokenize_text_batch(
    examples,
    tokenizer,
    max_seq_length,
    text_column,
):

    encoded = tokenizer(
        examples[text_column],
        truncation=True,
        max_length=max_seq_length,
        padding="max_length",
    )

    labels_batch = []

    for ids, mask in zip(
        encoded["input_ids"],
        encoded["attention_mask"],
    ):

        labels = [
            token if attention == 1 else -100
            for token, attention in zip(ids, mask)
        ]

        labels_batch.append(labels)

    encoded["labels"] = labels_batch

    return encoded


def prepare_datasets(
    dataset_dict: DatasetDict,
    tokenizer: PreTrainedTokenizerBase,
    max_seq_length: int = 256,
    text_column: str = "text",
    num_proc: int = 1,
) -> DatasetDict:

    logger.info("Starting preprocessing...")

    if tokenizer.pad_token_id is None:

        tokenizer.pad_token = tokenizer.eos_token

    if "train" not in dataset_dict:
        raise ValueError("Training dataset is missing.")

    if len(dataset_dict["train"]) == 0:
        raise ValueError("Training dataset is empty.")

    is_instruction = (
        "prompt" in dataset_dict["train"].column_names
        and "completion" in dataset_dict["train"].column_names
    )

    if is_instruction:

        logger.info("Instruction/completion dataset detected.")

        def tokenize_batch(batch):

            return tokenize_instruction_batch(
                batch,
                tokenizer,
                max_seq_length,
            )

    else:

        if text_column not in dataset_dict["train"].column_names:
            raise ValueError(
                f"Missing text column: {text_column}"
            )

        logger.info("Plain text dataset detected.")

        def tokenize_batch(batch):

            return tokenize_text_batch(
                batch,
                tokenizer,
                max_seq_length,
                text_column,
            )

    processed_splits = {}

    for split_name, dataset in dataset_dict.items():

        if len(dataset) == 0:
            processed_splits[split_name] = dataset
            continue

        processed_splits[split_name] = dataset.map(
            tokenize_batch,
            batched=True,
            num_proc=num_proc,
            remove_columns=dataset.column_names,
            desc=f"Tokenizing {split_name}",
        )

    result = DatasetDict(processed_splits)

    logger.info("Preprocessing completed.")

    return result

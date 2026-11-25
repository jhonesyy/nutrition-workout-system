"""
Tokenization and preprocessing utilities - robust version
"""

import logging
from typing import Dict, List

from datasets import DatasetDict
from transformers import PreTrainedTokenizerBase

logger = logging.getLogger(__name__)


def tokenize_function(
    examples: Dict[str, List],
    tokenizer: PreTrainedTokenizerBase,
    max_seq_length: int = 512,
    text_column: str = "text",
) -> Dict:
    texts = examples[text_column]

    # Force padding + truncation so every sequence has the same length
    tokenized = tokenizer(
        texts,
        truncation=True,
        max_length=max_seq_length,
        padding="max_length",          # ← important
        return_tensors=None,
    )

    # labels must be exactly the same as input_ids for causal LM
    tokenized["labels"] = [ids[:] for ids in tokenized["input_ids"]]

    return tokenized


def prepare_datasets(
    dataset_dict: DatasetDict,
    tokenizer: PreTrainedTokenizerBase,
    max_seq_length: int = 512,
    text_column: str = "text",
    num_proc: int = 1,
) -> DatasetDict:
    logger.info("Tokenizing datasets (with padding)...")

    def _tokenize(batch):
        return tokenize_function(
            batch,
            tokenizer=tokenizer,
            max_seq_length=max_seq_length,
            text_column=text_column,
        )

    tokenized = dataset_dict.map(
        _tokenize,
        batched=True,
        num_proc=num_proc,
        remove_columns=dataset_dict["train"].column_names,
        desc="Tokenizing",
    )

    # Keep only required columns
    keep = ["input_ids", "attention_mask", "labels"]
    for split in tokenized:
        remove = [c for c in tokenized[split].column_names if c not in keep]
        if remove:
            tokenized[split] = tokenized[split].remove_columns(remove)

    logger.info("Tokenization complete")
    return tokenized
"""
Load datasets from CSV, JSON, JSONL, TXT and convert them into a unified format.
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional, Union

import pandas as pd
from datasets import Dataset, DatasetDict, load_dataset

logger = logging.getLogger(__name__)


SUPPORTED_EXTENSIONS = {".csv", ".json", ".jsonl", ".txt", ".tsv"}


def load_raw_file(file_path: Union[str, Path]) -> List[Dict]:
    """Load a single file into a list of dictionaries."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset file not found: {path}")

    suffix = path.suffix.lower()
    logger.info(f"Loading dataset from {path} ({suffix})")

    if suffix == ".csv" or suffix == ".tsv":
        sep = "\t" if suffix == ".tsv" else ","
        df = pd.read_csv(path, sep=sep)
        records = df.to_dict(orient="records")

    elif suffix == ".json":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            records = data
        elif isinstance(data, dict) and "data" in data:
            records = data["data"]
        else:
            records = [data]

    elif suffix == ".jsonl":
        records = []
        with open(path, "r", encoding="utf-8") as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    records.append(json.loads(line))
                except json.JSONDecodeError as e:
                    logger.warning(f"Skipping invalid JSONL line {line_num}: {e}")

    elif suffix == ".txt":
        records = []
        with open(path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                text = line.strip()
                if text:
                    records.append({"text": text, "id": i})

    else:
        raise ValueError(f"Unsupported file format: {suffix}. Supported: {SUPPORTED_EXTENSIONS}")

    logger.info(f"Loaded {len(records)} raw records")
    return records


def detect_columns(records: List[Dict]) -> Dict[str, str]:
    """Heuristically detect text / prompt / completion columns."""
    if not records:
        raise ValueError("Empty dataset")

    sample = records[0]
    keys = set(sample.keys())

    mapping = {}

    # Common patterns
    if "text" in keys:
        mapping["text"] = "text"
    elif "content" in keys:
        mapping["text"] = "content"
    elif "body" in keys:
        mapping["text"] = "body"

    if "prompt" in keys and "completion" in keys:
        mapping["prompt"] = "prompt"
        mapping["completion"] = "completion"
    elif "instruction" in keys and "output" in keys:
        mapping["prompt"] = "instruction"
        mapping["completion"] = "output"
    elif "question" in keys and "answer" in keys:
        mapping["prompt"] = "question"
        mapping["completion"] = "answer"
    elif "input" in keys and "output" in keys:
        mapping["prompt"] = "input"
        mapping["completion"] = "output"

    return mapping


def load_and_normalize(
    file_path: Union[str, Path],
    text_column: Optional[str] = None,
    prompt_column: Optional[str] = None,
    completion_column: Optional[str] = None,
) -> Dataset:
    """
    Load any supported file and return a Hugging Face Dataset
    with standardized columns: 'text' (for causal LM) or 'prompt'+'completion'.
    """
    records = load_raw_file(file_path)

    if not records:
        raise ValueError("No valid records found in the dataset")

    # Auto-detect if user did not specify columns
    if text_column is None and prompt_column is None:
        detected = detect_columns(records)
        text_column = detected.get("text")
        prompt_column = detected.get("prompt")
        completion_column = detected.get("completion")

    normalized = []
    for i, rec in enumerate(records):
        item = {"id": rec.get("id", i)}

        if prompt_column and completion_column:
            prompt = str(rec.get(prompt_column, "")).strip()
            completion = str(rec.get(completion_column, "")).strip()
            if prompt and completion:
                # Format commonly used for instruction tuning
                item["text"] = f"### Instruction:\n{prompt}\n\n### Response:\n{completion}"
                item["prompt"] = prompt
                item["completion"] = completion
                normalized.append(item)
        elif text_column:
            text = str(rec.get(text_column, "")).strip()
            if text:
                item["text"] = text
                normalized.append(item)
        else:
            # Fallback: join all string values
            parts = [str(v).strip() for v in rec.values() if isinstance(v, (str, int, float))]
            text = " ".join(parts).strip()
            if text:
                item["text"] = text
                normalized.append(item)

    if not normalized:
        raise ValueError("After normalization the dataset is empty. Check column names.")

    logger.info(f"Normalized dataset size: {len(normalized)}")
    return Dataset.from_list(normalized)


def create_dataset_dict(
    train_path: Union[str, Path],
    validation_split: float = 0.1,
    test_split: float = 0.05,
    seed: int = 42,
    **kwargs,
) -> DatasetDict:
    """Load and automatically split into train / validation / test."""
    full_ds = load_and_normalize(train_path, **kwargs)

    # Remove exact duplicates (correct way)
    df = full_ds.to_pandas()
    df = df.drop_duplicates(subset=["text"])
    full_ds = Dataset.from_pandas(df, preserve_index=False)
    logger.info(f"After deduplication: {len(full_ds)} examples")

    # Split
    test_size = test_split
    val_size = validation_split / (1 - test_size) if test_size < 1 else 0

    split1 = full_ds.train_test_split(test_size=test_size, seed=seed)
    train_val = split1["train"]
    test_ds = split1["test"]

    if val_size > 0 and len(train_val) > 1:
        split2 = train_val.train_test_split(test_size=val_size, seed=seed)
        train_ds = split2["train"]
        val_ds = split2["test"]
    else:
        train_ds = train_val
        val_ds = Dataset.from_list([])

    ds_dict = DatasetDict({
        "train": train_ds,
        "validation": val_ds,
        "test": test_ds,
    })

    logger.info(
        f"Splits → train: {len(train_ds)}, "
        f"validation: {len(val_ds)}, test: {len(test_ds)}"
    )
    return ds_dict
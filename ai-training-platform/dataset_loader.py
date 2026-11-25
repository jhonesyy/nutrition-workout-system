
"""
Dataset loader for Nutrition and Workout AI.

Supported:
- CSV
- TSV
- JSON
- JSONL
- TXT

Normalized output:
- text
- prompt
- completion
"""

import json
import logging

from pathlib import Path
from typing import Dict, List, Optional, Union

import pandas as pd

from datasets import Dataset, DatasetDict


logger = logging.getLogger(__name__)


SUPPORTED_EXTENSIONS = {
    ".csv",
    ".tsv",
    ".json",
    ".jsonl",
    ".txt",
}


PROMPT_PAIRS = [
    ("prompt", "completion"),
    ("instruction", "output"),
    ("question", "answer"),
    ("input", "output"),
    ("instruction", "response"),
    ("query", "response"),
]


def load_raw_file(
    file_path: Union[str, Path]
) -> List[Dict]:

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(
            f"Dataset not found: {path}"
        )

    suffix = path.suffix.lower()

    logger.info("Loading dataset: %s", path)

    if suffix in {".csv", ".tsv"}:

        separator = "\t" if suffix == ".tsv" else ","

        df = pd.read_csv(
            path,
            sep=separator,
            encoding="utf-8-sig",
        )

        df = df.where(pd.notna(df), None)

        records = df.to_dict(orient="records")

    elif suffix == ".json":

        with open(path, encoding="utf-8") as file:
            data = json.load(file)

        if isinstance(data, list):
            records = data

        elif isinstance(data, dict) and isinstance(data.get("data"), list):
            records = data["data"]

        else:
            records = [data]

    elif suffix == ".jsonl":

        records = []

        with open(path, encoding="utf-8") as file:

            for line_number, line in enumerate(file, 1):

                line = line.strip()

                if not line:
                    continue

                try:
                    record = json.loads(line)

                    if isinstance(record, dict):
                        records.append(record)

                except json.JSONDecodeError as error:

                    logger.warning(
                        "Skipping invalid JSONL line %s: %s",
                        line_number,
                        error,
                    )

    elif suffix == ".txt":

        records = []

        with open(path, encoding="utf-8") as file:

            for index, line in enumerate(file):

                text = line.strip()

                if text:
                    records.append({
                        "text": text,
                        "id": index,
                    })

    else:

        raise ValueError(
            f"Unsupported file format: {suffix}"
        )

    if not records:
        raise ValueError("Dataset contains no valid records.")

    logger.info("Loaded %s records.", len(records))

    return records


def detect_columns(
    records: List[Dict]
) -> Dict[str, str]:

    if not records:
        raise ValueError("Cannot detect columns from empty dataset.")

    # Inspect multiple records rather than only the first.
    available_keys = set()

    for record in records[:100]:
        available_keys.update(record.keys())

    mapping = {}

    for prompt_key, completion_key in PROMPT_PAIRS:

        if (
            prompt_key in available_keys
            and completion_key in available_keys
        ):

            mapping["prompt"] = prompt_key
            mapping["completion"] = completion_key

            return mapping

    for key in ["text", "content", "body"]:

        if key in available_keys:
            mapping["text"] = key
            return mapping

    return mapping


def is_valid_value(value) -> bool:

    if value is None:
        return False

    if isinstance(value, float) and pd.isna(value):
        return False

    return bool(str(value).strip())


def load_and_normalize(
    file_path: Union[str, Path],
    text_column: Optional[str] = None,
    prompt_column: Optional[str] = None,
    completion_column: Optional[str] = None,
) -> Dataset:

    records = load_raw_file(file_path)

    detected = detect_columns(records)

    if prompt_column is None:
        prompt_column = detected.get("prompt")

    if completion_column is None:
        completion_column = detected.get("completion")

    if text_column is None:
        text_column = detected.get("text")

    normalized = []

    seen = set()

    for index, record in enumerate(records):

        if not isinstance(record, dict):
            continue

        item = {
            "id": str(record.get("id", index))
        }

        if prompt_column and completion_column:

            prompt_value = record.get(prompt_column)
            completion_value = record.get(completion_column)

            if not (
                is_valid_value(prompt_value)
                and is_valid_value(completion_value)
            ):
                continue

            prompt = str(prompt_value).strip()
            completion = str(completion_value).strip()

            text = (
                "### Instruction:\n"
                f"{prompt}\n\n"
                "### Response:\n"
                f"{completion}"
            )

            item.update({
                "text": text,
                "prompt": prompt,
                "completion": completion,
            })

        elif text_column:

            value = record.get(text_column)

            if not is_valid_value(value):
                continue

            text = str(value).strip()

            item["text"] = text

        else:

            raise ValueError(
                "Could not detect a valid text or instruction format. "
                "Specify text_column, prompt_column and completion_column."
            )

        normalized_text = item["text"]

        if normalized_text in seen:
            continue

        seen.add(normalized_text)

        normalized.append(item)

    if not normalized:
        raise ValueError(
            "No usable records found after normalization."
        )

    logger.info(
        "Normalized dataset: %s examples",
        len(normalized),
    )

    return Dataset.from_list(normalized)


def create_dataset_dict(
    train_path: Union[str, Path],
    validation_split: float = 0.10,
    test_split: float = 0.05,
    seed: int = 42,
    **kwargs,
) -> DatasetDict:

    if not 0 <= validation_split < 1:
        raise ValueError("Invalid validation split.")

    if not 0 <= test_split < 1:
        raise ValueError("Invalid test split.")

    if validation_split + test_split >= 1:
        raise ValueError("Combined validation and test splits must be below 1.")

    dataset = load_and_normalize(
        train_path,
        **kwargs,
    )

    if len(dataset) < 3:
        raise ValueError(
            "At least three unique examples are required for splitting."
        )

    logger.info(
        "Splitting %s examples...",
        len(dataset),
    )

    test_result = dataset.train_test_split(
        test_size=test_split,
        seed=seed,
    )

    train_val = test_result["train"]
    test_ds = test_result["test"]

    validation_fraction = (
        validation_split / (1 - test_split)
    )

    validation_result = train_val.train_test_split(
        test_size=validation_fraction,
        seed=seed,
    )

    train_ds = validation_result["train"]
    validation_ds = validation_result["test"]

    result = DatasetDict({
        "train": train_ds,
        "validation": validation_ds,
        "test": test_ds,
    })

    logger.info(
        "Dataset split complete: train=%s validation=%s test=%s",
        len(train_ds),
        len(validation_ds),
        len(test_ds),
    )

    return result
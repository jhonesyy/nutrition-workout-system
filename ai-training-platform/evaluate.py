"""
Evaluation metrics and comparison utilities.
"""

import logging
from typing import Dict, List, Optional

import torch
import numpy as np
from datasets import Dataset
from transformers import PreTrainedModel, PreTrainedTokenizerBase
from tqdm import tqdm

logger = logging.getLogger(__name__)


def compute_perplexity(
    model: PreTrainedModel,
    tokenizer: PreTrainedTokenizerBase,
    dataset: Dataset,
    max_samples: int = 200,
    max_length: int = 512,
    device: Optional[torch.device] = None,
) -> float:
    """Calculate perplexity on a dataset (lower is better)."""
    device = device or next(model.parameters()).device
    model.eval()

    losses = []
    samples = min(len(dataset), max_samples)

    for i in tqdm(range(samples), desc="Computing perplexity"):
        text = dataset[i]["text"]
        encodings = tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            max_length=max_length,
        )
        input_ids = encodings.input_ids.to(device)

        with torch.no_grad():
            outputs = model(input_ids, labels=input_ids)
            losses.append(outputs.loss.item())

    mean_loss = np.mean(losses)
    ppl = float(np.exp(mean_loss))
    logger.info(f"Perplexity ({samples} samples): {ppl:.2f}")
    return ppl


def generate_responses(
    model: PreTrainedModel,
    tokenizer: PreTrainedTokenizerBase,
    prompts: List[str],
    max_new_tokens: int = 150,
    temperature: float = 0.7,
    top_p: float = 0.9,
    device: Optional[torch.device] = None,
) -> List[str]:
    """Generate responses for a list of prompts."""
    device = device or next(model.parameters()).device
    model.eval()
    responses = []

    for prompt in prompts:
        inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512)
        inputs = {k: v.to(device) for k, v in inputs.items()}

        with torch.no_grad():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=True,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )

        full_text = tokenizer.decode(output_ids[0], skip_special_tokens=True)
        # Remove the prompt part if present
        response = full_text[len(prompt):].strip() if full_text.startswith(prompt) else full_text
        responses.append(response)

    return responses
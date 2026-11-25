"""
Interactive testing interface for a trained model.
"""

import logging
from typing import Optional

import torch
from model import load_trained_model, get_device

logger = logging.getLogger(__name__)


class InferenceEngine:
    def __init__(self, model_dir: str):
        self.device = get_device()
        self.model, self.tokenizer = load_trained_model(model_dir, self.device)
        logger.info(f"Inference engine ready (model: {model_dir})")

    def generate(
        self,
        prompt: str,
        max_new_tokens: int = 200,
        temperature: float = 0.7,
        top_p: float = 0.9,
        do_sample: bool = True,
    ) -> str:
        self.model.eval()
        inputs = self.tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=512,
        )
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            output_ids = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=do_sample,
                pad_token_id=self.tokenizer.pad_token_id,
                eos_token_id=self.tokenizer.eos_token_id,
            )

        full = self.tokenizer.decode(output_ids[0], skip_special_tokens=True)
        # Strip the original prompt for cleaner output
        if full.startswith(prompt):
            return full[len(prompt):].strip()
        return full.strip()

    def chat(self):
        """Simple interactive loop."""
        print("\n=== Interactive Inference ===")
        print("Type your prompt and press Enter. Type 'quit' or 'exit' to stop.\n")

        while True:
            try:
                user_input = input("You: ").strip()
            except (KeyboardInterrupt, EOFError):
                print("\nExiting.")
                break

            if user_input.lower() in {"quit", "exit", "q"}:
                print("Goodbye.")
                break

            if not user_input:
                continue

            print("AI: ", end="", flush=True)
            response = self.generate(user_input)
            print(response)
            print()
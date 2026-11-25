#!/usr/bin/env python3
"""
Main entry point for the AI Training Platform.
"""

import argparse
import logging
import sys
from pathlib import Path

from config import TrainingConfig, DATA_DIR, MODELS_DIR
from dataset_loader import create_dataset_dict
from preprocessing import prepare_datasets
from train import train_model
from evaluate import compute_perplexity, generate_responses
from inference import InferenceEngine
from model import load_base_model, load_trained_model, get_device

# ------------------------------------------------------------------
# Logging setup
# ------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/training.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("main")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Custom AI Training Platform – fine-tune language models on your data"
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # ---- train ----
    train_parser = subparsers.add_parser("train", help="Train / fine-tune a model")
    train_parser.add_argument("--dataset", type=str, required=True,
                              help="Path to dataset file (csv/json/jsonl/txt)")
    train_parser.add_argument("--model", type=str, default="distilgpt2",
                              help="Hugging Face model name or path")
    train_parser.add_argument("--epochs", type=int, default=3)
    train_parser.add_argument("--batch-size", type=int, default=4)
    train_parser.add_argument("--lr", type=float, default=2e-5)
    train_parser.add_argument("--max-seq-length", type=int, default=512)
    train_parser.add_argument("--output-dir", type=str, default=None)
    train_parser.add_argument("--from-scratch", action="store_true",
                              help="Train randomly initialized model (not recommended)")
    train_parser.add_argument("--no-lora", action="store_true",
                              help="Disable LoRA (full fine-tune)")
    train_parser.add_argument("--run-name", type=str, default="custom-run")

    # ---- evaluate ----
    eval_parser = subparsers.add_parser("evaluate", help="Evaluate a trained model")
    eval_parser.add_argument("--model-dir", type=str, required=True)
    eval_parser.add_argument("--dataset", type=str, required=True)
    eval_parser.add_argument("--max-samples", type=int, default=100)

    # ---- chat / inference ----
    chat_parser = subparsers.add_parser("chat", help="Interactive chat with a trained model")
    chat_parser.add_argument("--model-dir", type=str, required=True)

    # ---- compare ----
    compare_parser = subparsers.add_parser("compare", help="Compare base vs fine-tuned responses")
    compare_parser.add_argument("--base-model", type=str, default="distilgpt2")
    compare_parser.add_argument("--finetuned-dir", type=str, required=True)
    compare_parser.add_argument("--prompt", type=str, required=True)

    return parser.parse_args()


def cmd_train(args):
    config = TrainingConfig(
        model_name_or_path=args.model,
        num_epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        max_seq_length=args.max_seq_length,
        train_from_scratch=args.from_scratch,
        use_lora=not args.no_lora,
        run_name=args.run_name,
        output_dir=args.output_dir or str(MODELS_DIR / args.run_name),
    )

    logger.info("Loading and splitting dataset...")
    ds_dict = create_dataset_dict(
        train_path=args.dataset,
        validation_split=config.validation_split,
        test_split=config.test_split,
        seed=config.seed,
    )

    logger.info("Loading tokenizer and preparing tokenized datasets...")
    # We need the tokenizer early for preprocessing
    from model import load_tokenizer
    tokenizer = load_tokenizer(config.model_name_or_path)

    tokenized = prepare_datasets(
        ds_dict,
        tokenizer=tokenizer,
        max_seq_length=config.max_seq_length,
    )

    final_model_path = train_model(tokenized, config)
    print(f"\n✅ Training finished. Model saved at:\n   {final_model_path}\n")
    return final_model_path


def cmd_evaluate(args):
    from dataset_loader import load_and_normalize
    model, tokenizer = load_trained_model(args.model_dir)
    ds = load_and_normalize(args.dataset)
    ppl = compute_perplexity(model, tokenizer, ds, max_samples=args.max_samples)
    print(f"\nPerplexity: {ppl:.2f}\n")


def cmd_chat(args):
    engine = InferenceEngine(args.model_dir)
    engine.chat()


def cmd_compare(args):
    device = get_device()
    print("Loading base model...")
    base_model, base_tok = load_base_model(
        TrainingConfig(model_name_or_path=args.base_model, use_lora=False),
        device,
    )
    print("Loading fine-tuned model...")
    ft_model, ft_tok = load_trained_model(args.finetuned_dir, device)

    from evaluate import generate_responses
    print("\n--- Base model response ---")
    base_resp = generate_responses(base_model, base_tok, [args.prompt])[0]
    print(base_resp)

    print("\n--- Fine-tuned model response ---")
    ft_resp = generate_responses(ft_model, ft_tok, [args.prompt])[0]
    print(ft_resp)
    print()


def main():
    args = parse_args()

    if args.command == "train":
        cmd_train(args)
    elif args.command == "evaluate":
        cmd_evaluate(args)
    elif args.command == "chat":
        cmd_chat(args)
    elif args.command == "compare":
        cmd_compare(args)
    else:
        raise ValueError(f"Unknown command: {args.command}")


if __name__ == "__main__":
    main()
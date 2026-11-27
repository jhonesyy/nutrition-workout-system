
"""
Nutrition and Workout AI Inference API.

Run:
uvicorn api.main:app --host 127.0.0.1 --port 8000
"""

import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from typing import List, Optional, Dict, Any

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from model import load_trained_model, get_device


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)

logger = logging.getLogger("ai_api")


BASE_DIR = Path(__file__).resolve().parent.parent

DEFAULT_MODEL_PATH = (
    BASE_DIR
    / "models"
    / "nutrition-demo-v3"
    / "checkpoint-4450"
)

MODEL_PATH = Path(
    os.getenv("AI_MODEL_PATH", str(DEFAULT_MODEL_PATH))
).expanduser().resolve()


# ---------------------------------------------------------
# Global model state
# ---------------------------------------------------------

model = None
tokenizer = None
device = None


# ---------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    user_id: str
    conversation_history: List[Dict[str, Any]] = Field(
        default_factory=list
    )
    user_context: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    success: bool
    response: str
    model_name: str


# ---------------------------------------------------------
# Model lifecycle
# ---------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global model, tokenizer, device

    device = get_device()

    logger.info("Loading model from: %s", MODEL_PATH)
    logger.info("Using device: %s", device)

    if not MODEL_PATH.exists():
        raise RuntimeError(
            f"Model directory does not exist: {MODEL_PATH}"
        )

    if not (MODEL_PATH / "adapter_config.json").exists():
        raise RuntimeError(
            f"LoRA adapter_config.json missing: {MODEL_PATH}"
        )

    if not (MODEL_PATH / "adapter_model.safetensors").exists():
        raise RuntimeError(
            f"LoRA adapter weights missing: {MODEL_PATH}"
        )

    try:
        model, tokenizer = load_trained_model(
            str(MODEL_PATH),
            device,
        )

        model.eval()

        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        if model.config.pad_token_id is None:
            model.config.pad_token_id = tokenizer.pad_token_id

        logger.info(
            "Model loaded successfully. Vocab size: %s",
            len(tokenizer),
        )

    except Exception as exc:
        logger.exception("Model loading failed.")
        raise RuntimeError(
            f"Model loading failed: {exc}"
        ) from exc

    yield

    logger.info("Shutting down AI inference API.")

    model = None
    tokenizer = None
    device = None


app = FastAPI(
    title="Nutrition & Workout AI Inference API",
    version="2.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------

@app.get("/")
async def root():
    return {
        "service": "Nutrition & Workout AI",
        "status": "online",
        "model": "nutrition-demo-v3-checkpoint-4450",
    }


@app.get("/api/ai/health")
async def health_check():
    loaded = model is not None and tokenizer is not None

    return {
        "status": "healthy" if loaded else "loading",
        "device": str(device) if device is not None else "unknown",
        "model_loaded": loaded,
        "model_path": str(MODEL_PATH),
        "model_name": "nutrition-demo-v3-checkpoint-4450",
    }


# ---------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------

def build_prompt(
    request: ChatRequest,
    system_prompt: str = "",
) -> str:

    instruction = request.message.strip()

    if system_prompt:
        instruction = (
            f"{system_prompt}\n\n"
            f"{instruction}"
        )

    context = request.user_context or {}

    context_parts = []

    for key, label in [
        ("goal", "Fitness goal"),
        ("allergens", "Food allergies"),
        ("dietary_restrictions", "Dietary restrictions"),
        ("activity_level", "Activity level"),
        ("experience_level", "Training experience"),
        ("availableEquipment", "Available equipment"),
        ("injuries", "Injuries or limitations"),
    ]:
        value = context.get(key)

        if value:
            context_parts.append(f"{label}: {value}")

    if context_parts:
        instruction += (
            "\n\nUser context:\n"
            + "\n".join(context_parts)
        )

    # Include recent conversation history.
    history = request.conversation_history[-6:]

    history_text = []

    for item in history:
        role = str(item.get("role", "")).lower()
        content = item.get("content", "")

        if role not in ("user", "assistant"):
            continue

        if not isinstance(content, str) or not content.strip():
            continue

        label = "User" if role == "user" else "Assistant"

        history_text.append(
            f"{label}: {content.strip()}"
        )

    if history_text:
        instruction = (
            "Previous conversation:\n"
            + "\n".join(history_text)
            + "\n\nCurrent request:\n"
            + instruction
        )

    instruction += (
        "\n\nProvide a direct, practical, and accurate answer. "
        "Do not invent sources, references, or scientific studies."
    )

    return (
        f"### Instruction:\n"
        f"{instruction}\n\n"
        f"### Response:\n"
    )


# ---------------------------------------------------------
# Text generation
# ---------------------------------------------------------

def generate_text(
    prompt: str,
    max_new_tokens: int = 200,
) -> str:

    if model is None or tokenizer is None:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded.",
        )

    inputs = tokenizer(
        prompt,
        return_tensors="pt",
        truncation=True,
        max_length=768,
        padding=False,
    )

    # Use embedding device. This also works with device_map="auto".
    input_device = model.get_input_embeddings().weight.device

    inputs = {
        key: value.to(input_device)
        for key, value in inputs.items()
    }

    generation_kwargs = {
        "max_new_tokens": max_new_tokens,
        "do_sample": True,
        "temperature": 0.7,
        "top_p": 0.9,
        "top_k": 40,
        "repetition_penalty": 1.2,
        "no_repeat_ngram_size": 3,
        "pad_token_id": tokenizer.pad_token_id,
        "eos_token_id": tokenizer.eos_token_id,
    }

    with torch.inference_mode():
        output_ids = model.generate(
            **inputs,
            **generation_kwargs,
        )

    prompt_length = inputs["input_ids"].shape[1]

    generated_ids = output_ids[0, prompt_length:]

    response = tokenizer.decode(
        generated_ids,
        skip_special_tokens=True,
    ).strip()

    # Remove common scraped-article artifacts.
    hallucination_markers = [
        "thanks for reading",
        "please share your thoughts",
        "subscribe to our newsletter",
        "leave a comment",
        "this article was first published",
        "read more at",
    ]

    lower_response = response.lower()

    positions = [
        lower_response.find(marker)
        for marker in hallucination_markers
        if marker in lower_response
    ]

    if positions:
        response = response[:min(positions)].strip()

    words = response.split()

    if len(words) > 15 and len(set(words)) < 5:
        response = (
            "I apologize, I am having trouble generating a clear response. "
            "Please try rephrasing your question."
        )

    if not response:
        response = (
            "I couldn't generate a response. "
            "Please try asking again."
        )

    return response


# ---------------------------------------------------------
# Shared inference handler
# ---------------------------------------------------------

async def _generate_response(
    request: ChatRequest,
    system_prompt: str = "",
):
    if model is None or tokenizer is None:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded.",
        )

    if not request.message.strip():
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty.",
        )

    try:
        prompt = build_prompt(
            request,
            system_prompt,
        )

        response = generate_text(prompt)

        logger.info(
            "Generated response for user %s: %s",
            request.user_id,
            response[:150],
        )

        return ChatResponse(
            success=True,
            response=response,
            model_name="nutrition-demo-v3-checkpoint-4450",
        )

    except HTTPException:
        raise

    except Exception:
        logger.exception("Inference error.")

        raise HTTPException(
            status_code=500,
            detail="Internal AI generation error.",
        )


# ---------------------------------------------------------
# Chat endpoint
# ---------------------------------------------------------

@app.post(
    "/api/ai/chat",
    response_model=ChatResponse,
)
async def chat(request: ChatRequest):

    return await _generate_response(request)


# ---------------------------------------------------------
# Nutrition endpoint
# ---------------------------------------------------------

@app.post(
    "/api/ai/nutrition",
    response_model=ChatResponse,
)
async def nutrition_chat(request: ChatRequest):

    return await _generate_response(
        request,
        (
            "You are a nutrition assistant. "
            "Focus on balanced diets, food choices, meal planning, "
            "and practical nutrition advice. "
            "Consider allergies and dietary restrictions."
        ),
    )


# ---------------------------------------------------------
# Workout endpoint
# ---------------------------------------------------------

@app.post(
    "/api/ai/workout",
    response_model=ChatResponse,
)
async def workout_chat(request: ChatRequest):

    return await _generate_response(
        request,
        (
            "You are a fitness and workout assistant. "
            "Focus on exercise programming, workout routines, "
            "strength training, recovery, and fitness goals."
        ),
    )

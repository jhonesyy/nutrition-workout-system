"""
Nutrition and Workout AI Inference API.
Run: uvicorn api.main:app --host 127.0.0.1 --port 8000
"""

import os
import logging
from pathlib import Path
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

app = FastAPI(title="Nutrition & Workout AI Inference API", version="1.0.0")

model = None
tokenizer = None
device = None


class ChatRequest(BaseModel):
    message: str
    user_id: str
    conversation_history: List[Dict[str, Any]] = Field(default_factory=list)
    user_context: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    success: bool
    response: str
    model_name: str


@app.on_event("startup")
async def load_model():
    global model, tokenizer, device
    device = get_device()
    default_model_path = (
        Path(__file__).parent.parent / "models" / "nutrition-demo-v3" / "final"
    )
    model_dir = Path(os.getenv("AI_MODEL_PATH", str(default_model_path)))

    logger.info("Loading model from: %s", model_dir)
    logger.info("Using device: %s", device)

    if not model_dir.exists():
        raise RuntimeError(f"Model directory does not exist: {model_dir}")

    try:
        model, tokenizer = load_trained_model(str(model_dir), device)
        model.eval()
        if tokenizer.pad_token_id is None:
            tokenizer.pad_token = tokenizer.eos_token
        if model.config.pad_token_id is None:
            model.config.pad_token_id = tokenizer.pad_token_id
        logger.info("Model loaded successfully. Vocab size: %s", len(tokenizer))
    except Exception as exc:
        logger.exception("Model loading failed.")
        raise RuntimeError(f"Model loading failed: {exc}")


@app.get("/api/ai/health")
async def health_check():
    return {
        "status": "healthy",
        "device": str(device) if device is not None else "unknown",
        "model_loaded": model is not None,
        "model_path": os.getenv("AI_MODEL_PATH", "models/nutrition-demo-v3/final"),
    }


async def _generate_response(request: ChatRequest, system_prompt: str = ""):
    if model is None or tokenizer is None:
        raise HTTPException(status_code=503, detail="Model not loaded.")
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    try:
        instruction = request.message.strip()
        if system_prompt:
            instruction = f"{system_prompt}\n\n{instruction}"

        if request.user_context:
            context_parts = []
            goal = request.user_context.get("goal")
            allergens = request.user_context.get("allergens")
            if goal:
                context_parts.append(f"Fitness goal: {goal}")
            if allergens:
                context_parts.append(f"Food allergies: {allergens}")
            if context_parts:
                instruction += "\n\nUser context:\n" + "\n".join(context_parts)

        instruction += (
            "\n\nProvide a direct, practical, and accurate answer. "
            "Do not invent sources, references, or scientific studies."
        )

        prompt = f"### Instruction:\n{instruction}\n\n### Response:\n"

        inputs = tokenizer(
            prompt,
            return_tensors="pt",
            truncation=True,
            max_length=768,
            padding=False,
        ).to(device)

        with torch.inference_mode():
            output_ids = model.generate(
                **inputs,
                max_new_tokens=200,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                top_k=40,
                repetition_penalty=1.2,
                no_repeat_ngram_size=3,
                pad_token_id=tokenizer.pad_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )

        prompt_length = inputs["input_ids"].shape[1]
        generated_ids = output_ids[0, prompt_length:]
        ai_response = tokenizer.decode(
            generated_ids, skip_special_tokens=True
        ).strip()

        hallucination_markers = [
            "thanks for reading",
            "please share your thoughts",
            "subscribe to our newsletter",
            "leave a comment",
            "this article was first published",
            "read more at",
        ]
        lower_response = ai_response.lower()
        positions = [
            lower_response.find(m)
            for m in hallucination_markers
            if m in lower_response
        ]
        if positions:
            ai_response = ai_response[: min(positions)].strip()

        words = ai_response.split()
        if len(words) > 15 and len(set(words)) < 5:
            ai_response = (
                "I apologize, I am having trouble generating a clear response. "
                "Please try rephrasing your question."
            )
        if not ai_response:
            ai_response = "I couldn't generate a response. Please try asking again."

        logger.info("Generated response: %s", ai_response[:150])
        return ChatResponse(
            success=True,
            response=ai_response,
            model_name="nutrition-workout-ai-lora",
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception("Inference error.")
        raise HTTPException(status_code=500, detail="Internal AI generation error.")


@app.post("/api/ai/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    return await _generate_response(request)


@app.post("/api/ai/nutrition", response_model=ChatResponse)
async def nutrition_chat(request: ChatRequest):
    return await _generate_response(
        request,
        "You are a nutrition assistant. Focus on balanced diets, food choices, "
        "meal planning, and practical nutrition advice. Consider allergies and "
        "dietary restrictions.",
    )


@app.post("/api/ai/workout", response_model=ChatResponse)
async def workout_chat(request: ChatRequest):
    return await _generate_response(
        request,
        "You are a fitness and workout assistant. Focus on exercise programming, "
        "workout routines, strength training, recovery, and fitness goals.",
    )
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.auth import require_user
from core.deps import require_project
from core.llm import llm_chat

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatRequest(BaseModel):
    project_id: str
    question: str
    context: dict[str, Any] = {}
    history: list[dict[str, str]] = []


class ChatResponse(BaseModel):
    answer: str
    suggestions: list[str]


@router.post("/query", response_model=ChatResponse)
async def chat_query(
    body: ChatRequest,
    uid: str = Depends(require_user),
):
    await require_project(body.project_id, uid)
    answer, suggestions = await llm_chat(body.context, body.question, body.history)
    return ChatResponse(answer=answer, suggestions=suggestions)

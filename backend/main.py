"""
Jaswanth Digital Twin — FastAPI Application Entry Point
"""

import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv

# Load .env BEFORE any other imports that depend on env vars
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import get_settings
from api.tasks import router as tasks_router
from api.chat import router as chat_router
from api.feedback import router as feedback_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown lifecycle events."""
    settings = get_settings()
    print(f"[BRAIN] Jaswanth Digital Twin - Backend starting...")
    print(f"   Supabase: {settings.supabase_url}")
    print(f"   LangSmith Project: {settings.langchain_project}")
    print(f"   Tracing: {'enabled' if settings.langchain_tracing_v2 else 'disabled'}")
    yield
    print("[STOP] Shutting down...")


app = FastAPI(
    title="Jaswanth Digital Twin API",
    description="Autonomous agentic framework emulating the team lead for task evaluation and chat.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS Middleware ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Route Registration ──
app.include_router(tasks_router, prefix="/v1", tags=["Tasks"])
app.include_router(chat_router, prefix="/v1", tags=["Chat"])
app.include_router(feedback_router, prefix="/v1", tags=["Feedback"])


@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "jaswanth-digital-twin", "version": "1.0.0"}

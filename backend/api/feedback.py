"""
Jaswanth Digital Twin — Feedback Endpoint
Sends thumbs up/down feedback to LangSmith for trace evaluation. (Doc 6, §4)
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class FeedbackRequest(BaseModel):
    trace_id: str
    score: float  # 1.0 = thumbs up, 0.0 = thumbs down
    comment: Optional[str] = None
    message_id: Optional[str] = None


@router.post("/feedback")
async def submit_feedback(request: FeedbackRequest):
    """
    Receives UI feedback and forwards it to LangSmith
    for dataset curation and future fine-tuning.
    """
    try:
        from langsmith import Client as LangSmithClient
        from core.config import get_settings

        settings = get_settings()

        if settings.langchain_api_key:
            ls_client = LangSmithClient(api_key=settings.langchain_api_key)
            ls_client.create_feedback(
                run_id=request.trace_id,
                key="user-feedback",
                score=request.score,
                comment=request.comment or "",
            )

        return {
            "status": "recorded",
            "trace_id": request.trace_id,
            "score": request.score,
        }

    except Exception as e:
        # Feedback is non-critical; don't crash the app
        return {
            "status": "error",
            "message": f"Feedback recording failed: {str(e)}",
        }

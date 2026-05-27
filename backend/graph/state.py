"""
Jaswanth Digital Twin — LangGraph State Schema
Unified state dictionary combining Doc 2 (LLA) and Doc 7 (Memory).
"""

from typing import TypedDict, Optional, List, Any


class TwinState(TypedDict):
    """
    The core state object passed through every LangGraph node.

    Fields from Doc 2 (LLA §1):
        task_id, weekly_goal, daily_task, submission_notes,
        evaluation_status, technical_gap_analysis, rag_context, final_response

    Fields from Doc 5 (Security):
        is_safe, safety_reason

    Fields from Doc 7 (Memory):
        chat_history, historical_summary

    Routing fields:
        session_id, user_id
    """

    # ── Task Context ──
    task_id: str
    weekly_goal: str
    daily_task: str
    submission_notes: str
    task_context: Optional[str]  # Full student task dump injected for chat accuracy

    # ── Security (Doc 5) ──
    is_safe: bool
    safety_reason: str

    # ── Evaluation Output (Doc 2) ──
    evaluation_status: Optional[str]  # 'approved' | 'rejected' | 'needs_clarification'
    technical_gap_analysis: Optional[str]
    alignment_score: Optional[int]


    # ── RAG Context (Doc 2) ──
    rag_context: List[dict]

    # ── Memory Management (Doc 7) ──
    chat_history: List[Any]  # List of message dicts or BaseMessage
    historical_summary: str

    # ── Final Output ──
    final_response: Optional[str]

    # ── Routing Metadata ──
    session_id: Optional[str]
    user_id: Optional[str]

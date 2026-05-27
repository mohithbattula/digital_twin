"""
Jaswanth Digital Twin — Rejection Node
Handles flagged/unsafe inputs with a generic rejection response. (Doc 5, §3.3)
"""

from graph.state import TwinState
from core.supabase_client import get_supabase_client


def rejection_node(state: TwinState) -> dict:
    """
    Handles inputs flagged by the Sanitizer Node.
    - Sets a generic rejection response
    - Flags the task in the database
    - Bypasses all evaluation logic

    Returns:
        Updated state with final_response and evaluation_status set to 'flagged'.
    """
    task_id = state.get("task_id", "")
    reason = state.get("safety_reason", "Input flagged by security system")

    # Flag the task in Supabase if we have a task_id
    if task_id:
        try:
            supabase = get_supabase_client()
            supabase.table("tasks").update({
                "status": "flagged",
            }).eq("id", task_id).execute()
        except Exception as e:
            print(f"[WARN] Failed to flag task {task_id}: {e}")

    return {
        "evaluation_status": "flagged",
        "final_response": (
            "I wasn't able to process that submission. "
            "Please resubmit with a clear description of the work completed. "
            "If you believe this is an error, contact the team lead directly."
        ),
    }

"""
Jaswanth Digital Twin — Context Hydration Node
Fetches task details and weekly goal from Supabase. (Doc 2, §2.1)
"""

from graph.state import TwinState
from core.supabase_client import get_supabase_client


def context_hydration_node(state: TwinState) -> dict:
    """
    Hydrates the state with full task context from Supabase.
    Extracts task_id from webhook payload and queries for:
    - The daily task details
    - The parent weekly goal (via parent_id join)

    Returns:
        Updated state with weekly_goal, daily_task, submission_notes populated.
    """
    task_id = state.get("task_id", "")

    # If already hydrated (e.g., from webhook handler), skip DB call
    if state.get("daily_task") and state.get("weekly_goal"):
        return {"task_id": task_id}

    if not task_id:
        return {
            "weekly_goal": "No weekly goal found",
            "daily_task": "No task specified",
        }

    supabase = get_supabase_client()

    # Fetch the daily task
    task_resp = (
        supabase.table("tasks")
        .select("title, description, submission_notes, parent_id")
        .eq("id", task_id)
        .single()
        .execute()
    )

    task = task_resp.data
    if not task:
        return {
            "weekly_goal": "Task not found",
            "daily_task": "Task not found",
        }

    daily_task = f"{task['title']}: {task.get('description', 'No description')}"
    submission_notes = task.get("submission_notes", "")

    # Fetch parent weekly goal
    weekly_goal = "No weekly goal linked"
    if task.get("parent_id"):
        parent_resp = (
            supabase.table("tasks")
            .select("title, description")
            .eq("id", task["parent_id"])
            .single()
            .execute()
        )
        if parent_resp.data:
            parent = parent_resp.data
            weekly_goal = f"{parent['title']}: {parent.get('description', '')}"

    return {
        "weekly_goal": weekly_goal,
        "daily_task": daily_task,
        "submission_notes": submission_notes or state.get("submission_notes", ""),
    }

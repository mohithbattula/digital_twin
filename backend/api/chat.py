"""
Jaswanth Digital Twin — Chat Streaming Endpoint
SSE streaming for real-time persona responses. (Doc 3, §2.2)
"""

import json
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from sse_starlette.sse import EventSourceResponse

from core.supabase_client import get_supabase_client
from graph.builder import build_chat_graph
from langchain_core.runnables.config import RunnableConfig
from api.tasks import demo_task_context

router = APIRouter()

DEMO_MESSAGES = [
    {
        "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "session_id": "99999999-9999-4999-8999-999999999999",
        "sender_id": None,
        "sender_type": "twin",
        "content": "Local preview is running. I can help review tasks, explain decisions, and draft feedback.",
        "associated_task_id": None,
        "trace_id": None,
        "created_at": "2026-05-27T10:30:00Z",
    }
]


class ChatRequest(BaseModel):
    session_id: str
    message: str
    user_id: str
    associated_task_id: Optional[str] = None


class ToggleRequest(BaseModel):
    twin_enabled: bool


class LeadMessageRequest(BaseModel):
    message: str
    user_id: str = "b4154bf6-dea0-4451-974c-1d716fc2aa26"


@router.get("/chat/messages")
async def list_chat_messages(session_id: str):
    """Return chat messages, with demo data if Supabase is not ready."""
    try:
        supabase = get_supabase_client()
        resp = (
            supabase.table("chat_messages")
            .select("*")
            .eq("session_id", session_id)
            .order("created_at", desc=False)
            .execute()
        )
        return {"messages": resp.data or []}
    except Exception as e:
        print(f"[WARN] Falling back to demo messages: {e}")
        return {"messages": DEMO_MESSAGES, "source": "demo"}


def _fallback_response(message: str, task_context: str) -> str:
    if not message.strip():
        return "Send me a task or question and I will help you work through it."

    task_note = (
        f"\n\nCurrent weekly context I know:\n{task_context}"
        if task_context
        else "\n\nI do not have this week's tasks yet. Add them in the Tasks view so I can use that context."
    )

    return (
        "I am running in local preview mode because the Supabase chat tables are not available yet. "
        f"I received: \"{message.strip()}\". "
        "Once the database schema is applied, I will persist the conversation and use the full agent pipeline."
        f"{task_note}"
    )


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    SSE streaming endpoint for chat with the digital twin.
    Streams response chunks as Server-Sent Events.
    """
    supabase = None
    chat_history_raw = []
    preview_mode = False
    twin_enabled = True

    try:
        supabase = get_supabase_client()

        # Check if session exists
        has_session = False
        try:
            session_resp = (
                supabase.table("chat_sessions")
                .select("id, team_member_id, twin_enabled")
                .eq("id", request.session_id)
                .single()
                .execute()
            )
            if session_resp.data:
                has_session = True
                twin_enabled = session_resp.data.get("twin_enabled", True)
        except Exception:
            has_session = False

        if not has_session:
            # Attempt to auto-create the session if the user exists
            try:
                user_check = supabase.table("users").select("id").eq("id", request.user_id).single().execute()
                if user_check.data:
                    supabase.table("chat_sessions").insert({
                        "id": request.session_id,
                        "team_member_id": request.user_id
                    }).execute()
                    has_session = True
            except Exception as create_err:
                print(f"[WARN] Failed to auto-create session {request.session_id}: {create_err}")

        if not has_session:
            preview_mode = True
        else:
            supabase.table("chat_messages").insert({
                "session_id": request.session_id,
                "sender_id": request.user_id,
                "sender_type": "human",
                "content": request.message,
                "associated_task_id": request.associated_task_id,
            }).execute()

            # If twin is disabled, we do NOT query LangGraph or stream a response.
            # The client will close the stream immediately.
            if not twin_enabled:
                async def paused_generator():
                    yield {"data": json.dumps({"chunk": ""})}
                    yield {"data": '"[DONE]"'}
                return EventSourceResponse(paused_generator())

            history_resp = (
                supabase.table("chat_messages")
                .select("sender_type, content")
                .eq("session_id", request.session_id)
                .order("created_at", desc=True)
                .limit(20)
                .execute()
            )
            chat_history_raw = history_resp.data or []
            chat_history_raw.reverse()
    except Exception as e:
        print(f"[WARN] Chat stream using preview mode: {e}")
        preview_mode = True

    # ── Build rich task context from the student's actual task data ──────────
    task_context_str = ""
    if not preview_mode and supabase:
        try:
            tasks_resp = (
                supabase.table("tasks")
                .select("id, title, description, scope, status, progress, submission_notes, review_notes, twin_review_notes, parent_id")
                .eq("assigned_to", request.user_id)
                .order("created_at", desc=False)
                .execute()
            )
            all_tasks = tasks_resp.data or []
            weekly_goals = [t for t in all_tasks if t["scope"] == "weekly_goal"]
            daily_tasks = [t for t in all_tasks if t["scope"] == "daily_task"]

            lines = []
            for goal in weekly_goals:
                lines.append(f"\n=== Weekly Goal: {goal['title']} ===")
                if goal.get("description"):
                    lines.append(f"  Description: {goal['description']}")
                children = [t for t in daily_tasks if t.get("parent_id") == goal["id"]]
                for task in children:
                    lines.append(f"\n  Subtask: {task['title']}")
                    lines.append(f"    Status: {task['status']} | Progress: {task['progress']}%")
                    if task.get("submission_notes"):
                        lines.append(f"    Student Submission: {task['submission_notes'][:300]}")
                    if task.get("review_notes"):
                        lines.append(f"    Review/Rejection Reason: {task['review_notes']}")
                    if task.get("twin_review_notes"):
                        lines.append(f"    Jarvis AI Review: {task['twin_review_notes']}")

            task_context_str = "\n".join(lines) if lines else "No tasks found for this student."
        except Exception as ctx_err:
            print(f"[WARN] Could not fetch task context for chat: {ctx_err}")

    # Build state for persona pipeline
    initial_state = {
        "task_id": request.associated_task_id or "",
        "weekly_goal": "",
        "daily_task": "",
        "submission_notes": "",          # actual submission text (empty for chat)
        "task_context": task_context_str, # full task dump for accurate answers
        "is_safe": True,
        "safety_reason": "",
        "evaluation_status": None,
        "technical_gap_analysis": None,
        "rag_context": [],
        "chat_history": chat_history_raw,
        "historical_summary": "",
        "final_response": None,
        "session_id": request.session_id,
        "user_id": request.user_id,
    }

    config = RunnableConfig(
        configurable={"thread_id": request.session_id},
        metadata={"team_member_id": request.user_id},
    )

    async def event_generator():
        try:
            if preview_mode:
                response_text = _fallback_response(request.message, demo_task_context())
            else:
                graph = build_chat_graph()
                final_state = graph.invoke(initial_state, config=config)
                response_text = final_state.get("final_response", "")

            # Simulate streaming by chunking the response
            words = response_text.split(" ")
            for i, word in enumerate(words):
                chunk = word + (" " if i < len(words) - 1 else "")
                yield {"data": json.dumps({"chunk": chunk})}
                await asyncio.sleep(0.03)

            if supabase and not preview_mode:
                supabase.table("chat_messages").insert({
                    "session_id": request.session_id,
                    "sender_id": None,
                    "sender_type": "twin",
                    "content": response_text,
                    "associated_task_id": request.associated_task_id,
                }).execute()

            yield {"data": '"[DONE]"'}

        except Exception as e:
            yield {"data": json.dumps({"error": str(e)})}
            yield {"data": '"[DONE]"'}

    return EventSourceResponse(event_generator())


@router.get("/chat/sessions/{session_id}")
async def get_session_detail(session_id: str):
    """Retrieve chat session details (e.g. twin_enabled status)."""
    try:
        supabase = get_supabase_client()
        resp = supabase.table("chat_sessions").select("*").eq("id", session_id).single().execute()
        if resp.data:
            return {"session": resp.data}
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/chat/sessions/{session_id}/toggle")
async def toggle_twin(session_id: str, payload: ToggleRequest):
    """Toggle whether the AI twin is active for a chat session."""
    try:
        supabase = get_supabase_client()
        resp = supabase.table("chat_sessions").update({
            "twin_enabled": payload.twin_enabled
        }).eq("id", session_id).execute()
        if resp.data:
            return {"status": "success", "twin_enabled": resp.data[0]["twin_enabled"]}
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat/sessions/{session_id}/suggest")
async def suggest_reply(session_id: str):
    """Generate a reply suggestion for the lead using the twin's persona."""
    try:
        supabase = get_supabase_client()
        # Fetch the last 20 messages for context
        history_resp = (
            supabase.table("chat_messages")
            .select("sender_type, content")
            .eq("session_id", session_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        chat_history_raw = history_resp.data or []
        chat_history_raw.reverse()

        session_resp = supabase.table("chat_sessions").select("team_member_id").eq("id", session_id).single().execute()
        user_id = session_resp.data.get("team_member_id") if session_resp.data else ""

        # Invoke chat graph to generate the draft
        initial_state = {
            "task_id": "",
            "weekly_goal": "",
            "daily_task": "",
            "submission_notes": "",
            "is_safe": True,
            "safety_reason": "",
            "evaluation_status": None,
            "technical_gap_analysis": None,
            "rag_context": [],
            "chat_history": chat_history_raw,
            "historical_summary": "",
            "final_response": None,
            "session_id": session_id,
            "user_id": user_id,
        }

        config = RunnableConfig(
            configurable={"thread_id": session_id},
            metadata={"team_member_id": user_id},
        )

        graph = build_chat_graph()
        final_state = graph.invoke(initial_state, config=config)
        suggestion = final_state.get("final_response", "")

        return {"suggestion": suggestion}
    except Exception as e:
        print(f"[ERROR] Suggestion generation failed: {e}")
        return {"suggestion": "hey, i couldn't generate a draft right now. check the logs."}


@router.post("/chat/sessions/{session_id}/send-lead-message")
async def send_lead_message(session_id: str, payload: LeadMessageRequest):
    """Allows the lead to send a message to the student, pretending to be the twin."""
    try:
        supabase = get_supabase_client()
        resp = supabase.table("chat_messages").insert({
            "session_id": session_id,
            "sender_id": payload.user_id,
            "sender_type": "twin",  # Saved as twin so student renders it under Jaswanth's persona
            "content": payload.message,
        }).execute()
        if resp.data:
            return {"status": "success", "message": resp.data[0]}
        raise HTTPException(status_code=500, detail="Failed to insert message")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


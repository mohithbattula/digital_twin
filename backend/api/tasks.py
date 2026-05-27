"""
Jaswanth Digital Twin — Task Management API
Handles task CRUD, submission, review, progress tracking, comments,
and the evaluation webhook.
"""

import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Header, HTTPException, BackgroundTasks, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Literal

from core.config import get_settings
from core.supabase_client import get_supabase_client
from graph.builder import build_evaluation_graph
from langchain_core.runnables.config import RunnableConfig

router = APIRouter()

DEMO_TASKS = []

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads" / "task-docs"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain", "text/markdown", "text/csv",
    "image/png", "image/jpeg", "image/webp",
}
MAX_FILE_SIZE = 10 * 1024 * 1024


class WebhookRecord(BaseModel):
    id: str
    assigned_to: str
    status: str
    submission_notes: Optional[str] = None
    parent_id: Optional[str] = None

class WebhookPayload(BaseModel):
    type: str
    table: str
    record: WebhookRecord
    old_record: Optional[dict] = None

class TaskSubmission(BaseModel):
    submission_notes: str
    documentation_updates: str = ""

class DailyTaskInput(BaseModel):
    title: str
    description: str = ""

class WeekPlanInput(BaseModel):
    user_id: str
    weekly_title: str
    weekly_description: str = ""
    daily_tasks: list[DailyTaskInput] = []

class TaskReview(BaseModel):
    status: Literal["approved", "rejected"]
    review_notes: str = ""

class TaskProgress(BaseModel):
    progress: int
    submission_notes: str = ""

class CommentInput(BaseModel):
    user_id: str
    content: str


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def _build_submission_text(payload: TaskSubmission) -> str:
    notes = payload.submission_notes.strip()
    docs = payload.documentation_updates.strip()
    parts = []
    if notes:
        parts.append(f"Submission notes:\n{notes}")
    if docs:
        parts.append(f"Documentation updates:\n{docs}")
    return "\n\n".join(parts).strip()

def _demo_week_plan(payload: WeekPlanInput) -> list[dict]:
    weekly_id = str(uuid.uuid4())
    weekly_task = {
        "id": weekly_id, "assigned_to": payload.user_id,
        "title": payload.weekly_title.strip(),
        "description": payload.weekly_description.strip(),
        "scope": "weekly_goal", "status": "pending",
        "submission_notes": "", "parent_id": None,
        "progress": 0, "due_date": None,
        "completed_at": None, "reviewed_at": None,
        "review_notes": None, "created_at": _now_iso(),
    }
    daily_tasks = [
        {
            "id": str(uuid.uuid4()), "assigned_to": payload.user_id,
            "title": task.title.strip(), "description": task.description.strip(),
            "scope": "daily_task", "status": "pending",
            "submission_notes": "", "parent_id": weekly_id,
            "progress": 0, "due_date": None,
            "completed_at": None, "reviewed_at": None,
            "review_notes": None, "created_at": _now_iso(),
        }
        for task in payload.daily_tasks if task.title.strip()
    ]
    created = [weekly_task, *daily_tasks]
    DEMO_TASKS[:0] = created
    return created

def demo_task_context() -> str:
    weekly_goals = [t for t in DEMO_TASKS if t["scope"] == "weekly_goal"]
    daily_tasks = [t for t in DEMO_TASKS if t["scope"] == "daily_task"]
    lines = []
    for goal in weekly_goals[:3]:
        lines.append(f"Weekly goal: {goal['title']} - {goal.get('description') or 'No description'}")
        children = [t for t in daily_tasks if t.get("parent_id") == goal["id"]]
        for child in children[:6]:
            lines.append(f"Daily task: {child['title']} - {child.get('description') or 'No description'}")
            if child.get("submission_notes"):
                lines.append(f"Submission and docs: {child['submission_notes']}")
    return "\n".join(lines)


# ── Endpoints ──

@router.get("/tasks")
async def list_tasks(role: str = "student", user_id: str = ""):
    """Return tasks filtered by role."""
    try:
        supabase = get_supabase_client()
        query = supabase.table("tasks").select("*").order("created_at", desc=False)
        if role == "student" and user_id:
            query = query.eq("assigned_to", user_id)
        resp = query.execute()
        return {"tasks": resp.data or []}
    except Exception as e:
        print(f"[WARN] Falling back to demo tasks: {e}")
        tasks = DEMO_TASKS
        if role == "student" and user_id:
            tasks = [t for t in tasks if t.get("assigned_to") == user_id]
        return {"tasks": tasks, "source": "demo"}


@router.get("/tasks/stats")
async def task_stats(user_id: str = ""):
    """Aggregated task statistics."""
    try:
        supabase = get_supabase_client()
        query = supabase.table("tasks").select("id, status, scope, progress, assigned_to")
        if user_id:
            query = query.eq("assigned_to", user_id)
        resp = query.execute()
        tasks = resp.data or []
    except Exception as e:
        print(f"[WARN] Using demo tasks for stats: {e}")
        tasks = [t for t in DEMO_TASKS if not user_id or t.get("assigned_to") == user_id]

    daily = [t for t in tasks if t.get("scope") == "daily_task"]
    sc = {}
    for t in tasks:
        s = t.get("status", "pending")
        sc[s] = sc.get(s, 0) + 1
    avg_progress = round(sum(t.get("progress", 0) for t in daily) / len(daily)) if daily else 0

    return {
        "total": len(tasks), "weekly_goals": len(tasks) - len(daily),
        "daily_tasks": len(daily),
        "pending": sc.get("pending", 0), "submitted": sc.get("submitted", 0),
        "approved": sc.get("approved", 0), "rejected": sc.get("rejected", 0),
        "flagged": sc.get("flagged", 0), "avg_progress": avg_progress,
    }


@router.post("/tasks/week-plan", status_code=201)
async def create_week_plan(payload: WeekPlanInput):
    if not payload.weekly_title.strip():
        raise HTTPException(status_code=400, detail="Weekly goal title is required")
    cleaned_daily = [
        DailyTaskInput(title=t.title.strip(), description=t.description.strip())
        for t in payload.daily_tasks if t.title.strip()
    ]
    cleaned = WeekPlanInput(
        user_id=payload.user_id, weekly_title=payload.weekly_title.strip(),
        weekly_description=payload.weekly_description.strip(), daily_tasks=cleaned_daily,
    )
    try:
        supabase = get_supabase_client()
        weekly_resp = supabase.table("tasks").insert({
            "assigned_to": cleaned.user_id, "title": cleaned.weekly_title,
            "description": cleaned.weekly_description, "scope": "weekly_goal",
            "status": "pending", "submission_notes": "", "progress": 0,
        }).execute()
        weekly_task = weekly_resp.data[0]
        daily_payload = [
            {"assigned_to": cleaned.user_id, "title": t.title,
             "description": t.description, "scope": "daily_task",
             "status": "pending", "submission_notes": "",
             "parent_id": weekly_task["id"], "progress": 0}
            for t in cleaned.daily_tasks
        ]
        if daily_payload:
            daily_resp = supabase.table("tasks").insert(daily_payload).execute()
            return {"tasks": [weekly_task, *(daily_resp.data or [])]}
        return {"tasks": [weekly_task]}
    except Exception as e:
        print(f"[WARN] Supabase week plan creation failed: {e}")
        return {"tasks": _demo_week_plan(cleaned), "source": "demo"}


@router.patch("/tasks/{task_id}/submit")
async def submit_task(task_id: str, payload: TaskSubmission, background_tasks: BackgroundTasks):
    notes = _build_submission_text(payload)
    if not notes:
        raise HTTPException(status_code=400, detail="Submission notes or documentation updates are required")
    try:
        supabase = get_supabase_client()
        resp = supabase.table("tasks").update({
            "status": "submitted", "submission_notes": notes, "completed_at": _now_iso(),
        }).eq("id", task_id).execute()
        if resp.data:
            task_data = resp.data[0]
            background_tasks.add_task(
                _run_evaluation,
                task_id=task_id,
                user_id=task_data.get("assigned_to"),
                submission_notes=notes,
            )
            # Also notify lead via Jarvis briefing in their chat
            background_tasks.add_task(
                _post_jarvis_briefing_to_lead,
                submitted_task=task_data,
            )
            return {"task": task_data}
    except Exception as e:
        print(f"[WARN] Supabase task submission failed: {e}")
    for task in DEMO_TASKS:
        if task["id"] == task_id:
            task.update({"status": "submitted", "submission_notes": notes, "completed_at": _now_iso()})
            return {"task": task, "source": "demo"}
    raise HTTPException(status_code=404, detail="Task not found")



@router.patch("/tasks/{task_id}/review")
async def review_task(task_id: str, payload: TaskReview):
    """Lead approves or rejects a submitted task."""
    update = {"status": payload.status, "review_notes": payload.review_notes.strip(), "reviewed_at": _now_iso()}
    try:
        supabase = get_supabase_client()
        resp = supabase.table("tasks").update(update).eq("id", task_id).execute()
        if resp.data:
            return {"task": resp.data[0]}
    except Exception as e:
        print(f"[WARN] Supabase review failed: {e}")
    for task in DEMO_TASKS:
        if task["id"] == task_id:
            task.update(update)
            return {"task": task, "source": "demo"}
    raise HTTPException(status_code=404, detail="Task not found")


@router.patch("/tasks/{task_id}/progress")
async def update_progress(task_id: str, payload: TaskProgress):
    """Student updates task completion progress (0-100)."""
    if not (0 <= payload.progress <= 100):
        raise HTTPException(status_code=400, detail="Progress must be between 0 and 100")
    update: dict = {"progress": payload.progress}
    if payload.submission_notes.strip():
        update["submission_notes"] = payload.submission_notes.strip()
    try:
        supabase = get_supabase_client()
        resp = supabase.table("tasks").update(update).eq("id", task_id).execute()
        if resp.data:
            return {"task": resp.data[0]}
    except Exception as e:
        print(f"[WARN] Supabase progress update failed: {e}")
    for task in DEMO_TASKS:
        if task["id"] == task_id:
            task.update(update)
            return {"task": task, "source": "demo"}
    raise HTTPException(status_code=404, detail="Task not found")


@router.get("/tasks/{task_id}/comments")
async def list_comments(task_id: str):
    try:
        supabase = get_supabase_client()
        resp = supabase.table("task_comments").select(
            "*, users(name, role, avatar_url)"
        ).eq("task_id", task_id).order("created_at", desc=False).execute()
        return {"comments": resp.data or []}
    except Exception as e:
        print(f"[WARN] Failed to load comments: {e}")
        return {"comments": []}


@router.post("/tasks/{task_id}/comments", status_code=201)
async def add_comment(task_id: str, payload: CommentInput):
    if not payload.content.strip():
        raise HTTPException(status_code=400, detail="Comment content is required")
    try:
        supabase = get_supabase_client()
        resp = supabase.table("task_comments").insert({
            "task_id": task_id, "user_id": payload.user_id,
            "content": payload.content.strip(),
        }).execute()
        if resp.data:
            comment = supabase.table("task_comments").select(
                "*, users(name, role, avatar_url)"
            ).eq("id", resp.data[0]["id"]).single().execute()
            return {"comment": comment.data}
    except Exception as e:
        print(f"[WARN] Failed to add comment: {e}")
    return {"comment": {
        "id": str(uuid.uuid4()), "task_id": task_id,
        "user_id": payload.user_id, "content": payload.content.strip(),
        "created_at": _now_iso(),
        "users": {"name": "Unknown", "role": "team_member", "avatar_url": None},
    }, "source": "demo"}


@router.post("/tasks/{task_id}/upload")
async def upload_task_documents(
    task_id: str,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
):
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")
    if len(files) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 files per upload")
    uploaded = []
    for file in files:
        content_type = file.content_type or "application/octet-stream"
        if content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=415, detail=f"File type '{content_type}' not allowed")
        content = await file.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File '{file.filename}' exceeds 10 MB")
        ext = Path(file.filename or "doc").suffix or ".bin"
        storage_name = f"{task_id}/{uuid.uuid4().hex[:12]}{ext}"
        file_url, source = "", "supabase"
        try:
            supabase = get_supabase_client()
            try:
                supabase.storage.create_bucket("task-docs", options={"public": False})
            except Exception:
                pass
            supabase.storage.from_("task-docs").upload(
                path=storage_name, file=content, file_options={"content-type": content_type})
            signed = supabase.storage.from_("task-docs").create_signed_url(storage_name, 60*60*24*7)
            file_url = signed.get("signedURL", "") if isinstance(signed, dict) else ""
        except Exception as e:
            print(f"[WARN] Supabase storage upload failed, local fallback: {e}")
            source = "local"
            local_dir = UPLOAD_DIR / task_id
            local_dir.mkdir(parents=True, exist_ok=True)
            local_path = local_dir / f"{uuid.uuid4().hex[:12]}{ext}"
            local_path.write_bytes(content)
            file_url = f"/v1/tasks/{task_id}/files/{local_path.name}"
        uploaded.append({"name": file.filename, "size": len(content),
                         "type": content_type, "url": file_url, "source": source})
    
    # Trigger Jarvis briefing notification in the background
    background_tasks.add_task(
        _post_jarvis_upload_briefing_to_lead,
        task_id=task_id,
        uploaded_files=uploaded,
    )
    
    return {"files": uploaded}


@router.get("/tasks/{task_id}/files")
async def list_task_files(task_id: str):
    """List all uploaded files for a task (checks local disk + Supabase Storage)."""
    files = []

    # 1. Check local uploads directory
    local_dir = UPLOAD_DIR / task_id
    if local_dir.exists() and local_dir.is_dir():
        for f in local_dir.iterdir():
            if f.is_file():
                # Guess MIME from extension
                ext = f.suffix.lower()
                mime_map = {
                    ".pdf": "application/pdf",
                    ".doc": "application/msword",
                    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                    ".txt": "text/plain",
                    ".md": "text/markdown",
                    ".csv": "text/csv",
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".webp": "image/webp",
                }
                files.append({
                    "name": f.name,
                    "size": f.stat().st_size,
                    "type": mime_map.get(ext, "application/octet-stream"),
                    "url": f"/v1/tasks/{task_id}/files/{f.name}",
                    "source": "local",
                })

    # 2. Check Supabase Storage
    try:
        supabase = get_supabase_client()
        storage_files = supabase.storage.from_("task-docs").list(task_id)
        if storage_files:
            for sf in storage_files:
                name = sf.get("name", "")
                if not name:
                    continue
                storage_path = f"{task_id}/{name}"
                # Generate fresh signed URL
                signed = supabase.storage.from_("task-docs").create_signed_url(
                    storage_path, 60 * 60 * 24 * 7
                )
                signed_url = ""
                if isinstance(signed, dict):
                    signed_url = signed.get("signedURL", signed.get("signedUrl", ""))
                files.append({
                    "name": name,
                    "size": sf.get("metadata", {}).get("size", 0) if isinstance(sf.get("metadata"), dict) else 0,
                    "type": sf.get("metadata", {}).get("mimetype", "application/octet-stream") if isinstance(sf.get("metadata"), dict) else "application/octet-stream",
                    "url": signed_url,
                    "source": "supabase",
                })
    except Exception as e:
        print(f"[WARN] Supabase storage list failed: {e}")

    return {"files": files}


@router.get("/tasks/{task_id}/files/{filename}")
async def serve_local_file(task_id: str, filename: str):
    file_path = UPLOAD_DIR / task_id / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(file_path, filename=filename)


@router.get("/users")
async def list_users():
    try:
        supabase = get_supabase_client()
        resp = supabase.table("users").select("*").execute()
        return {"users": resp.data or []}
    except Exception as e:
        print(f"[WARN] Failed to list users: {e}")
        return {"users": []}


async def _run_evaluation(task_id: str, user_id: str, submission_notes: str):
    try:
        supabase = get_supabase_client()
        task_resp = supabase.table("tasks").select("*").eq("id", task_id).single().execute()
        task = task_resp.data
        weekly_goal = ""
        if task.get("parent_id"):
            parent_resp = supabase.table("tasks").select("title, description").eq(
                "id", task["parent_id"]).single().execute()
            weekly_goal = f"{parent_resp.data['title']}: {parent_resp.data.get('description', '')}"
        session_resp = supabase.table("chat_sessions").select("id").eq(
            "team_member_id", user_id).order("created_at", desc=True).limit(1).execute()
        if session_resp.data:
            session_id = session_resp.data[0]["id"]
        else:
            new_session = supabase.table("chat_sessions").insert({"team_member_id": user_id}).execute()
            session_id = new_session.data[0]["id"]
        initial_state = {
            "task_id": task_id, "weekly_goal": weekly_goal,
            "daily_task": f"{task['title']}: {task.get('description', '')}",
            "submission_notes": submission_notes or "",
            "is_safe": True, "safety_reason": "",
            "evaluation_status": None, "technical_gap_analysis": None,
            "rag_context": [], "chat_history": [], "historical_summary": "",
            "final_response": None, "session_id": session_id, "user_id": user_id,
        }
        config = RunnableConfig(
            configurable={"thread_id": session_id},
            metadata={"task_id": task_id, "team_member_id": user_id},
        )
        graph = build_evaluation_graph()
        final_state = graph.invoke(initial_state, config=config)

        # Do NOT post directly to the chat_messages, so the student doesn't see it yet.
        # Instead, update the twin_review fields in the database.
        is_safe = final_state.get("is_safe", True)
        if not is_safe:
            supabase.table("tasks").update({
                "status": "flagged",
                "twin_review_status": "rejected",
                "twin_review_notes": f"Safety Gate Blocked: {final_state.get('safety_reason', 'Unsafe content detected.')}"
            }).eq("id", task_id).execute()
        else:
            supabase.table("tasks").update({
                "twin_review_status": final_state.get("evaluation_status", "needs_clarification"),
                "twin_review_notes": final_state.get("technical_gap_analysis", "Review complete. Pending human approval.")
            }).eq("id", task_id).execute()

    except Exception as e:
        print(f"[ERROR] Evaluation failed for task {task_id}: {e}")
        try:
            supabase = get_supabase_client()
            supabase.table("tasks").update({
                "twin_review_status": "needs_clarification",
                "twin_review_notes": "Jarvis evaluation failed. Manual review recommended."
            }).eq("id", task_id).execute()
        except Exception:
            pass





# ── Lead constants ──
LEAD_ID = "b4154bf6-dea0-4451-974c-1d716fc2aa26"
LEAD_BRIEFING_SESSION_PREFIX = "briefing-lead"


async def _post_jarvis_briefing_to_lead(submitted_task: dict):
    """
    After a student submits a task, Jarvis auto-posts a briefing message
    to the lead's dedicated briefing chat session containing:
    - Submission alert for the specific task
    - Overall task progress snapshot
    - Pending reviews count
    - Near-deadline tasks
    """
    try:
        supabase = get_supabase_client()
        task_title = submitted_task.get("title", "Unknown Task")
        student_id = submitted_task.get("assigned_to", "")

        # Get or create lead's briefing session
        session_id = f"{LEAD_BRIEFING_SESSION_PREFIX}-{LEAD_ID}"
        try:
            existing = supabase.table("chat_sessions").select("id").eq("id", session_id).execute()
            if not existing.data:
                supabase.table("chat_sessions").insert({
                    "id": session_id,
                    "team_member_id": LEAD_ID,
                }).execute()
        except Exception as sess_err:
            print(f"[WARN] Briefing session setup: {sess_err}")
            return

        # Fetch all tasks for dashboard stats
        all_tasks_resp = supabase.table("tasks").select(
            "id, title, scope, status, progress, due_date, assigned_to, twin_review_status"
        ).execute()
        all_tasks = all_tasks_resp.data or []

        daily = [t for t in all_tasks if t["scope"] == "daily_task"]
        weekly = [t for t in all_tasks if t["scope"] == "weekly_goal"]
        pending = [t for t in daily if t["status"] == "pending"]
        submitted = [t for t in daily if t["status"] == "submitted"]
        approved = [t for t in daily if t["status"] == "approved"]
        rejected = [t for t in daily if t["status"] == "rejected"]
        avg_progress = round(sum(t["progress"] for t in daily) / len(daily), 1) if daily else 0

        # Get student name
        student_name = "the student"
        try:
            user_resp = supabase.table("users").select("name").eq("id", student_id).single().execute()
            if user_resp.data:
                student_name = user_resp.data.get("name", student_name)
        except Exception:
            pass

        # Get parent weekly goal for context
        parent_title = ""
        if submitted_task.get("parent_id"):
            try:
                parent_resp = supabase.table("tasks").select("title").eq(
                    "id", submitted_task["parent_id"]
                ).single().execute()
                if parent_resp.data:
                    parent_title = parent_resp.data.get("title", "")
            except Exception:
                pass

        # Build the briefing message
        lines = [
            f"📬 **New Submission Alert**",
            f"",
            f"**{student_name}** just submitted: **{task_title}**",
        ]
        if parent_title:
            lines.append(f"Part of: {parent_title.replace('TASK ', 'Task ')}")
        lines += [
            f"",
            f"─────────────────────────",
            f"📊 **Task Board Snapshot**",
            f"• Pending: {len(pending)} tasks",
            f"• Awaiting Review: {len(submitted)} submissions",
            f"• Approved: {len(approved)}/{len(daily)} subtasks",
            f"• Rejected: {len(rejected)} (need resubmission)",
            f"• Avg Progress: {avg_progress}%",
            f"",
        ]

        # Add pending review list
        if submitted:
            lines.append(f"⏳ **Needs Your Review Now:**")
            for t in submitted[:5]:
                twin_flag = " 🤖 Jarvis flagged" if t.get("twin_review_status") == "rejected" else \
                            " ✅ Jarvis approved" if t.get("twin_review_status") == "approved" else ""
                lines.append(f"  • {t['title'].replace('Subtask ', '').split(' — ')[0]}{twin_flag}")
            if len(submitted) > 5:
                lines.append(f"  ... and {len(submitted) - 5} more")
            lines.append("")

        # Near deadline tasks (any with due_date in next 3 days)
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        near_deadline = []
        for t in daily:
            if t.get("due_date") and t["status"] not in ("approved", "rejected"):
                try:
                    from datetime import datetime as dt
                    due = dt.fromisoformat(t["due_date"].replace("Z", "+00:00"))
                    if timedelta(0) < (due - now) <= timedelta(days=3):
                        near_deadline.append((t, due))
                except Exception:
                    pass
        if near_deadline:
            lines.append("⚠️ **Deadlines in Next 3 Days:**")
            for t, due in near_deadline[:3]:
                lines.append(f"  • {t['title'].split(' — ')[-1][:40]} — due {due.strftime('%b %d')}")
            lines.append("")

        lines.append("→ Head to Pending Reviews to action this submission.")

        briefing_message = "\n".join(lines)

        # Post to lead's briefing chat session
        supabase.table("chat_messages").insert({
            "session_id": session_id,
            "sender_id": None,
            "sender_type": "twin",
            "content": briefing_message,
            "associated_task_id": submitted_task.get("id"),
        }).execute()

        print(f"[INFO] Jarvis briefing posted to lead for task: {task_title}")

    except Exception as e:
        print(f"[ERROR] Failed to post Jarvis briefing to lead: {e}")


async def _post_jarvis_upload_briefing_to_lead(task_id: str, uploaded_files: list):
    """
    After a student uploads modules/documents, Jarvis auto-posts a briefing
    message to the lead's briefing chat session.
    """
    try:
        supabase = get_supabase_client()
        # Fetch task details
        task_resp = supabase.table("tasks").select("*").eq("id", task_id).single().execute()
        if not task_resp.data:
            print(f"[WARN] Task {task_id} not found for upload briefing")
            return
        
        task_data = task_resp.data
        task_title = task_data.get("title", "Unknown Task")
        student_id = task_data.get("assigned_to", "")

        # Get or create lead's briefing session
        session_id = f"{LEAD_BRIEFING_SESSION_PREFIX}-{LEAD_ID}"
        try:
            existing = supabase.table("chat_sessions").select("id").eq("id", session_id).execute()
            if not existing.data:
                supabase.table("chat_sessions").insert({
                    "id": session_id,
                    "team_member_id": LEAD_ID,
                }).execute()
        except Exception as sess_err:
            print(f"[WARN] Briefing session setup: {sess_err}")
            return

        # Fetch all tasks for dashboard stats
        all_tasks_resp = supabase.table("tasks").select(
            "id, title, scope, status, progress, due_date, assigned_to, twin_review_status"
        ).execute()
        all_tasks = all_tasks_resp.data or []

        daily = [t for t in all_tasks if t["scope"] == "daily_task"]
        pending = [t for t in daily if t["status"] == "pending"]
        submitted = [t for t in daily if t["status"] == "submitted"]
        approved = [t for t in daily if t["status"] == "approved"]
        rejected = [t for t in daily if t["status"] == "rejected"]
        avg_progress = round(sum(t["progress"] for t in daily) / len(daily), 1) if daily else 0

        # Get student name
        student_name = "the student"
        try:
            user_resp = supabase.table("users").select("name").eq("id", student_id).single().execute()
            if user_resp.data:
                student_name = user_resp.data.get("name", student_name)
        except Exception:
            pass

        # Get parent weekly goal for context
        parent_title = ""
        if task_data.get("parent_id"):
            try:
                parent_resp = supabase.table("tasks").select("title").eq(
                    "id", task_data["parent_id"]
                ).single().execute()
                if parent_resp.data:
                    parent_title = parent_resp.data.get("title", "")
            except Exception:
                pass

        # Build the briefing message
        lines = [
            f"📎 **New Module/Document Upload**",
            f"",
            f"**{student_name}** uploaded {len(uploaded_files)} module/document(s) for: **{task_title}**",
        ]
        if parent_title:
            lines.append(f"Part of: {parent_title.replace('TASK ', 'Task ')}")
        
        lines.append("")
        lines.append("📁 **Uploaded Files:**")
        for f in uploaded_files:
            size_kb = round(f.get('size', 0) / 1024, 1)
            lines.append(f"  • {f.get('name')} ({size_kb} KB)")

        lines += [
            f"",
            f"─────────────────────────",
            f"📊 **Task Board Snapshot**",
            f"• Pending: {len(pending)} tasks",
            f"• Awaiting Review: {len(submitted)} submissions",
            f"• Approved: {len(approved)}/{len(daily)} subtasks",
            f"• Rejected: {len(rejected)} (need resubmission)",
            f"• Avg Progress: {avg_progress}%",
            f"",
        ]

        # Add pending review list
        if submitted:
            lines.append(f"⏳ **Needs Your Review Now:**")
            for t in submitted[:5]:
                twin_flag = " 🤖 Jarvis flagged" if t.get("twin_review_status") == "rejected" else \
                            " ✅ Jarvis approved" if t.get("twin_review_status") == "approved" else ""
                lines.append(f"  • {t['title'].replace('Subtask ', '').split(' — ')[0]}{twin_flag}")
            if len(submitted) > 5:
                lines.append(f"  ... and {len(submitted) - 5} more")
            lines.append("")

        # Near deadline tasks (any with due_date in next 3 days)
        from datetime import timedelta
        now = datetime.now(timezone.utc)
        near_deadline = []
        for t in daily:
            if t.get("due_date") and t["status"] not in ("approved", "rejected"):
                try:
                    from datetime import datetime as dt
                    due = dt.fromisoformat(t["due_date"].replace("Z", "+00:00"))
                    if timedelta(0) < (due - now) <= timedelta(days=3):
                        near_deadline.append((t, due))
                except Exception:
                    pass
        if near_deadline:
            lines.append("⚠️ **Deadlines in Next 3 Days:**")
            for t, due in near_deadline[:3]:
                lines.append(f"  • {t['title'].split(' — ')[-1][:40]} — due {due.strftime('%b %d')}")
            lines.append("")

        lines.append("→ Would you like to review/action this task? Use the inline options below.")

        briefing_message = "\n".join(lines)

        # Post to lead's briefing chat session
        supabase.table("chat_messages").insert({
            "session_id": session_id,
            "sender_id": None,
            "sender_type": "twin",
            "content": briefing_message,
            "associated_task_id": task_id,
        }).execute()

        print(f"[INFO] Jarvis upload briefing posted to lead for task: {task_title}")

    except Exception as e:
        print(f"[ERROR] Failed to post Jarvis upload briefing to lead: {e}")


@router.post("/tasks/evaluate", status_code=202)

async def evaluate_task(
    payload: WebhookPayload,
    background_tasks: BackgroundTasks,
    x_webhook_secret: str = Header(default="", alias="x-webhook-secret"),
):
    settings = get_settings()
    if settings.webhook_secret and x_webhook_secret != settings.webhook_secret:
        raise HTTPException(status_code=403, detail="Invalid webhook secret")
    if payload.record.status != "submitted":
        return {"status": "ignored", "reason": "Not a submission event"}
    job_id = str(uuid.uuid4())
    background_tasks.add_task(
        _run_evaluation, task_id=payload.record.id,
        user_id=payload.record.assigned_to,
        submission_notes=payload.record.submission_notes or "",
    )
    return {"status": "processing", "job_id": job_id, "message": "Evaluation workflow initiated."}

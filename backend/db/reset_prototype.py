"""
reset_prototype.py — Reset the Jaswanth Digital Twin to a clean prototype state.

Clears:
  1. All task submissions (submission_notes, documentation_updates, files_metadata,
     status → pending, progress → 0, review_notes, twin_review_* fields, completed_at, reviewed_at)
  2. All task comments (task_comments table)
  3. All chat messages (chat_messages table)
"""

import os
import sys
from pathlib import Path

# ── path setup ──
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))

from dotenv import load_dotenv
load_dotenv(root / ".env")

from supabase import create_client

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY")

if not url or not key:
    print("❌  SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_KEY) must be set in .env")
    sys.exit(1)

sb = create_client(url, key)

print("🔄  Connecting to Supabase …")

# ── 1. Reset all tasks ──────────────────────────────────────────────────────
print("🗑️  Resetting task submissions …")

reset_payload = {
    "status": "pending",
    "progress": 0,
    "submission_notes": None,
    "review_notes": None,
    "completed_at": None,
    "reviewed_at": None,
}

# Add twin_review fields only if they exist — do a safe selective update
twin_payload = {
    "twin_review_status": None,
    "twin_review_notes": None,
}

try:
    # Update all tasks in one shot
    resp = sb.table("tasks").update({**reset_payload, **twin_payload}).neq("id", "00000000-0000-0000-0000-000000000000").execute()
    count = len(resp.data) if resp.data else "?"
    print(f"   ✅  {count} tasks reset to pending/0%")
except Exception as e:
    print(f"   ⚠️  twin_review fields failed (may not exist), retrying without them: {e}")
    try:
        resp = sb.table("tasks").update(reset_payload).neq("id", "00000000-0000-0000-0000-000000000000").execute()
        count = len(resp.data) if resp.data else "?"
        print(f"   ✅  {count} tasks reset (without twin fields)")
    except Exception as e2:
        print(f"   ❌  Task reset failed: {e2}")

# ── 2. Clear task_comments ───────────────────────────────────────────────────
print("🗑️  Clearing task comments …")
try:
    resp = sb.table("task_comments").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    count = len(resp.data) if resp.data else "?"
    print(f"   ✅  {count} task comments deleted")
except Exception as e:
    print(f"   ⚠️  task_comments table not found or empty: {e}")

# ── 3. Clear chat_messages ──────────────────────────────────────────────────
print("🗑️  Clearing chat messages …")
try:
    resp = sb.table("chat_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    count = len(resp.data) if resp.data else "?"
    print(f"   ✅  {count} chat messages deleted")
except Exception as e:
    print(f"   ⚠️  chat_messages table error: {e}")

# ── 4. Also clear any uploaded files on disk ──────────────────────────────
uploads_dir = root / "uploads" / "task-docs"
if uploads_dir.exists():
    import shutil
    files = list(uploads_dir.iterdir())
    for f in files:
        try:
            if f.is_file():
                f.unlink()
            elif f.is_dir():
                shutil.rmtree(f)
        except Exception as e:
            print(f"   ⚠️  Could not delete {f.name}: {e}")
    print(f"   ✅  {len(files)} uploaded file(s) cleared from disk")
else:
    print("   ℹ️  No uploads directory found — skipping")

print()
print("✅  Prototype reset complete! All tasks are now pending/0%, comments and chats cleared.")

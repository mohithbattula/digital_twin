import os, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
from dotenv import load_dotenv
load_dotenv(root / ".env")
from supabase import create_client

url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_KEY") or os.environ.get("SUPABASE_ANON_KEY")
sb = create_client(url, key)

# 1. Clear all chat messages
r = sb.table("chat_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
print(f"Chat messages deleted: {len(r.data) if r.data else 0}")

# 2. Also reset any tasks that still have submission/rejected state
reset = {
    "status": "pending",
    "progress": 0,
    "submission_notes": None,
    "review_notes": None,
    "completed_at": None,
    "reviewed_at": None,
    "twin_review_status": None,
    "twin_review_notes": None,
}
r2 = sb.table("tasks").update(reset).neq("status", "pending").execute()
print(f"Non-pending tasks reset: {len(r2.data) if r2.data else 0}")

# 3. Clear task comments too
try:
    r3 = sb.table("task_comments").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
    print(f"Task comments deleted: {len(r3.data) if r3.data else 0}")
except Exception as e:
    print(f"Comments skip: {e}")

print("Done — prototype is fully clean.")

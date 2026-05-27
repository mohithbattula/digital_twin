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

# Verify tasks
tasks = sb.table("tasks").select("title,scope,status,progress,submission_notes,created_at").order("created_at", desc=False).execute()
print("--- TASKS (ascending) ---")
for t in tasks.data:
    scope = t["scope"][:4].upper()
    status = t["status"]
    prog = t["progress"]
    title = t["title"][:55]
    sub = "HAS_SUB" if t.get("submission_notes") else "clean"
    print(f"  [{scope}] {status:10s} {prog:3d}%  {sub:8s}  {title}")

# Summary
statuses = [t["status"] for t in tasks.data]
print(f"\nSummary: {len(tasks.data)} tasks | pending={statuses.count('pending')} | submitted={statuses.count('submitted')} | approved={statuses.count('approved')}")

# Verify chat cleared
chat = sb.table("chat_messages").select("id").execute()
print(f"\n--- CHAT MESSAGES: {len(chat.data)} (should be 0) ---")

# Verify comments cleared
try:
    comments = sb.table("task_comments").select("id").execute()
    print(f"--- TASK COMMENTS: {len(comments.data)} (should be 0) ---")
except Exception as e:
    print(f"--- TASK COMMENTS: could not query ({e}) ---")

print("\nDONE")

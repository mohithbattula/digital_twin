import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from core.supabase_client import get_supabase_client

def main():
    supabase = get_supabase_client()
    try:
        users = supabase.table("users").select("*").execute()
        print("--- Users in DB ---")
        for u in users.data:
            print(f"ID: {u.get('id')} | Name: {u.get('name')} | Role: {u.get('role')}")
    except Exception as e:
        print("Failed to query users:", e)

    try:
        sessions = supabase.table("chat_sessions").select("*").execute()
        print("\n--- Chat Sessions in DB ---")
        for s in sessions.data:
            print(f"Session ID: {s.get('id')} | Member ID: {s.get('team_member_id')}")
    except Exception as e:
        print("Failed to query chat_sessions:", e)

if __name__ == "__main__":
    main()

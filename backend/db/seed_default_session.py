import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from core.supabase_client import get_supabase_client

def main():
    supabase = get_supabase_client()
    session_id = "99999999-9999-4999-8999-999999999999"
    user_id = "93687b3d-0063-4de2-8eea-5c2135e7ffe8"
    
    try:
        # Check if session exists
        check = supabase.table("chat_sessions").select("id").eq("id", session_id).execute()
        if check.data:
            print("Default session already exists in DB.")
            return
        
        # Insert session
        supabase.table("chat_sessions").insert({
            "id": session_id,
            "team_member_id": user_id
        }).execute()
        print("Successfully seeded default chat session!")
    except Exception as e:
        print("Failed to seed default chat session:", e)

if __name__ == "__main__":
    main()

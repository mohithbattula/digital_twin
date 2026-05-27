import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from core.supabase_client import get_supabase_client

def main():
    supabase = get_supabase_client()
    
    print("--- Checking chat_sessions columns ---")
    try:
        resp = supabase.table("chat_sessions").select("*").limit(1).execute()
        if resp.data:
            print("Columns in chat_sessions:", list(resp.data[0].keys()))
        else:
            print("No sessions found, trying to insert test row...")
            # We can't insert easily without valid user, but let's query the API catalog
    except Exception as e:
        print("Failed to query chat_sessions:", e)

    print("\n--- Checking tasks columns ---")
    try:
        resp = supabase.table("tasks").select("*").limit(1).execute()
        if resp.data:
            print("Columns in tasks:", list(resp.data[0].keys()))
        else:
            print("No tasks found.")
    except Exception as e:
        print("Failed to query tasks:", e)

if __name__ == "__main__":
    main()

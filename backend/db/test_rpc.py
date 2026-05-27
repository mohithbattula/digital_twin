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
        # Try a simple SELECT via exec_sql
        resp = supabase.rpc("exec_sql", {"query": "SELECT 1 as val;"}).execute()
        print("[SUCCESS] exec_sql RPC function is available!")
        print("Response data:", resp.data)
    except Exception as e:
        print("[FAILED] exec_sql RPC is not available:", e)

if __name__ == "__main__":
    main()

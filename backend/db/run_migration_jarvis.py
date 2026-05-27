import os
import sys
import requests
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

def execute_sql(sql: str, label: str = ""):
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    pg_url = SUPABASE_URL.replace("supabase.co", "supabase.co") + "/pg/query"
    try:
        resp = requests.post(pg_url, headers=headers, json={"query": sql}, timeout=30)
        if resp.status_code in (200, 201, 204):
            print(f"  [OK] {label}")
            return True
        else:
            raise Exception(f"Status {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        try:
            resp2 = requests.post(
                f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
                headers=headers,
                json={"query": sql},
                timeout=30,
            )
            if resp2.status_code in (200, 201, 204):
                print(f"  [OK] {label}")
                return True
            else:
                raise Exception(f"RPC failed: {resp2.status_code}")
        except Exception as e2:
            print(f"  [FAIL] {label}: {e} / {e2}")
            return False

def run_migration():
    print("=" * 60)
    print("[MIGRATE] Running Jarvis Database Migration")
    print("=" * 60)
    
    migration_sql = Path(__file__).parent / "migration_jarvis.sql"
    if not migration_sql.exists():
        print(f"[ERROR] Migration file not found: {migration_sql}")
        return False

    sql = migration_sql.read_text(encoding="utf-8")
    print(f"[INFO] Loaded migration SQL ({len(sql)} chars)")
    
    success = execute_sql(sql, "Full Jarvis migration batch")
    if not success:
        print("[INFO] Retrying statements individually...")
        statements = [s.strip() for s in sql.split(";") if s.strip() and not s.strip().startswith("--")]
        ok = True
        for i, stmt in enumerate(statements):
            if not execute_sql(stmt + ";", f"Statement #{i+1}"):
                ok = False
        success = ok

    print("=" * 60)
    if success:
        print("[DONE] Jarvis migration completed successfully!")
    else:
        print("[FAIL] Jarvis migration failed. Please check Supabase credentials/network.")
    print("=" * 60)
    return success

if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)

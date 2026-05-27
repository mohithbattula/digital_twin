"""
Run migration SQL against Supabase using the REST SQL endpoint.
This bypasses the PostgREST limitation and executes raw DDL.

Run from backend/:
    python db/run_migration.py
"""

import os
import sys
import requests
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# The Supabase pg REST endpoint for raw SQL
# Format: https://<project>.supabase.co/rest/v1/rpc/<function>
# But for DDL we need the /pg endpoint or we use the SQL API


def execute_sql(sql: str, label: str = ""):
    """Execute raw SQL via Supabase's PostgREST pg/query endpoint."""
    # Use the Supabase SQL API endpoint (available with service key)
    url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
    
    # Alternative: use the management API or direct pg connection
    # Since exec_sql RPC likely doesn't exist, we'll create it first
    # Actually let's just use the supabase-py query builder creatively
    
    # The proper way is via Supabase's SQL API:
    # POST https://<ref>.supabase.co/pg/query
    # But this may not be available on all tiers
    
    # Let's try the /rest/v1/ endpoint with a custom RPC
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    
    # Try the direct SQL execution endpoint
    # Supabase exposes /pg/query for service role
    pg_url = SUPABASE_URL.replace("supabase.co", "supabase.co") + "/pg/query"
    
    try:
        resp = requests.post(
            pg_url,
            headers=headers,
            json={"query": sql},
            timeout=30,
        )
        if resp.status_code in (200, 201, 204):
            print(f"  [OK] {label}")
            return True
        else:
            # Fallback: try another approach
            raise Exception(f"Status {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        # Try the /rest/v1/rpc approach
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
                raise Exception(f"RPC also failed: {resp2.status_code}")
        except Exception:
            print(f"  [FAIL] {label}: {e}")
            return False


def run_migration():
    print("=" * 60)
    print("[MIGRATE] Running Database Migration via SQL API")
    print("=" * 60)
    print()
    print(f"[INFO] Target: {SUPABASE_URL}")
    print()

    migration_sql = Path(__file__).parent / "migration_add_task_fields.sql"
    if not migration_sql.exists():
        print(f"[ERROR] Migration file not found: {migration_sql}")
        return False

    sql = migration_sql.read_text(encoding="utf-8")
    print(f"[INFO] Loaded migration SQL ({len(sql)} chars)")
    print()

    # Try executing the full migration as one batch
    print("-- Executing full migration --")
    success = execute_sql(sql, "Full migration batch")
    
    if not success:
        # Try statement by statement
        print()
        print("-- Trying individual statements --")
        statements = [s.strip() for s in sql.split(";") if s.strip() and not s.strip().startswith("--")]
        
        ok_count = 0
        fail_count = 0
        for i, stmt in enumerate(statements):
            if not stmt or stmt.startswith("--"):
                continue
            label = stmt[:60].replace("\n", " ").strip()
            result = execute_sql(stmt + ";", f"#{i+1}: {label}...")
            if result:
                ok_count += 1
            else:
                fail_count += 1
        
        print()
        print(f"Results: {ok_count} succeeded, {fail_count} failed")
        
        if fail_count > 0:
            print()
            print("=" * 60)
            print("[ACTION REQUIRED] Some statements failed.")
            print("The Supabase REST API may not support DDL via HTTP.")
            print()
            print("Please run the migration manually:")
            print("  1. Go to: https://supabase.com/dashboard")
            print("  2. Select your project: krsofvcqtpuideotlqcd")  
            print("  3. Click 'SQL Editor' in the left sidebar")
            print("  4. Paste the contents of:")
            print(f"     {migration_sql}")
            print("  5. Click 'Run'")
            print("=" * 60)
            return False

    print()
    print("=" * 60)
    print("[DONE] Migration completed successfully!")
    print("=" * 60)
    return True


if __name__ == "__main__":
    success = run_migration()
    sys.exit(0 if success else 1)

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

def main():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    supabase = create_client(url, key)
    
    email = "jaswanth@jaswanth-twin.local"
    password = "JaswanthTwin2026!"
    
    print(f"[SEED] Creating Lead user in Supabase Auth...")
    try:
        # Create auth user
        auth_resp = supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"name": "Jaswanth"},
        })
        user_id = auth_resp.user.id
        print(f"[OK] Auth user created with ID: {user_id}")
    except Exception as e:
        err_msg = str(e)
        if "already been registered" in err_msg or "already exists" in err_msg:
            print("[INFO] Auth user already exists, listing users to find UUID...")
            users_list = supabase.auth.admin.list_users()
            user_id = None
            for u in users_list:
                if hasattr(u, '__iter__') and not isinstance(u, str):
                    for inner_u in u:
                        if hasattr(inner_u, 'email') and inner_u.email == email:
                            user_id = inner_u.id
                            break
                elif hasattr(u, 'email') and u.email == email:
                    user_id = u.id
                    break
            if not user_id:
                raise RuntimeError("Could not find existing lead user UUID") from e
            print(f"[OK] Found existing lead UUID: {user_id}")
        else:
            raise e
            
    print(f"[SEED] Inserting Lead user into public.users with ID {user_id}...")
    supabase.table("users").upsert({
        "id": user_id,
        "name": "Jaswanth",
        "role": "team_lead"
    }).execute()
    print(f"[SUCCESS] Lead user fully seeded! Use this UUID: {user_id}")

if __name__ == "__main__":
    main()

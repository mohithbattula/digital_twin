"""
Jaswanth Digital Twin — Weekly Task Seeder (Direct Supabase)
Creates user "Kusuma" in auth + public.users, then seeds all 5 weekly goals
with their daily subtasks directly into the tasks table.

Run from backend/:
    python db/seed_weekly_tasks.py
"""

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Ensure backend root is on the path so core.* imports work
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

# Kusuma's credentials (for auth user creation)
KUSUMA_EMAIL = "kusuma@jaswanth-twin.local"
KUSUMA_PASSWORD = "KusumaTwin2026!"


def get_client():
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def ensure_kusuma_user(supabase) -> str:
    """Create or fetch the 'Kusuma' auth + public user. Returns the user UUID."""

    # --- Check if Kusuma already exists in public.users ---
    existing = (
        supabase.table("users")
        .select("id")
        .eq("name", "Kusuma")
        .execute()
    )
    if existing.data:
        user_id = existing.data[0]["id"]
        print(f"  [INFO] Kusuma already exists (id: {user_id})")
        return user_id

    # --- Create auth user via Admin API ---
    print("  [AUTH] Creating Kusuma in Supabase Auth...")
    try:
        auth_resp = supabase.auth.admin.create_user({
            "email": KUSUMA_EMAIL,
            "password": KUSUMA_PASSWORD,
            "email_confirm": True,
            "user_metadata": {"name": "Kusuma"},
        })
        user_id = auth_resp.user.id
        print(f"  [OK] Auth user created (id: {user_id})")
    except Exception as e:
        err_msg = str(e)
        if "already been registered" in err_msg or "already exists" in err_msg:
            # User exists in auth but not in public.users — look up by email
            print("  [INFO] Auth user already exists, fetching...")
            users_list = supabase.auth.admin.list_users()
            for u in users_list:
                # Handle both list-of-users and paginated response
                if hasattr(u, '__iter__') and not isinstance(u, str):
                    for inner_u in u:
                        if hasattr(inner_u, 'email') and inner_u.email == KUSUMA_EMAIL:
                            user_id = inner_u.id
                            break
                elif hasattr(u, 'email') and u.email == KUSUMA_EMAIL:
                    user_id = u.id
                    break
            else:
                raise RuntimeError(f"Could not find auth user for {KUSUMA_EMAIL}") from e
            print(f"  [OK] Found existing auth user (id: {user_id})")
        else:
            raise

    # --- Insert into public.users ---
    print("  [DB] Inserting Kusuma into public.users...")
    supabase.table("users").upsert({
        "id": str(user_id),
        "name": "Kusuma",
        "role": "team_member",
    }).execute()
    print("  [OK] public.users entry created")

    return str(user_id)


def seed_tasks(supabase, user_id: str):
    """Insert all 5 weekly goals with daily subtasks into the tasks table."""

    WEEK_PLANS = [
        {
            "weekly_title": "TASK 1 — Tutor Platform Responsiveness & Runtime Stability Validation",
            "weekly_description": "Perform complete responsive audit, fix layout/navigation/container issues, stabilize cards/tables/forms/modals, and run final responsive verification across tutor-side workflows. Estimated: 9 hours.",
            "daily_tasks": [
                ("Subtask 1.1 — Responsive Audit Across Tutor Platform",
                 "Perform complete responsive audit across mobile, tablet, desktop breakpoints. Validate layout stability, sidebar responsiveness, overflow handling, dashboard rendering, table scaling, modal visibility, runtime layout consistency. Document broken layouts, overflow conditions, inconsistent spacing, unstable rendering behavior. (1.5 hrs)"),
                ("Subtask 1.2 — Navigation, Layout & Container Stabilization",
                 "Fix sidebar responsiveness, mobile navigation handling, container scaling, fluid-width layouts, typography scaling, spacing consistency, dashboard responsiveness. Ensure deployment-safe rendering, responsive layout continuity, stable navigation behavior. (2 hrs)"),
                ("Subtask 1.3 — Cards, Tables & Component Responsiveness",
                 "Fix dashboard grid responsiveness, card stacking behavior, leaderboard responsiveness, table overflow handling, image scaling, button touch-target sizing, cohort workspace rendering consistency. Validate mobile readability, interaction consistency, responsive alignment. (2 hrs)"),
                ("Subtask 1.4 — Forms, Modals & Runtime Interaction Validation",
                 "Fix modal overflow handling, drawer responsiveness, form alignment issues, input scaling, validation-message visibility, mobile interaction stability, runtime modal rendering consistency. Validate keyboard usability, mobile form workflows, modal accessibility. (2 hrs)"),
                ("Subtask 1.5 — Final Responsive Verification & Runtime Stability Testing",
                 "Perform final validation across tutor-side workflows. Test responsive rendering, runtime UI stability, modal behavior, dashboard consistency, navigation continuity. Perform regression verification after fixes. (1.5 hrs)"),
            ],
        },
        {
            "weekly_title": "TASK 2 — Tutor-Side UI/UX Operational Polish & Cohort Workspace Refinement",
            "weekly_description": "Add loading states & skeletons, improve form UX & validation, refine cohort workspace & dashboard hierarchy, and perform final cross-browser validation. Estimated: 5.5 hours.",
            "daily_tasks": [
                ("Subtask 2.1 — Loading States, Skeletons & Async UX Improvements",
                 "Add skeleton loaders, loading indicators, async request feedback, stable loading transitions. Improve dashboard loading behavior, cohort rendering consistency, realtime UI responsiveness. Prevent blank screens, layout shifting, unstable rendering during fetches. (1.5 hrs)"),
                ("Subtask 2.2 — Form UX, Validation & Interaction Feedback Improvements",
                 "Improve inline validation, duplicate-submit prevention, async button states, success/error messaging, navigation continuity. Add loading indicators, disabled processing states, cleaner validation flows. (1.5 hrs)"),
                ("Subtask 2.3 — Cohort Workspace UX & Dashboard Refinement",
                 "Improve operational hierarchy, dashboard section organization, cohort action visibility, workflow clarity, contextual workspace consistency. Reduce configuration-heavy rendering, operational clutter, equal-priority visual overload. (1.5 hrs)"),
                ("Subtask 2.4 — Final UX Polish & Cross-Browser Validation",
                 "Validate and stabilize workflows across Chrome, Safari, Firefox. Fix browser-specific rendering issues, interaction inconsistencies, runtime UI instability. Perform final UX review, operational workflow validation, regression verification after fixes. (1 hr)"),
            ],
        },
        {
            "weekly_title": "TASK 3 — Query Optimization & Prisma Runtime Stabilization",
            "weekly_description": "Audit high-frequency query workflows, stabilize Prisma runtime & connections, optimize queries & clean up N+1 patterns, and perform runtime verification & regression validation. Estimated: 7.5 hours.",
            "daily_tasks": [
                ("Subtask 3.1 — Query Audit Across High-Frequency Workflows",
                 "Audit onboarding queries, dashboard-fetch operations, messaging queries, cohort runtime queries, Product Architect fetch patterns. Identify inefficient relational fetches, unbounded queries, redundant database calls, stale synchronization patterns. (2 hrs)"),
                ("Subtask 3.2 — Prisma Runtime & Connection Stabilization",
                 "Validate and stabilize Prisma singleton handling, connection reuse, deployment-runtime execution, async query consistency, connection lifecycle management. Fix connection misuse, unstable query execution patterns, runtime inconsistency risks. (2 hrs)"),
                ("Subtask 3.3 — Query Optimization & Runtime Cleanup",
                 "Fix N+1 query patterns, unnecessary relational loading, redundant runtime fetches, inefficient dashboard queries. Optimize query structure, fetch efficiency, runtime consistency. (2 hrs)"),
                ("Subtask 3.4 — Runtime Verification & Regression Validation",
                 "Perform runtime verification, onboarding workflow validation, dashboard regression testing, messaging synchronization review, runtime consistency validation after optimizations. (1.5 hrs)"),
            ],
        },
        {
            "weekly_title": "TASK 4 — Deployment Runtime Recovery, Scale Validation & Performance Stabilization",
            "weekly_description": "Perform deployment runtime recovery & sync validation, controlled load testing, runtime optimization & recovery improvements, and final regression & stability verification. Estimated: 7.5 hours.",
            "daily_tasks": [
                ("Subtask 4.1 — Deployment Runtime Recovery & Synchronization Validation",
                 "Perform deployment-focused validation across onboarding workflows, mail-trigger systems, runtime-access provisioning, dashboard synchronization, async workflow continuity. Investigate deployment-only workflow failures, stale-state recovery, synchronization edge cases, runtime inconsistencies. (2 hrs)"),
                ("Subtask 4.2 — Controlled Load & Runtime Performance Validation",
                 "Perform controlled runtime/load validation across onboarding workflows, dashboard rendering, messaging systems, realtime synchronization, cohort operations. Monitor API responsiveness, rendering stability, runtime continuity, synchronization responsiveness. Identify bottlenecks, delayed operations, unstable async behavior, runtime slowdowns. (2.5 hrs)"),
                ("Subtask 4.3 — Runtime Optimization & Recovery Improvements",
                 "Apply stabilization improvements after validation. Improve runtime continuity, synchronization recovery, async workflow stability, operational responsiveness. Perform runtime optimization review, workflow recovery verification. (1.5 hrs)"),
                ("Subtask 4.4 — Final Runtime Regression & Stability Verification",
                 "Retest onboarding continuity, dashboard rendering, messaging synchronization, runtime-access provisioning, workflow stability after optimizations. Perform deployment-safe regression validation, post-fix runtime verification, operational stability confirmation. (1.5 hrs)"),
            ],
        },
        {
            "weekly_title": "TASK 5 — Marketing Awareness & Educational Visibility Initiative",
            "weekly_description": "Plan and execute Awareness Reel Part 3 focused on tutor workflow transformation, and create professional LinkedIn & X visibility content for educational ecosystem awareness. Estimated: 4 hours.",
            "daily_tasks": [
                ("Subtask 5.1 — Awareness Reel Part 3 — Tutor Workflow Transformation Storytelling",
                 "Plan and execute Awareness Reel Part 3 focused on: happy tutor experience after using the platform, workflow simplification, organized educational operations, centralized cohort & workshop management, operational productivity improvements, structured educational delivery. Focus on emotional workflow transformation, reduced operational chaos, improved tutor productivity, smoother educational management, platform-enabled operational clarity. Perform storytelling refinement, scripting, feature-to-pain-point alignment, scene coordination, operational workflow visualization, publishing preparation. (2.5 hrs)"),
                ("Subtask 5.2 — Professional Visibility Content for LinkedIn & X",
                 "Create professional educational visibility content for LinkedIn and X (Twitter) focusing on tutor workflow transformation, operational educational management, educational execution challenges, platform-driven workflow organization, startup execution learnings, educational ecosystem visibility. Prepare structured professional posts, workflow-driven storytelling, deployment-phase awareness communication, platform-visibility content. (1.5 hrs)"),
            ],
        },
    ]

    total_weekly = 0
    total_daily = 0

    for i, plan in enumerate(WEEK_PLANS, 1):
        # Insert weekly goal
        weekly_resp = (
            supabase.table("tasks")
            .insert({
                "assigned_to": user_id,
                "title": plan["weekly_title"],
                "description": plan["weekly_description"],
                "scope": "weekly_goal",
                "status": "pending",
                "submission_notes": "",
            })
            .execute()
        )
        weekly_task = weekly_resp.data[0]
        weekly_id = weekly_task["id"]
        total_weekly += 1

        # Insert daily subtasks
        daily_rows = [
            {
                "assigned_to": user_id,
                "title": title,
                "description": desc,
                "scope": "daily_task",
                "status": "pending",
                "submission_notes": "",
                "parent_id": weekly_id,
            }
            for title, desc in plan["daily_tasks"]
        ]

        if daily_rows:
            supabase.table("tasks").insert(daily_rows).execute()
            total_daily += len(daily_rows)

        print(f"  [OK] TASK {i} - {plan['weekly_title'][:65]}...")
        print(f"     -> 1 weekly goal + {len(daily_rows)} daily tasks")

    return total_weekly, total_daily


def main():
    print("=" * 60)
    print("[SEED] Jaswanth Digital Twin - Task Seeder")
    print("=" * 60)
    print()

    supabase = get_client()
    print(f"[OK] Connected to Supabase: {SUPABASE_URL}")
    print()

    # Step 1: Create Kusuma user
    print("-- Step 1: Ensure user 'Kusuma' exists --")
    user_id = ensure_kusuma_user(supabase)
    print(f"  [ID] Kusuma user ID: {user_id}")
    print()

    # Step 2: Seed tasks
    print("-- Step 2: Seeding weekly goals & daily tasks --")
    total_weekly, total_daily = seed_tasks(supabase, user_id)
    print()
    print(f"[DONE] {total_weekly} weekly goals + {total_daily} daily tasks seeded.")
    print(f"   All assigned to: Kusuma ({user_id})")
    print()
    print("[TIP] Update frontend page.tsx to use Kusuma's user ID,")
    print(f"   or open the app to see the tasks in the Task Board.")


if __name__ == "__main__":
    main()

"""
Jaswanth Digital Twin — Persona Embeddings Seeder
Generates embeddings using text-embedding-3-small and seeds Jaswanth's Q&As
into public.lead_style_embeddings.

Run from backend/:
    python db/seed_persona_embeddings.py
"""

import os
import sys
from pathlib import Path

# Ensure backend root is on the path so core.* imports work
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client
from openai import OpenAI

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]

QA_DATA = [
    {
        "context_trigger": "What is the tutor platform, how does it work? Tell me about Expert sir.",
        "lead_response": "We call our platform as Expert sir. Many industrial experts have strong knowledge but they have no idea how to explain to a student or how to scale themselves or their knowledge. And they also struggle how to convert their knowledge into a structured course. So, this platform helps them to scale themselves, market themselves and and we help them to cross all these issues with less efforts and time.",
        "metadata": {"topic": "platform_philosophy", "source": "interview"}
    },
    {
        "context_trigger": "How does the messaging module work in Experts hub? What technologies do we use for chat?",
        "lead_response": "As our chat module works on two different codebases which are two different products. They are student side and the tutor side. For better scalability and performance, we are using websockets and supabase real time to face less latency.",
        "metadata": {"topic": "chat_architecture", "source": "interview"}
    },
    {
        "context_trigger": "What is the onboarding process for new interns or developers?",
        "lead_response": "First I'll explain the complete codebase and our stack which we are using to build our projects to that new intern. So that she'll have proper idea about what we are building and what is our business logic and what is our business issue we are solving by this product. Once she understand everything about our project and our team, I'll just give her some space to learn the basics and the technical knowledge she need to gain. Then I'll give her some guidance or strict rules which I already have, so that she'll not mess up with our codebase or the database. These are just the guidelines where even a intern or an experienced guy have to follow. They are like best practices.",
        "metadata": {"topic": "onboarding_process", "source": "interview"}
    },
    {
        "context_trigger": "How do you mentor interns and troubleshoot bugs or codebase issues?",
        "lead_response": "First I'll ask her to explain the issue or the issue she is facing right now. Once I get to know the issue, I'll go through the codebase and I'll identify it. If she is not even understand what the issue is, then I'll add better error handlers to the codebase. So, the error handlers will tell the issue directly in a proper text format. Then she'll got to know how to handle it. If we do have a better error handlers, even an LLM can understand it and validate it properly. Even if still the junior cannot understand the issue, I'll give her some time to learn all the basics and how it really works. So, the next day she can understand and resolve the issue by herself.",
        "metadata": {"topic": "mentorship_troubleshooting", "source": "interview"}
    }
]


def main():
    print("=" * 60)
    print("[SEED] Seeding Jaswanth Persona Embeddings")
    print("=" * 60)
    print()

    # Initialize Clients
    print("[INFO] Connecting to Supabase...")
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("[OK] Supabase connected.")

    print("[INFO] Initializing OpenAI Client...")
    openai_client = OpenAI(api_key=OPENAI_API_KEY)
    print("[OK] OpenAI client initialized.")
    print()

    inserted_count = 0
    for i, item in enumerate(QA_DATA, 1):
        trigger = item["context_trigger"]
        response = item["lead_response"]
        meta = item["metadata"]

        print(f"[{i}/{len(QA_DATA)}] Processing topic: {meta['topic']}")
        print(f"  Trigger: {trigger[:50]}...")
        
        try:
            # Generate embedding
            print("  Generating embedding...")
            emb_resp = openai_client.embeddings.create(
                model="text-embedding-3-small",
                input=trigger
            )
            embedding = emb_resp.data[0].embedding
            print(f"  Generated 1536-dim vector embedding.")

            # Insert into database
            print("  Inserting into lead_style_embeddings...")
            db_resp = supabase.table("lead_style_embeddings").insert({
                "context_trigger": trigger,
                "lead_response": response,
                "embedding": embedding,
                "metadata": meta
            }).execute()

            if db_resp.data:
                print(f"  [OK] Successfully inserted record (ID: {db_resp.data[0]['id']})")
                inserted_count += 1
            else:
                print("  [WARN] Insertion returned no data.")

        except Exception as e:
            print(f"  [ERROR] Failed to process {meta['topic']}: {e}")
        print()

    print("=" * 60)
    print(f"[DONE] Successfully seeded {inserted_count} / {len(QA_DATA)} persona Q&A embeddings.")
    print("=" * 60)


if __name__ == "__main__":
    main()

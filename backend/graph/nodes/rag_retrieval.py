"""
Jaswanth Digital Twin — RAG Retrieval Node
Vector similarity search against lead_style_embeddings via pgvector. (Doc 2, §2.3)
"""

from graph.state import TwinState
from core.supabase_client import get_supabase_client
from openai import OpenAI
from core.config import get_settings


def rag_retrieval_node(state: TwinState) -> dict:
    """
    Embeds the current context and performs cosine similarity search
    against the lead_style_embeddings table to retrieve Jaswanth's
    historical communication patterns.

    Uses text-embedding-3-small for embedding generation.
    Returns top-3 most relevant lead_response examples as rag_context.
    """
    settings = get_settings()
    openai_client = OpenAI(api_key=settings.openai_api_key)
    supabase = get_supabase_client()

    # Build query text from available context
    query_parts = []
    if state.get("technical_gap_analysis"):
        query_parts.append(state["technical_gap_analysis"])
    if state.get("submission_notes"):
        query_parts.append(state["submission_notes"])
    if state.get("chat_history"):
        # Collect the last 3 messages (e.g. human -> twin -> human) to preserve conversational context
        # and ensure pronouns like "it" or "that" resolve correctly in similarity search.
        history_msgs = []
        for msg in reversed(state["chat_history"][-3:]):
            if isinstance(msg, dict):
                content = msg.get("content", "").strip()
            else:
                content = getattr(msg, "content", "").strip()
            if content:
                history_msgs.append(content)
        # Reverse back to chronological order
        history_msgs.reverse()
        if history_msgs:
            query_parts.append(" ".join(history_msgs))

    query_text = " ".join(query_parts) if query_parts else "general team communication"

    try:
        # Generate embedding
        embedding_resp = openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=query_text,
        )
        query_embedding = embedding_resp.data[0].embedding

        # Perform pgvector cosine similarity search
        # Using Supabase RPC for vector search
        result = supabase.rpc(
            "match_lead_embeddings",
            {
                "query_embedding": query_embedding,
                "match_threshold": 0.5,
                "match_count": 3,
            },
        ).execute()

        rag_context = []
        if result.data:
            for row in result.data:
                rag_context.append({
                    "context_trigger": row.get("context_trigger", ""),
                    "lead_response": row.get("lead_response", ""),
                    "similarity": row.get("similarity", 0),
                })

        return {"rag_context": rag_context}

    except Exception as e:
        print(f"[WARN] RAG RPC query failed: {e}. Falling back to Python-based similarity matching.")
        try:
            # Query all style embeddings
            rows_resp = supabase.table("lead_style_embeddings").select("id, context_trigger, lead_response, embedding").execute()
            if not rows_resp.data:
                return {"rag_context": []}
            
            import math
            def cosine_similarity(v1, v2):
                dot_prod = sum(x * y for x, y in zip(v1, v2))
                mag1 = math.sqrt(sum(x * x for x in v1))
                mag2 = math.sqrt(sum(x * x for x in v2))
                if not mag1 or not mag2:
                    return 0.0
                return dot_prod / (mag1 * mag2)

            scored_rows = []
            for row in rows_resp.data:
                emb = row.get("embedding")
                if not emb:
                    continue
                # Handle string format if returned as string representation
                if isinstance(emb, str):
                    import json
                    try:
                        emb = json.loads(emb)
                    except Exception:
                        try:
                            emb = [float(x) for x in emb.strip("[]").split(",") if x.strip()]
                        except Exception:
                            continue
                
                if isinstance(emb, list):
                    sim = cosine_similarity(query_embedding, emb)
                    if sim > 0.5: # match_threshold
                        scored_rows.append({
                            "context_trigger": row.get("context_trigger", ""),
                            "lead_response": row.get("lead_response", ""),
                            "similarity": sim
                        })
            
            # Sort by similarity descending
            scored_rows.sort(key=lambda x: x["similarity"], reverse=True)
            return {"rag_context": scored_rows[:3]}
        except Exception as fallback_err:
            print(f"[ERROR] RAG Python fallback failed: {fallback_err}")
            return {"rag_context": []}

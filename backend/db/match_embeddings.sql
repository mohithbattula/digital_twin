-- ============================================================
-- Supabase RPC function for pgvector cosine similarity search
-- Run this AFTER schema.sql in the Supabase SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION match_lead_embeddings(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 3
)
RETURNS TABLE (
    id uuid,
    context_trigger text,
    lead_response text,
    similarity float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        lead_style_embeddings.id,
        lead_style_embeddings.context_trigger,
        lead_style_embeddings.lead_response,
        1 - (lead_style_embeddings.embedding <=> query_embedding) AS similarity
    FROM lead_style_embeddings
    WHERE 1 - (lead_style_embeddings.embedding <=> query_embedding) > match_threshold
    ORDER BY lead_style_embeddings.embedding <=> query_embedding
    LIMIT match_count;
$$;

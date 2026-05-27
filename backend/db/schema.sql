-- ============================================================
-- Jaswanth Digital Twin — Supabase Database Schema
-- Run this in Supabase SQL Editor (or via supabase db push)
-- ============================================================

-- 1. Enable pgvector extension for embedding storage
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Users Table
-- Maps to Supabase Auth.users; stores role information
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('team_lead', 'team_member')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Tasks Table
-- Hierarchical: weekly_goal -> daily_task via parent_id
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assigned_to UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    scope TEXT NOT NULL CHECK (scope IN ('weekly_goal', 'daily_task')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'approved', 'rejected', 'flagged')),
    submission_notes TEXT,
    parent_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    due_date DATE,
    completed_at TIMESTAMPTZ,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fast lookups by assignee and status
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON public.tasks(parent_id);

-- 4. Chat Sessions Table
CREATE TABLE IF NOT EXISTS public.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_member_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title TEXT DEFAULT 'New Conversation',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_member ON public.chat_sessions(team_member_id);

-- 5. Chat Messages Table
-- Full immutable log; sender_id is NULL when sent by the twin
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('human', 'twin')),
    content TEXT NOT NULL,
    associated_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    trace_id TEXT, -- LangSmith trace ID for feedback linkage
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON public.chat_messages(created_at);

-- 6. Lead Style Embeddings Table (Vector DB for RAG)
-- Stores Jaswanth's historical communication patterns
CREATE TABLE IF NOT EXISTS public.lead_style_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    context_trigger TEXT NOT NULL,  -- The prompt/situation from the teammate
    lead_response TEXT NOT NULL,    -- Jaswanth's historical response
    embedding vector(1536) NOT NULL, -- text-embedding-3-small output
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- HNSW index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_embeddings_vector
    ON public.lead_style_embeddings
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

-- ============================================================
-- 7. Row Level Security (RLS) Policies
-- ============================================================

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_style_embeddings ENABLE ROW LEVEL SECURITY;

-- Users: can read all, only update own profile
CREATE POLICY "Users can view all users"
    ON public.users FOR SELECT
    USING (true);

CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

-- Tasks: team members see their own, team lead sees all
CREATE POLICY "Team members can view own tasks"
    ON public.tasks FOR SELECT
    USING (
        assigned_to = auth.uid()
        OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'team_lead')
    );

CREATE POLICY "Team members can submit tasks"
    ON public.tasks FOR UPDATE
    USING (assigned_to = auth.uid())
    WITH CHECK (status IN ('submitted'));

CREATE POLICY "Team lead can manage all tasks"
    ON public.tasks FOR ALL
    USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'team_lead'));

-- Chat sessions: members see their own
CREATE POLICY "Members can view own chat sessions"
    ON public.chat_sessions FOR SELECT
    USING (team_member_id = auth.uid());

CREATE POLICY "Members can create chat sessions"
    ON public.chat_sessions FOR INSERT
    WITH CHECK (team_member_id = auth.uid());

-- Chat messages: members can read messages in their sessions
CREATE POLICY "Members can view messages in own sessions"
    ON public.chat_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE id = chat_messages.session_id
            AND team_member_id = auth.uid()
        )
    );

CREATE POLICY "Members can insert messages in own sessions"
    ON public.chat_messages FOR INSERT
    WITH CHECK (
        sender_type = 'human'
        AND sender_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.chat_sessions
            WHERE id = chat_messages.session_id
            AND team_member_id = auth.uid()
        )
    );

-- Embeddings: readable by authenticated users, writable by service role only
CREATE POLICY "Authenticated users can read embeddings"
    ON public.lead_style_embeddings FOR SELECT
    USING (auth.role() = 'authenticated');

-- ============================================================
-- 8. Auto-update timestamp trigger
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tasks_updated_at
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER chat_sessions_updated_at
    BEFORE UPDATE ON public.chat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 9. Webhook trigger: fires when task status -> 'submitted'
-- (Configure the actual webhook URL in Supabase Dashboard)
-- ============================================================

-- Enable realtime for live subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;

-- ============================================================
-- 10. Task Comments — threaded discussion on tasks
-- ============================================================

CREATE TABLE IF NOT EXISTS public.task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created ON public.task_comments(created_at);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view comments on accessible tasks"
    ON public.task_comments FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.tasks t
            WHERE t.id = task_comments.task_id
            AND (
                t.assigned_to = auth.uid()
                OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'team_lead')
            )
        )
    );

CREATE POLICY "Users can add comments on accessible tasks"
    ON public.task_comments FOR INSERT
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.tasks t
            WHERE t.id = task_comments.task_id
            AND (
                t.assigned_to = auth.uid()
                OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'team_lead')
            )
        )
    );

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;

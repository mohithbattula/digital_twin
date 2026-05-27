-- ============================================================
-- Migration: Add task lifecycle fields + task_comments table
-- Run this in Supabase SQL Editor AFTER the initial schema.sql
-- Safe to re-run (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- 1. Add new columns to tasks table
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0;

-- Add check constraint for progress (0-100) if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tasks_progress_range'
    ) THEN
        ALTER TABLE public.tasks ADD CONSTRAINT tasks_progress_range
            CHECK (progress >= 0 AND progress <= 100);
    END IF;
END $$;

-- 2. Task Comments table — threaded comments on tasks
CREATE TABLE IF NOT EXISTS public.task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task ON public.task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created ON public.task_comments(created_at);

-- 3. RLS for task_comments
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- Anyone involved can read comments on their tasks
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

-- Users can insert comments on tasks they can access
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

-- 4. Enable realtime for task_comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;

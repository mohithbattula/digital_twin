-- Add twin toggle to chat sessions
ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS twin_enabled BOOLEAN DEFAULT true NOT NULL;

-- Add twin evaluation recommendations to tasks
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS twin_review_status TEXT CHECK (twin_review_status IN ('approved', 'rejected', 'needs_clarification'));
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS twin_review_notes TEXT;

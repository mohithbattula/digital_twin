# Jaswanth Digital Twin — Implementation Plan

## Background

The Jaswanth Digital Twin is an autonomous agentic system that emulates a team lead ("Jaswanth") for task evaluation and tonal communication. Based on the 7 architecture documents, the system:

- Evaluates daily task submissions against weekly goals via a LangGraph pipeline
- Engages in human-like chat using RAG over ingested WhatsApp data
- Defends against prompt injection via a Dual-LLM Sanitizer Node
- Manages memory with rolling window summarization
- Traces all LLM calls via LangSmith

### Immutable Constraints
- **Monorepo separation**: `backend/` (Python/FastAPI) and `frontend/` (Next.js/React) are independent projects
- **Database**: Supabase (PostgreSQL + pgvector) is the single source of truth
- **UI**: Glassmorphism aesthetic, Tailwind CSS, Framer Motion, split-pane layout
- **Environment**: `.env` is pre-populated with Supabase, OpenAI, and LangSmith keys

---

## Proposed Changes

### Target Folder Structure

```
Jaswanth Digital-Twin/
├── Docs/                          # Existing architecture docs
├── backend/                       # Python FastAPI service
│   ├── .env                       # Pre-populated credentials
│   ├── requirements.txt
│   ├── main.py                    # FastAPI app entry
│   ├── core/
│   │   ├── config.py              # Pydantic settings from .env
│   │   └── supabase_client.py     # Supabase Python client init
│   ├── graph/
│   │   ├── state.py               # TwinState TypedDict
│   │   ├── nodes/
│   │   │   ├── sanitizer.py       # Prompt injection firewall (GPT-4o-mini)
│   │   │   ├── context_hydration.py # Fetch task + weekly goal from DB
│   │   │   ├── evaluator.py       # Rational evaluator (GPT-4o-mini)
│   │   │   ├── rag_retrieval.py   # pgvector cosine similarity search
│   │   │   ├── summarizer.py      # Rolling memory compression
│   │   │   ├── persona.py         # Jaswanth persona synthesizer (GPT-4o)
│   │   │   └── rejection.py       # Generic rejection handler
│   │   └── builder.py             # LangGraph compile + edge routing
│   ├── api/
│   │   ├── tasks.py               # POST /tasks/evaluate webhook
│   │   ├── chat.py                # POST /chat/stream SSE endpoint
│   │   └── feedback.py            # POST /feedback LangSmith integration
│   └── db/
│       └── schema.sql             # Full Supabase SQL migration
├── frontend/                      # Next.js 14 App Router
│   ├── .env.local                 # Supabase public keys
│   ├── package.json
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx         # Root layout + fonts
│   │   │   ├── page.tsx           # Main split-pane dashboard
│   │   │   └── globals.css        # Glassmorphism tokens
│   │   ├── components/
│   │   │   ├── ChatPane.tsx       # Left pane: realtime chat
│   │   │   ├── TaskPane.tsx       # Right pane: task list + submission
│   │   │   ├── MessageBubble.tsx  # Chat message with feedback buttons
│   │   │   └── TaskCard.tsx       # Individual task card
│   │   ├── stores/
│   │   │   └── useAppStore.ts     # Zustand global state
│   │   └── lib/
│   │       └── supabase.ts        # Supabase browser client
│   └── next.config.ts
└── supabase/
    └── migrations/
        └── 001_init.sql           # Canonical SQL migration
```

---

## Phase 1: Infrastructure & Database Init

**Goal**: Set up both project scaffolds, install all dependencies, and execute the Supabase SQL schema.

### 1.1 — Database Schema (Supabase SQL)

#### [NEW] `backend/db/schema.sql`

The SQL migration to run in the Supabase SQL Editor. Creates:

| Table | Purpose |
|---|---|
| `users` | Auth mapping with `team_lead` / `team_member` roles |
| `tasks` | Hierarchical weekly goals → daily tasks with status enum |
| `chat_sessions` | Per-member conversation containers |
| `chat_messages` | Full immutable chat log with `sender_type` enum |
| `lead_style_embeddings` | pgvector(1536) table for RAG retrieval |

Plus: `pgvector` extension enable, RLS policies, webhook trigger function on `tasks` table for status = `submitted`.

### 1.2 — Backend Scaffold (Python/FastAPI)

#### [NEW] `backend/requirements.txt`

Key dependencies: `fastapi`, `uvicorn`, `supabase`, `langchain`, `langchain-openai`, `langgraph`, `langsmith`, `python-dotenv`, `pydantic-settings`, `sse-starlette`

#### [NEW] `backend/.env` (template)

```env
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
OPENAI_API_KEY=
LANGCHAIN_TRACING_V2=true
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_API_KEY=
LANGCHAIN_PROJECT=jaswanth-twin-prod
WEBHOOK_SECRET=
```

#### [NEW] `backend/core/config.py`

Pydantic `BaseSettings` class loading all env vars with validation.

#### [NEW] `backend/core/supabase_client.py`

Singleton Supabase client using the service role key (bypasses RLS).

#### [NEW] `backend/main.py`

Minimal FastAPI app with CORS middleware, health check endpoint, and router includes.

### 1.3 — Frontend Scaffold (Next.js)

Initialize via `npx -y create-next-app@latest ./` with TypeScript, Tailwind, App Router, ESLint. Then install: `zustand`, `framer-motion`, `@supabase/supabase-js`, `@supabase/ssr`.

#### [NEW] `frontend/src/app/globals.css`

CSS custom properties for the glassmorphism design system: `--glass-bg`, `--glass-border`, blur values, accent gradients.

#### [NEW] `frontend/src/lib/supabase.ts`

Browser Supabase client using the anon key from `.env.local`.

---

## Phase 2: The Intelligence Engine (Backend)

**Goal**: Build the complete LangGraph pipeline with all 6 nodes and edge routing.

### 2.1 — State Schema

#### [NEW] `backend/graph/state.py`

The unified `TwinState` TypedDict combining fields from Doc 2 (LLA) and Doc 7 (Memory):

```python
class TwinState(TypedDict):
    task_id: str
    weekly_goal: str
    daily_task: str
    submission_notes: str
    is_safe: bool                          # Doc 5: Sanitizer output
    safety_reason: str
    evaluation_status: Optional[str]       # 'approved' | 'rejected' | 'needs_clarification'
    technical_gap_analysis: Optional[str]
    rag_context: List[dict]
    chat_history: List[BaseMessage]        # Doc 7: Rolling window
    historical_summary: str                # Doc 7: Compressed memory
    final_response: Optional[str]
    session_id: Optional[str]
    user_id: Optional[str]
```

### 2.2 — Graph Nodes

#### [NEW] `backend/graph/nodes/sanitizer.py`

- Uses **GPT-4o-mini** as a security firewall (Doc 5, §3.1)
- Applies the Sanitizer Prompt Contract verbatim from Doc 5, §3.2
- Sets `is_safe` and `safety_reason` on state
- If jailbreak detected → routes to `rejection_node`

#### [NEW] `backend/graph/nodes/context_hydration.py`

- Queries Supabase `tasks` table for `task_id`
- Fetches parent weekly goal via `parent_id` join
- Populates `weekly_goal`, `daily_task`, `submission_notes` on state

#### [NEW] `backend/graph/nodes/evaluator.py`

- Uses **GPT-4o-mini** for structured output (Doc 2, §2.2)
- Compares `submission_notes` against `daily_task` and `weekly_goal`
- Outputs `evaluation_status` and `technical_gap_analysis`

#### [NEW] `backend/graph/nodes/rag_retrieval.py`

- Embeds `technical_gap_analysis` + user message via `text-embedding-3-small`
- Performs pgvector cosine similarity: `ORDER BY embedding <=> $1 LIMIT 3`
- Returns top-3 `lead_response` examples as `rag_context`

#### [NEW] `backend/graph/nodes/summarizer.py`

- Triggers only when `len(chat_history) > 6` (Doc 7, §2.2)
- Compresses oldest messages into `historical_summary` via GPT-4o-mini
- Truncates `chat_history` to last 4 messages (2 turns)

#### [NEW] `backend/graph/nodes/persona.py`

- Uses **GPT-4o** for nuanced tone replication (Doc 2, §2.4)
- Injects: RAG context + evaluation status + historical summary + recent chat
- Forces Jaswanth's stylistic markers (lowercase, slang, brevity)
- Writes `final_response` to state

#### [NEW] `backend/graph/nodes/rejection.py`

- Generic failure response for flagged inputs
- Flags the task in Supabase with `status = 'flagged'`

### 2.3 — Graph Builder & Edge Routing

#### [NEW] `backend/graph/builder.py`

Compiles the LangGraph `StateGraph` with conditional edges:

```
START → sanitizer → [conditional]
  ├─ unsafe → rejection → END
  └─ safe → context_hydration → evaluator → rag_retrieval → summarizer → persona → END
```

Integrates `RunnableConfig` with LangSmith tracing metadata (Doc 6, §2.2).

---

## Phase 3: The API & Event Bus

**Goal**: Wire the LangGraph engine to HTTP endpoints and Supabase webhooks.

### 3.1 — Task Evaluation Webhook

#### [NEW] `backend/api/tasks.py`

- `POST /v1/tasks/evaluate` — receives Supabase webhook payload (Doc 3, §2.1)
- Validates `x-webhook-secret` header
- Extracts `task_id` from `record.id`
- Invokes graph asynchronously via `BackgroundTasks`
- Returns `202 Accepted` with `job_id`
- On completion: writes twin's response to `chat_messages` and updates `tasks.status`

### 3.2 — Chat Streaming Endpoint

#### [NEW] `backend/api/chat.py`

- `POST /v1/chat/stream` — SSE streaming endpoint (Doc 3, §2.2)
- Validates Bearer JWT via Supabase
- Loads/creates `chat_session` for the user
- Runs the persona pipeline with memory management
- Streams response chunks as Server-Sent Events
- Persists full response to `chat_messages` on completion

### 3.3 — Feedback Endpoint

#### [NEW] `backend/api/feedback.py`

- `POST /v1/feedback` — receives thumbs up/down (Doc 6, §4)
- Sends feedback to LangSmith trace via `langsmith.Client().create_feedback()`

### 3.4 — Supabase Webhook Configuration

Configure in Supabase Dashboard → Database → Webhooks:
- **Table**: `tasks`
- **Events**: `UPDATE`
- **Filter**: `status = 'submitted'`
- **URL**: `https://<backend-url>/v1/tasks/evaluate`
- **Headers**: `x-webhook-secret: <secret>`

---

## Phase 4: The Interface (Frontend)

**Goal**: Build the glassmorphism split-pane UI with realtime subscriptions.

### 4.1 — Global State (Zustand)

#### [NEW] `frontend/src/stores/useAppStore.ts`

```typescript
interface AppState {
  tasks: Task[];
  messages: Message[];
  activeSession: string | null;
  currentUser: User | null;
  // Actions
  setTasks, addMessage, updateTaskStatus, ...
}
```

### 4.2 — Core Layout

#### [MODIFY] `frontend/src/app/page.tsx`

Split-pane dashboard: `ChatPane` (left, ~45%) | `TaskPane` (right, ~55%). Uses CSS Grid with glassmorphism card containers, frosted-glass backgrounds (`backdrop-filter: blur`).

#### [MODIFY] `frontend/src/app/globals.css`

Design tokens: dark mode palette, glass surfaces (`rgba(255,255,255,0.05)` bg, `rgba(255,255,255,0.1)` borders), accent gradients, smooth transitions.

### 4.3 — Chat Components

#### [NEW] `frontend/src/components/ChatPane.tsx`

- Subscribes to Supabase Realtime on `chat_messages` (filtered by `session_id`)
- Auto-scrolls on new messages
- Input bar with send button → calls `/v1/chat/stream` SSE
- Renders streaming response in real-time via `EventSource`

#### [NEW] `frontend/src/components/MessageBubble.tsx`

- Human messages: right-aligned, accent gradient
- Twin messages: left-aligned, glass card with subtle glow
- Thumbs up/down buttons on twin messages → calls `/v1/feedback`
- Framer Motion `initial/animate` for slide-in effect

### 4.4 — Task Components

#### [NEW] `frontend/src/components/TaskPane.tsx`

- Fetches tasks from Supabase filtered by `assigned_to`
- Groups by `scope`: weekly goals as headers, daily tasks nested
- Subscribes to Realtime for status changes (`approved`/`rejected` animations)

#### [NEW] `frontend/src/components/TaskCard.tsx`

- Displays title, description, status badge with color coding
- Expandable submission form: textarea for `submission_notes` + submit button
- On submit: updates `tasks.status` to `submitted` and `submission_notes`
- Framer Motion for expand/collapse and status change animations

---

## Verification Plan

### Automated Tests

1. **Backend health**: `curl http://localhost:8000/health` → `{"status": "ok"}`
2. **Schema validation**: Run `schema.sql` in Supabase SQL Editor → verify all 5 tables created
3. **Sanitizer unit test**: Send a jailbreak string → verify `is_safe = false`
4. **Graph end-to-end**: Submit a mock task → verify `chat_messages` row created with twin response
5. **SSE streaming**: `curl -N POST /v1/chat/stream` → verify chunked response
6. **Frontend build**: `npm run build` → zero errors

### Manual Verification

1. Open frontend → verify split-pane layout renders with glassmorphism aesthetic
2. Submit a task → verify webhook fires → twin evaluates → status updates in realtime
3. Send a chat message → verify streaming response appears
4. Check LangSmith dashboard → verify traces appear with correct metadata
5. Send a jailbreak message → verify it's blocked and flagged

---

## Open Questions

> [!IMPORTANT]
> **Supabase Project**: Do you already have a Supabase project created, or should the plan include setup instructions for a new project?

> [!IMPORTANT]
> **WhatsApp Data**: Do you have the pre-processed WhatsApp exports ready for ingestion into `lead_style_embeddings`, or should Phase 1 include an ingestion script?

> [!IMPORTANT]
> **Deployment Target**: Is the FastAPI backend intended to run locally during development, or do you need deployment config (Docker/Railway/Fly.io) in the plan?

> [!IMPORTANT]
> **Authentication**: Should Phase 4 include a login page with Supabase Auth, or will we use a hardcoded test user for the prototype?

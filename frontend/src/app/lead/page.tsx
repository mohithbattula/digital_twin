"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type Task } from "@/stores/useAppStore";
import { apiFetch, getApiBaseUrl } from "@/lib/api";
import { useRealtimeTasks } from "@/lib/useRealtimeTasks";
import ToastNotifications from "@/components/ToastNotifications";
import ReviewCard from "@/components/ReviewCard";
import StatCard from "@/components/StatCard";
import ProgressRing from "@/components/ProgressRing";
import TaskTimeline from "@/components/TaskTimeline";
import TaskPlanComposer from "@/components/TaskPlanComposer";
import CommentThread from "@/components/CommentThread";
import { SkeletonCard, SkeletonStat, SkeletonTimeline } from "@/components/SkeletonLoader";

type Panel = "overview" | "reviews" | "all" | "create" | "chats";

// Jaswanth's lead user ID (seeded in Supabase Auth/users)
const LEAD_ID = "b4154bf6-dea0-4451-974c-1d716fc2aa26";

export default function LeadDashboard() {
  const router = useRouter();
  const { setCurrentUser, setDashboardRole, tasks, setTasks, notifications } = useAppStore();
  const [activePanel, setActivePanel] = useState<Panel>("overview");
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0, pending: 0, submitted: 0, approved: 0, rejected: 0, flagged: 0, avg_progress: 0, weekly_goals: 0, daily_tasks: 0,
  });

  // Route guard check
  useEffect(() => {
    const isLoggedIn = localStorage.getItem("leadLoggedIn");
    if (!isLoggedIn) {
      router.push("/");
    }
  }, [router]);

  useEffect(() => {
    setCurrentUser({ id: LEAD_ID, name: "Jaswanth", role: "team_lead" });
    setDashboardRole("lead");
  }, [setCurrentUser, setDashboardRole]);

  useRealtimeTasks("lead");

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [taskData, statData] = await Promise.all([
          apiFetch<{ tasks: Task[] }>("/tasks?role=lead"),
          apiFetch<typeof stats>("/tasks/stats"),
        ]);
        setTasks(taskData.tasks);
        setStats(statData);
      } catch (err) {
        console.error("Failed to load lead data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [setTasks]);

  // Live stats recalculation
  useEffect(() => {
    if (tasks.length > 0) {
      const daily = tasks.filter((t) => t.scope === "daily_task");
      const weekly = tasks.filter((t) => t.scope === "weekly_goal");
      const sc: Record<string, number> = {};
      tasks.forEach((t) => { sc[t.status] = (sc[t.status] || 0) + 1; });
      setStats({
        total: tasks.length, weekly_goals: weekly.length, daily_tasks: daily.length,
        pending: sc.pending || 0, submitted: sc.submitted || 0,
        approved: sc.approved || 0, rejected: sc.rejected || 0, flagged: sc.flagged || 0,
        avg_progress: daily.length ? Math.round(daily.reduce((s, t) => s + (t.progress || 0), 0) / daily.length) : 0,
      });
    }
  }, [tasks]);

  // Sort helper — extract numeric part from title ("TASK 3" → 3, "Subtask 2.4" → 2.4)
  const taskNum = (title: string) => {
    const m = title.match(/(?:TASK\s+(\d+)|Subtask\s+(\d+\.\d+))/i);
    return m ? parseFloat(m[1] ?? m[2]) : 999;
  };
  const pendingReviews = useMemo(() => tasks.filter((t) => t.status === "submitted" && t.scope === "daily_task"), [tasks]);
  const weeklyGoals = useMemo(() =>
    tasks.filter((t) => t.scope === "weekly_goal").sort((a, b) => taskNum(a.title) - taskNum(b.title)),
  [tasks]);
  const dailyTasks = useMemo(() =>
    tasks.filter((t) => t.scope === "daily_task").sort((a, b) => taskNum(a.title) - taskNum(b.title)),
  [tasks]);
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Build timeline events from recent task changes
  const timelineEvents = useMemo(() => {
    return tasks
      .filter((t) => t.scope === "daily_task" && t.status !== "pending")
      .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime())
      .slice(0, 10)
      .map((t) => ({
        id: t.id,
        title: t.title,
        description: t.status === "submitted" ? "Submitted for review" : t.status === "approved" ? "Approved" : t.status === "rejected" ? "Sent back for revision" : "",
        timestamp: t.updated_at || t.created_at,
        status: t.status,
      }));
  }, [tasks]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <ToastNotifications />

      {/* Header */}
      <motion.header initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }} className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--glass-border)" }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-accent)" }}>
            <span className="text-white font-bold text-sm">JT</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight gradient-text">Command Center</h1>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Jaswanth Digital Twin · Lead Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {pendingReviews.length > 0 && (
            <button onClick={() => setActivePanel("reviews")}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-card hover:border-red-500/30"
              style={{ cursor: "pointer" }}>
              <span className="notification-badge">{pendingReviews.length}</span>
              <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Pending Review</span>
            </button>
          )}
          <ProgressRing progress={stats.avg_progress} size={44} strokeWidth={4} color="#6366f1" label="avg" />
          <button
            onClick={() => {
              localStorage.removeItem("leadLoggedIn");
              window.location.href = "/";
            }}
            className="btn-ghost text-xs px-3 py-1.5 rounded-full border hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/30 flex items-center gap-1"
            style={{ cursor: "pointer" }}
            id="logout-btn"
          >
            Logout
          </button>
        </div>
      </motion.header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar */}
        <motion.aside initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="hidden md:flex w-[260px] shrink-0 flex-col border-r" style={{ borderColor: "var(--glass-border)" }}>
          <div className="p-4 border-b" style={{ borderColor: "var(--glass-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Navigation</p>
            <div className="grid gap-2">
              <SidebarBtn active={activePanel === "overview"} label="Overview" icon="📊" onClick={() => setActivePanel("overview")} />
              <SidebarBtn active={activePanel === "reviews"} label="Pending Reviews" icon="📤"
                onClick={() => setActivePanel("reviews")} badge={pendingReviews.length || undefined} />
              <SidebarBtn active={activePanel === "chats"} label="Student Chats" icon="💬" onClick={() => setActivePanel("chats")} />
              <SidebarBtn active={activePanel === "all"} label="All Tasks" icon="📋" onClick={() => setActivePanel("all")} />
              <SidebarBtn active={activePanel === "create"} label="Create Plan" icon="✏️" onClick={() => setActivePanel("create")} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Activity</p>
            {isLoading ? <SkeletonTimeline /> : <TaskTimeline events={timelineEvents} />}
          </div>
        </motion.aside>

        {/* Mobile Tabs */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <div className="md:hidden flex border-b px-3 py-2 gap-2 overflow-x-auto" style={{ borderColor: "var(--glass-border)" }}>
            <SidebarBtn active={activePanel === "overview"} label="Overview" icon="📊" onClick={() => setActivePanel("overview")} />
            <SidebarBtn active={activePanel === "reviews"} label="Reviews" icon="📤" onClick={() => setActivePanel("reviews")} badge={pendingReviews.length || undefined} />
            <SidebarBtn active={activePanel === "chats"} label="Chats" icon="💬" onClick={() => setActivePanel("chats")} />
            <SidebarBtn active={activePanel === "all"} label="Tasks" icon="📋" onClick={() => setActivePanel("all")} />
          </div>

          <motion.main key={activePanel} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }} className="flex-1 min-w-0 overflow-y-auto">
            {activePanel === "overview" && <OverviewPanel stats={stats} pendingReviews={pendingReviews} weeklyGoals={weeklyGoals} dailyTasks={dailyTasks} isLoading={isLoading} timelineEvents={timelineEvents} setActivePanel={setActivePanel} />}
            {activePanel === "reviews" && <ReviewsPanel tasks={pendingReviews} isLoading={isLoading} />}
            {activePanel === "chats" && <ChatsPanel />}
            {activePanel === "all" && <AllTasksPanel weeklyGoals={weeklyGoals} dailyTasks={dailyTasks} isLoading={isLoading} />}
            {activePanel === "create" && <CreatePanel />}
          </motion.main>
        </div>
      </div>
    </div>
  );
}

/* ── Overview Panel ── */
function OverviewPanel({ stats, pendingReviews, weeklyGoals, dailyTasks, isLoading, timelineEvents, setActivePanel }: any) {
  return (
    <div className="px-6 py-5 space-y-6">
      {/* Stats Row */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[1,2,3,4,5].map((i) => <SkeletonStat key={i} />)}</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total Tasks" value={stats.total} icon="📋" variant="accent" delay={0} />
          <StatCard label="Pending" value={stats.pending} icon="⏳" variant="warning" delay={0.05} />
          <StatCard label="In Review" value={stats.submitted} icon="📤" variant="accent" delay={0.1} />
          <StatCard label="Approved" value={stats.approved} icon="✅" variant="success" delay={0.15} />
          <StatCard label="Avg Progress" value={stats.avg_progress} icon="📊" variant="accent" suffix="%" delay={0.2} />
        </div>
      )}

      {/* Needs Review Section */}
      {pendingReviews.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-accent)" }}>
              🔔 Needs Your Review
            </h3>
            <button onClick={() => setActivePanel("reviews")} className="btn-ghost text-[11px]">
              View All →
            </button>
          </div>
          <div className="space-y-3">
            {pendingReviews.slice(0, 3).map((task: Task) => (
              <ReviewCard key={task.id} task={task} />
            ))}
          </div>
        </section>
      )}

      {/* Weekly Goals Overview */}
      <WeeklyGoalsOverview
        weeklyGoals={weeklyGoals}
        dailyTasks={dailyTasks}
        setActivePanel={setActivePanel}
      />

      {/* Timeline (mobile) */}
      <section className="md:hidden">
        <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-accent)" }}>Recent Activity</h3>
        <TaskTimeline events={timelineEvents} />
      </section>
    </div>
  );
}

/* ── Weekly Goals Overview (expandable cards on lead Overview panel) ── */
function WeeklyGoalsOverview({ weeklyGoals, dailyTasks, setActivePanel }: {
  weeklyGoals: Task[];
  dailyTasks: Task[];
  setActivePanel: (p: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-accent)" }}>
          Weekly Goals Progress
        </h3>
        <button onClick={() => setActivePanel("all")} className="btn-ghost text-[11px]" type="button">
          Manage All Tasks →
        </button>
      </div>

      <div className="space-y-3">
        {weeklyGoals.map((goal: Task) => {
          const children = dailyTasks
            .filter((t: Task) => t.parent_id === goal.id)
            .sort((a: Task, b: Task) => {
              const numA = parseFloat((a.title.match(/Subtask\s+(\d+\.\d+)/i) || [])[1] || "999");
              const numB = parseFloat((b.title.match(/Subtask\s+(\d+\.\d+)/i) || [])[1] || "999");
              return numA - numB;
            });
          const approved = children.filter((t: Task) => t.status === "approved").length;
          const submitted = children.filter((t: Task) => t.status === "submitted").length;
          const total = children.length;
          const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
          const isOpen = expanded === goal.id;

          return (
            <motion.div key={goal.id} layout className="apple-card">
              {/* Header — click to expand */}
              <div
                onClick={() => setExpanded(isOpen ? null : goal.id)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-black/[0.01] transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <ProgressRing progress={pct} size={40} strokeWidth={4} color={pct === 100 ? "#10b981" : "#0071e3"} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">
                      {goal.title.replace(/^TASK \d+ — /, "")}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {approved}/{total} approved
                      {submitted > 0 && <span className="ml-2 text-amber-500 font-semibold">· {submitted} awaiting review</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  {submitted > 0 && (
                    <span className="badge badge-submitted text-[9px] px-2 py-0.5 font-bold">{submitted} review</span>
                  )}
                  <motion.svg
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    width="16" height="16" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2.5"
                    className="text-gray-400"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </motion.svg>
                </div>
              </div>

              {/* Progress bar */}
              <div className="px-4 pb-3">
                <div className="progress-bar">
                  <motion.div
                    className="progress-bar-fill"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8 }}
                  />
                </div>
              </div>

              {/* Expandable subtask list */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50/40 space-y-2">
                      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-2 pt-2">Daily Subtasks</p>
                      {children.map((task: Task) => (
                        <div
                          key={task.id}
                          className="flex items-center gap-3 p-3 rounded-xl bg-white border border-gray-100 shadow-sm"
                        >
                          <span className="text-sm shrink-0">
                            {task.status === "approved" ? "✅" : task.status === "submitted" ? "📤" : task.status === "rejected" ? "🔄" : "⏳"}
                          </span>
                          <p className="flex-1 text-xs font-medium text-gray-800 truncate min-w-0">
                            {task.title.replace(/^Subtask \d+\.\d+ — /, "")}
                          </p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[9px] font-bold text-gray-400">{task.progress}%</span>
                            <span className={`badge badge-${task.status} text-[9px] px-1.5 py-0.5 font-bold`}>
                              {task.status}
                            </span>
                          </div>
                        </div>
                      ))}
                      {children.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-3">No subtasks</p>
                      )}
                      {/* Quick link to full review if any submitted */}
                      {submitted > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setActivePanel("reviews"); }}
                          className="w-full mt-1 apple-button-pill bg-amber-50 border border-amber-200 text-amber-700 text-[10px] py-2"
                          type="button"
                        >
                          ⚡ Review {submitted} pending submission{submitted > 1 ? "s" : ""} now
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

/* ── Reviews Panel ── */

function ReviewsPanel({ tasks, isLoading }: { tasks: Task[]; isLoading: boolean }) {
  return (
    <div className="px-6 py-5">
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>Pending Reviews</h2>
        <span className="notification-badge">{tasks.length}</span>
      </div>
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <SkeletonCard key={i} />)}</div>
      ) : tasks.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-16">
          <span className="text-4xl mb-3">✅</span>
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>All caught up!</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>No submissions waiting for review</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <ReviewCard key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── All Tasks Panel ── */
function AllTasksPanel({ weeklyGoals, dailyTasks, isLoading }: { weeklyGoals: Task[]; dailyTasks: Task[]; isLoading: boolean }) {
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);

  // Auto-expand the first goal once loaded
  useEffect(() => {
    if (weeklyGoals.length > 0 && !expandedGoal) {
      setExpandedGoal(weeklyGoals[0].id);
    }
  }, [weeklyGoals, expandedGoal]);

  return (
    <div className="px-6 py-5">
      <h2 className="text-sm font-bold mb-4" style={{ color: "var(--text-primary)" }}>All Tasks</h2>
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map((i) => <SkeletonCard key={i} />)}</div>
      ) : (
        <div className="space-y-4">
          {weeklyGoals.map((goal) => {
            const children = dailyTasks.filter((t) => t.parent_id === goal.id);
            const isOpen = expandedGoal === goal.id;
            const completed = children.filter((t) => t.status === "approved").length;
            const total = children.length;
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

            return (
              <motion.div key={goal.id} layout className="apple-card">
                <div
                  onClick={() => setExpandedGoal(isOpen ? null : goal.id)}
                  className="w-full p-5 flex items-center justify-between cursor-pointer hover:bg-black/[0.01] transition-colors"
                >
                  <div className="flex items-center gap-3.5 flex-1 min-w-0">
                    <ProgressRing progress={pct} size={42} strokeWidth={4.5} color="#34c759" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400">Weekly Goal</span>
                        <span className={`badge badge-${goal.status} text-[9px] px-1.5 py-0.5`}>{goal.status}</span>
                      </div>
                      <p className="text-sm font-semibold truncate text-gray-900 mt-0.5">{goal.title}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-4 shrink-0">
                    <span className="text-xs font-semibold text-gray-400 hidden sm:inline">
                      {completed}/{total} subtasks
                    </span>
                    <motion.svg
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="text-gray-400"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </motion.svg>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }} className="overflow-hidden">
                      <div className="px-5 pb-5 pt-1 border-t border-gray-100 bg-gray-50/40 space-y-4">
                        {goal.description && (
                          <div className="p-3.5 rounded-xl bg-white/70 border border-gray-100 shadow-sm text-xs text-gray-600 leading-relaxed">
                            <p className="font-semibold text-gray-700 mb-1">Objective</p>
                            {goal.description}
                          </div>
                        )}

                        <div className="space-y-3 pl-1">
                          <h4 className="text-[10px] font-bold tracking-wider text-gray-400 uppercase mb-2">Daily Subtasks</h4>
                          {children.map((task) => {
                            const isTaskSelected = selectedTask === task.id;
                            return (
                              <div key={task.id} className="apple-subtask-card overflow-hidden">
                                <div 
                                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-black/[0.01] transition-colors"
                                  onClick={() => setSelectedTask(isTaskSelected ? null : task.id)}
                                >
                                  <div className="flex items-center gap-3 flex-1 min-w-0">
                                    <span className="text-base shrink-0">{task.status === "approved" ? "✅" : task.status === "submitted" ? "📤" : task.status === "rejected" ? "🔄" : "⏳"}</span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-gray-900 truncate">{task.title}</p>
                                      <div className="flex items-center gap-2 mt-1">
                                        <div className="progress-bar" style={{ maxWidth: 80 }}>
                                          <div className="progress-bar-fill" style={{ width: `${task.progress}%` }} />
                                        </div>
                                        <span className="text-[10px] text-gray-400 font-bold">{task.progress}%</span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`badge badge-${task.status} text-[9px] font-bold px-2 py-0.5`}>{task.status}</span>
                                    <motion.svg animate={{ rotate: isTaskSelected ? 180 : 0 }} transition={{ duration: 0.2 }}
                                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                      strokeWidth="2.5" className="text-gray-400">
                                      <polyline points="6 9 12 15 18 9" />
                                    </motion.svg>
                                  </div>
                                </div>

                                {/* Inline review & details for subtask */}
                                <AnimatePresence initial={false}>
                                  {isTaskSelected && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
                                      <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-white">
                                        {task.status === "submitted" ? (
                                          <div className="mt-3">
                                            <ReviewCard task={task} />
                                          </div>
                                        ) : (
                                          <div className="mt-3 space-y-3.5">
                                            {task.submission_notes && (
                                              <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-100 text-xs">
                                                <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">Student Submission Notes</p>
                                                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{task.submission_notes}</p>
                                              </div>
                                            )}
                                            <div className="p-3.5 rounded-xl border border-gray-100 bg-gray-50/20">
                                              <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-2">Discussion</p>
                                              <CommentThread taskId={task.id} />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                          {children.length === 0 && (
                            <div className="py-4 text-center border border-dashed border-gray-200 rounded-xl bg-white/50">
                              <p className="text-xs text-gray-400">No subtasks matching filter</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Chats Panel ── */
function ChatsPanel() {
  const { tasks, updateTask } = useAppStore();
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [twinEnabled, setTwinEnabled] = useState(true);
  const [jarvisDraft, setJarvisDraft] = useState("");
  const [isDraftLoading, setIsDraftLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Unread badge states
  const [briefingUnreadCount, setBriefingUnreadCount] = useState(0);
  const [lastViewedBriefing, setLastViewedBriefing] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("last_viewed_briefing") || new Date().toISOString();
    }
    return new Date().toISOString();
  });

  const [reviewNotesDict, setReviewNotesDict] = useState<Record<string, string>>({});
  const [actioningDict, setActioningDict] = useState<Record<string, boolean>>({});

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load chat session(s)
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const usersResp = await apiFetch<{ users: any[] }>("/users");
        const students = usersResp.users.filter((u) => u.role === "team_member");
        
        const mappedSessions = students.map((std) => {
          const isKusuma = std.id === "93687b3d-0063-4de2-8eea-5c2135e7ffe8";
          return {
            id: isKusuma ? "99999999-9999-4999-8999-999999999999" : std.id,
            team_member_id: std.id,
            user_name: std.name,
            avatar_url: std.avatar_url,
          };
        });
        
        const briefingSession = {
          id: `briefing-lead-${LEAD_ID}`,
          team_member_id: LEAD_ID,
          user_name: "🤖 Jarvis Briefing",
          avatar_url: null,
          isPinned: true
        };

        const finalSessions = [briefingSession, ...mappedSessions];
        setSessions(finalSessions);
        setSelectedSessionId(briefingSession.id);
      } catch (err) {
        console.error("Failed to load users:", err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // Update last viewed timestamp when briefing is selected
  useEffect(() => {
    if (selectedSessionId === `briefing-lead-${LEAD_ID}`) {
      const nowStr = new Date().toISOString();
      localStorage.setItem("last_viewed_briefing", nowStr);
      setLastViewedBriefing(nowStr);
      setBriefingUnreadCount(0);
    }
  }, [selectedSessionId]);

  // Periodic poll of briefing messages to update badge if not selected
  useEffect(() => {
    if (selectedSessionId === `briefing-lead-${LEAD_ID}`) return;

    const checkBriefing = async () => {
      try {
        const briefingId = `briefing-lead-${LEAD_ID}`;
        const chatData = await apiFetch<{ messages: any[] }>(`/chat/messages?session_id=${briefingId}`);
        const unread = chatData.messages.filter(m => m.created_at > lastViewedBriefing).length;
        setBriefingUnreadCount(unread);
      } catch (err) {
        // ignore
      }
    };
    
    checkBriefing();
    const interval = setInterval(checkBriefing, 5000);
    return () => clearInterval(interval);
  }, [selectedSessionId, lastViewedBriefing]);

  // Fetch details and messages for the selected session
  useEffect(() => {
    if (!selectedSessionId) return;

    const fetchSessionData = async () => {
      if (selectedSessionId === `briefing-lead-${LEAD_ID}`) {
        setTwinEnabled(true);
      } else {
        try {
          const sessionDetail = await apiFetch<{ session: any }>(`/chat/sessions/${selectedSessionId}`);
          setTwinEnabled(sessionDetail.session.twin_enabled);
        } catch (err) {
          console.warn("Failed to fetch session detail, assuming twin is enabled:", err);
          setTwinEnabled(true);
        }
      }

      try {
        const chatData = await apiFetch<{ messages: any[] }>(`/chat/messages?session_id=${selectedSessionId}`);
        setMessages(chatData.messages || []);
      } catch (err) {
        console.error("Failed to load chat messages:", err);
      }
    };

    fetchSessionData();
    setJarvisDraft("");

    const interval = setInterval(async () => {
      try {
        const chatData = await apiFetch<{ messages: any[] }>(`/chat/messages?session_id=${selectedSessionId}`);
        if (chatData.messages && chatData.messages.length !== messages.length) {
          setMessages(chatData.messages);
        }
      } catch (err) {
        // Ignore
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedSessionId, messages.length]);

  const handleToggle = async () => {
    if (!selectedSessionId || selectedSessionId === `briefing-lead-${LEAD_ID}`) return;
    const nextVal = !twinEnabled;
    setTwinEnabled(nextVal);
    try {
      await apiFetch(`/chat/sessions/${selectedSessionId}/toggle`, {
        method: "PATCH",
        body: JSON.stringify({ twin_enabled: nextVal }),
      });
    } catch (err) {
      console.error("Failed to toggle twin:", err);
      setTwinEnabled(!nextVal);
    }
  };

  const handleGetSuggestion = async () => {
    if (!selectedSessionId || isDraftLoading) return;
    setIsDraftLoading(true);
    setJarvisDraft("");
    try {
      const resp = await apiFetch<{ suggestion: string }>(`/chat/sessions/${selectedSessionId}/suggest`, {
        method: "POST",
      });
      setJarvisDraft(resp.suggestion);
    } catch (err) {
      console.error("Failed to fetch suggestion:", err);
      setJarvisDraft("Could not generate a suggestion at this time.");
    } finally {
      setIsDraftLoading(false);
    }
  };

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || !selectedSessionId || isSending) return;

    if (selectedSessionId === `briefing-lead-${LEAD_ID}`) {
      setIsSending(true);
      setInputValue("");

      // Optimistic message
      const tempHumanMsg = {
        id: `temp-${Date.now()}`,
        session_id: selectedSessionId,
        sender_id: LEAD_ID,
        sender_type: "human",
        content: text,
        associated_task_id: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempHumanMsg]);

      // Placeholder for Jarvis response
      const tempJarvisId = `jarvis-${Date.now()}`;
      const tempJarvisMsg = {
        id: tempJarvisId,
        session_id: selectedSessionId,
        sender_id: null,
        sender_type: "twin",
        content: "",
        associated_task_id: null,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempJarvisMsg]);

      try {
        const response = await fetch(`${getApiBaseUrl()}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: selectedSessionId,
            message: text,
            user_id: LEAD_ID,
          }),
        });

        if (!response.ok) throw new Error("Stream failed");

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6).trim();
                if (data === '"[DONE]"') continue;
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.chunk) {
                    fullResponse += parsed.chunk;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === tempJarvisId
                          ? { ...m, content: fullResponse }
                          : m
                      )
                    );
                  }
                } catch {
                  // skip malformed chunks
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Jarvis stream error:", err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempJarvisId
              ? {
                  ...m,
                  content: "Sorry, I couldn't process that. The backend may be offline.",
                }
              : m
          )
        );
      } finally {
        setIsSending(false);
      }
    } else {
      setIsSending(true);
      try {
        const resp = await apiFetch<{ status: string; message: any }>(`/chat/sessions/${selectedSessionId}/send-lead-message`, {
          method: "POST",
          body: JSON.stringify({
            message: text,
            user_id: LEAD_ID
          })
        });
        if (resp.status === "success" && resp.message) {
          setMessages((prev) => [...prev, resp.message]);
        }
        setInputValue("");
        setJarvisDraft("");
      } catch (err) {
        console.error("Failed to send message:", err);
      } finally {
        setIsSending(false);
      }
    }
  };

  const handleReview = async (taskId: string, status: "approved" | "rejected") => {
    setActioningDict(prev => ({ ...prev, [taskId]: true }));
    try {
      const notes = reviewNotesDict[taskId] || "";
      const data = await apiFetch<{ task: Task }>(`/tasks/${taskId}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, review_notes: notes }),
      });
      updateTask(taskId, data.task);
      setReviewNotesDict(prev => {
        const next = { ...prev };
        delete next[taskId];
        return next;
      });
    } catch (err) {
      console.error("Failed to review task:", err);
    } finally {
      setActioningDict(prev => ({ ...prev, [taskId]: false }));
    }
  };

  const renderBriefingText = (text: string) => {
    let html = text;
    html = html.replace(/\*\*(.*?)\*\?/g, "<strong>$1</strong>");
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/───+/g, "<hr class='my-3 border-gray-700/30' />");
    
    const lines = html.split("\n");
    const processedLines = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith("• ")) {
        return `<li class="list-none pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-indigo-400 font-medium">${trimmed.substring(2)}</li>`;
      }
      return line;
    });
    
    return (
      <div 
        className="space-y-1"
        dangerouslySetInnerHTML={{ __html: processedLines.join("\n").replace(/\n/g, "<br />") }} 
      />
    );
  };

  const activeSession = sessions.find((s) => s.id === selectedSessionId);

  return (
    <div className="flex h-full min-h-0 overflow-hidden" style={{ background: "rgba(0, 0, 0, 0.15)" }}>
      {/* Session Sidebar */}
      <div className="w-64 border-r shrink-0 flex flex-col p-4" style={{ borderColor: "var(--glass-border)", background: "rgba(255, 255, 255, 0.02)" }}>
        <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Active Students</p>
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-12 w-full rounded-xl animate-pulse" style={{ background: "var(--glass-card-bg)" }} />
          </div>
        ) : (
          <div className="space-y-2 overflow-y-auto flex-1">
            {sessions.map((sess) => {
              const isBriefing = sess.id === `briefing-lead-${LEAD_ID}`;
              const isSelected = selectedSessionId === sess.id;
              return (
                <button
                  key={sess.id}
                  onClick={() => setSelectedSessionId(sess.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                    isSelected
                      ? "glass-card border-indigo-500/30"
                      : "hover:bg-white/5 border border-transparent"
                  }`}
                  style={{ cursor: "pointer", textAlign: "left" }}
                >
                  {isBriefing ? (
                    <div className="w-8 h-8 rounded-full bg-purple-600/30 flex items-center justify-center font-bold text-xs shrink-0 text-white border border-purple-500/20">
                      🤖
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center font-bold text-xs shrink-0 text-white border border-indigo-500/20">
                      {sess.user_name[0]}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>{sess.user_name}</p>
                    <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                      {isBriefing ? (
                        <span className="text-purple-400 font-semibold">★ Pinned Feed</span>
                      ) : twinEnabled ? (
                        "🤖 AI Twin monitoring"
                      ) : (
                        "👤 Human active"
                      )}
                    </p>
                  </div>
                  {isBriefing && briefingUnreadCount > 0 && (
                    <span className="notification-badge bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                      {briefingUnreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">
        {selectedSessionId && activeSession ? (
          <>
            {/* Session Header */}
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "var(--glass-border)", background: "rgba(255, 255, 255, 0.01)" }}>
              <div className="min-w-0">
                <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{activeSession.user_name}</h3>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {activeSession.id === `briefing-lead-${LEAD_ID}`
                    ? "Jarvis automated updates & notifications channel"
                    : twinEnabled
                    ? "🤖 Jaswanth's AI Twin is responding automatically"
                    : "👋 You are responding directly"}
                </p>
              </div>

              {/* Co-Pilot Toggle Button */}
              {activeSession.id !== `briefing-lead-${LEAD_ID}` && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium" style={{ color: twinEnabled ? "var(--text-accent)" : "var(--text-muted)" }}>
                    {twinEnabled ? "Twin Active" : "Twin Paused"}
                  </span>
                  <button
                    onClick={handleToggle}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
                    style={{
                      backgroundColor: twinEnabled ? "var(--accent-color)" : "rgba(255, 255, 255, 0.15)",
                      cursor: "pointer",
                    }}
                    type="button"
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        twinEnabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Chat Logs */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {messages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>No messages in this chat session yet.</p>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isBriefingSession = selectedSessionId === `briefing-lead-${LEAD_ID}`;
                  const isLeadMsg = msg.sender_type === "twin" && msg.sender_id === LEAD_ID;
                  const isAiTwinMsg = msg.sender_type === "twin" && !msg.sender_id;
                  const isStudentMsg = msg.sender_type === "human";

                  let senderLabel = "";
                  let bubbleBg = "rgba(255, 255, 255, 0.05)";
                  let bubbleBorder = "1px solid var(--glass-border)";
                  let alignSelf = "flex-start";

                  if (isBriefingSession) {
                    senderLabel = "Jarvis Intel Briefing";
                    bubbleBg = "rgba(139, 92, 246, 0.05)";
                    bubbleBorder = "1px solid rgba(139, 92, 246, 0.2)";
                    alignSelf = "flex-start";
                  } else if (isStudentMsg) {
                    senderLabel = activeSession.user_name;
                    alignSelf = "flex-start";
                  } else if (isLeadMsg) {
                    senderLabel = "You (Team Lead)";
                    bubbleBg = "rgba(99, 102, 241, 0.1)";
                    bubbleBorder = "1px solid rgba(99, 102, 241, 0.2)";
                    alignSelf = "flex-end";
                  } else if (isAiTwinMsg) {
                    senderLabel = "Jaswanth AI Twin";
                    bubbleBg = "rgba(16, 185, 129, 0.05)";
                    bubbleBorder = "1px solid rgba(16, 185, 129, 0.2)";
                    alignSelf = "flex-end";
                  }

                  const associatedTask = msg.associated_task_id ? tasks.find(t => t.id === msg.associated_task_id) : null;

                  return (
                    <div 
                      key={msg.id || index} 
                      className={`flex flex-col ${isBriefingSession ? "w-full max-w-[95%]" : "max-w-[80%]"} ${alignSelf === "flex-end" ? "ml-auto items-end" : "mr-auto items-start"}`}
                    >
                      <span className="text-[9px] mb-1 font-semibold uppercase tracking-wider px-1" style={{ color: "var(--text-muted)" }}>
                        {senderLabel}
                      </span>
                      <div
                        className="p-4 rounded-2xl text-xs leading-relaxed shadow-sm w-full"
                        style={{
                          background: bubbleBg,
                          border: bubbleBorder,
                          color: "var(--text-primary)",
                          borderRadius: isBriefingSession ? "16px" : isStudentMsg ? "0px 16px 16px 16px" : "16px 0px 16px 16px",
                        }}
                      >
                        {isBriefingSession ? (
                          renderBriefingText(msg.content)
                        ) : (
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        )}

                        {/* Interactive Task Decision Card for Briefings */}
                        {isBriefingSession && associatedTask && (
                          <>
                            {associatedTask.status === "submitted" && (
                              <div className="mt-3 p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20 space-y-3">
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-1.5">Lead Review Decision</span>
                                  <textarea
                                    placeholder="Add feedback/review notes (optional)..."
                                    value={reviewNotesDict[associatedTask.id] || ""}
                                    onChange={(e) => setReviewNotesDict(prev => ({ ...prev, [associatedTask.id]: e.target.value }))}
                                    rows={2}
                                    className="w-full px-3 py-2 rounded-lg text-xs bg-black/35 border border-gray-700 text-white outline-none focus:border-indigo-500/50"
                                  />
                                </div>
                                <div className="flex gap-2 justify-end">
                                  <button
                                    type="button"
                                    disabled={actioningDict[associatedTask.id]}
                                    onClick={() => handleReview(associatedTask.id, "rejected")}
                                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-500/20 hover:bg-red-500/35 border border-red-500/30 text-red-300 transition-all shrink-0 cursor-pointer"
                                  >
                                    Reject / Revise
                                  </button>
                                  <button
                                    type="button"
                                    disabled={actioningDict[associatedTask.id]}
                                    onClick={() => handleReview(associatedTask.id, "approved")}
                                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-green-500/20 hover:bg-green-500/35 border border-green-500/30 text-green-300 transition-all shrink-0 cursor-pointer"
                                  >
                                    Approve Task
                                  </button>
                                </div>
                              </div>
                            )}

                            {associatedTask.status === "approved" && (
                              <div className="mt-3 p-3.5 rounded-xl bg-green-500/10 border border-green-500/25 flex items-center justify-between">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-bold text-green-400 uppercase tracking-wider">Status: Approved</span>
                                  {associatedTask.review_notes && (
                                    <span className="text-xs text-gray-300 italic">Notes: "{associatedTask.review_notes}"</span>
                                  )}
                                </div>
                                <span className="text-lg">✅</span>
                              </div>
                            )}

                            {associatedTask.status === "rejected" && (
                              <div className="mt-3 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-between">
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Status: Sent Back for Revision</span>
                                  {associatedTask.review_notes && (
                                    <span className="text-xs text-gray-300 italic">Notes: "{associatedTask.review_notes}"</span>
                                  )}
                                </div>
                                <span className="text-lg">🔄</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* suggestion co-pilot panel */}
            {activeSession.id !== `briefing-lead-${LEAD_ID}` && !twinEnabled && (
              <div className="mx-4 my-2 p-3 rounded-xl border flex flex-col gap-2" style={{
                background: "rgba(99, 102, 241, 0.06)",
                borderColor: "rgba(99, 102, 241, 0.25)"
              }}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-accent)" }}>
                    🤖 Jarvis Assistant Reply Co-pilot
                  </span>
                  <button
                    onClick={handleGetSuggestion}
                    disabled={isDraftLoading}
                    className="text-[10px] px-2 py-0.5 rounded border transition-all hover:bg-white/10"
                    style={{
                      background: "rgba(255, 255, 255, 0.03)",
                      borderColor: "var(--glass-border)",
                      color: "var(--text-primary)",
                      cursor: "pointer"
                    }}
                    type="button"
                  >
                    {isDraftLoading ? "Jarvis is drafting..." : "⚡ Generate Suggestion"}
                  </button>
                </div>
                
                {jarvisDraft && (
                  <div className="text-xs p-2.5 rounded bg-black/25 text-left border animate-in fade-in slide-in-from-bottom-2 duration-200" style={{ borderColor: "rgba(99, 102, 241, 0.15)" }}>
                    <p className="italic leading-normal text-[11px]" style={{ color: "var(--text-secondary)" }}>&ldquo;{jarvisDraft}&rdquo;</p>
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => {
                          setInputValue(jarvisDraft);
                          setJarvisDraft("");
                        }}
                        className="text-[10px] px-2 py-1 bg-indigo-600 rounded text-white hover:bg-indigo-500 font-medium"
                        style={{ cursor: "pointer" }}
                        type="button"
                      >
                        Use Draft
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Message Input Form */}
            <div className="p-4 border-t" style={{ borderColor: "var(--glass-border)", background: "rgba(0, 0, 0, 0.1)" }}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={
                    activeSession.id === `briefing-lead-${LEAD_ID}`
                      ? "Message Jarvis..."
                      : twinEnabled
                      ? "Digital Twin active. Pause Twin to chat directly..."
                      : "Reply to student..."
                  }
                  disabled={
                    (activeSession.id !== `briefing-lead-${LEAD_ID}` && twinEnabled) ||
                    isSending
                  }
                  className="flex-1 px-4 py-2.5 rounded-xl text-xs bg-black/25 border"
                  style={{
                    borderColor: "var(--glass-border)",
                    color: "var(--text-primary)",
                    outline: "none",
                  }}
                  id="chat-input"
                />
                <button
                  type="submit"
                  disabled={
                    (activeSession.id !== `briefing-lead-${LEAD_ID}` && twinEnabled) ||
                    isSending ||
                    !inputValue.trim()
                  }
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition-colors shrink-0 disabled:opacity-40"
                  style={{ cursor: "pointer" }}
                  id="chat-send-btn"
                >
                  {isSending ? "..." : "Send"}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>Select a student session from the sidebar to begin.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Create Panel ── */
function CreatePanel() {
  return (
    <div className="px-6 py-5 max-w-2xl">
      <h2 className="text-sm font-bold mb-4" style={{ color: "var(--text-primary)" }}>Create Week Plan</h2>
      <TaskPlanComposer />
    </div>
  );
}

/* ── Sidebar Button ── */
function SidebarBtn({ active, label, icon, onClick, badge }: {
  active: boolean; label: string; icon: string; onClick: () => void; badge?: number;
}) {
  return (
    <button onClick={onClick} className={`sidebar-button ${active ? "sidebar-button-active" : ""}`} type="button">
      <span className="sidebar-button-icon">{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      {badge && badge > 0 && <span className="notification-badge">{badge}</span>}
    </button>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type Task } from "@/stores/useAppStore";
import { apiFetch } from "@/lib/api";
import { useRealtimeTasks } from "@/lib/useRealtimeTasks";
import ToastNotifications from "@/components/ToastNotifications";
import StudentTaskCard from "@/components/StudentTaskCard";
import ProgressRing from "@/components/ProgressRing";
import StatCard from "@/components/StatCard";
import ChatPane from "@/components/ChatPane";
import { SkeletonCard, SkeletonStat } from "@/components/SkeletonLoader";

type Panel = "tasks" | "chat";

const KUSUMA_ID = "93687b3d-0063-4de2-8eea-5c2135e7ffe8";

export default function StudentDashboard() {
  const router = useRouter();
  const { setCurrentUser, setActiveSessionId, setDashboardRole, tasks, setTasks, messages, isStreaming } = useAppStore();
  const [activePanel, setActivePanel] = useState<Panel>("tasks");
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, pending: 0, submitted: 0, approved: 0, rejected: 0, avg_progress: 0 });

  // Route guard check
  useEffect(() => {
    const isLoggedIn = localStorage.getItem("studentLoggedIn");
    if (!isLoggedIn) {
      router.push("/");
    }
  }, [router]);

  // Initialize user context
  useEffect(() => {
    setCurrentUser({ id: KUSUMA_ID, name: "Kusuma", role: "team_member" });
    setActiveSessionId("99999999-9999-4999-8999-999999999999");
    setDashboardRole("student");
  }, [setCurrentUser, setActiveSessionId, setDashboardRole]);

  // Enable real-time task sync
  useRealtimeTasks("student", KUSUMA_ID);

  // Load tasks
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [taskData, statData] = await Promise.all([
          apiFetch<{ tasks: Task[] }>(`/tasks?role=student&user_id=${KUSUMA_ID}`),
          apiFetch<typeof stats>(`/tasks/stats?user_id=${KUSUMA_ID}`),
        ]);
        setTasks(taskData.tasks);
        setStats(statData);
      } catch (err) {
        console.error("Failed to load data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [setTasks]);

  // Recalculate stats when tasks change
  useEffect(() => {
    if (tasks.length > 0) {
      const daily = tasks.filter((t) => t.scope === "daily_task");
      setStats({
        total: tasks.length,
        pending: tasks.filter((t) => t.status === "pending").length,
        submitted: tasks.filter((t) => t.status === "submitted").length,
        approved: tasks.filter((t) => t.status === "approved").length,
        rejected: tasks.filter((t) => t.status === "rejected").length,
        avg_progress: daily.length ? Math.round(daily.reduce((s, t) => s + (t.progress || 0), 0) / daily.length) : 0,
      });
    }
  }, [tasks]);

  // Extract leading number from title for stable ascending sort (e.g. "TASK 3 —" → 3, "Subtask 2.4 —" → 2.4)
  const taskNum = (title: string) => {
    const m = title.match(/(?:TASK\s+(\d+)|Subtask\s+(\d+\.\d+))/i);
    return m ? parseFloat(m[1] ?? m[2]) : 999;
  };
  const weeklyGoals = useMemo(() =>
    tasks.filter((t) => t.scope === "weekly_goal").sort((a, b) => taskNum(a.title) - taskNum(b.title)),
  [tasks]);
  const dailyTasks = useMemo(() =>
    tasks.filter((t) => t.scope === "daily_task").sort((a, b) => taskNum(a.title) - taskNum(b.title)),
  [tasks]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <ToastNotifications />

      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="flex items-center justify-between px-6 py-4 border-b"
        style={{ borderColor: "var(--glass-border)" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "var(--student-gradient)" }}>
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Welcome back, <span className="gradient-text-success">Kusuma</span>
            </h1>
            <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
              {stats.pending} tasks pending · {stats.approved} completed
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Overall Progress Ring */}
          <ProgressRing progress={stats.avg_progress} size={44} strokeWidth={4} color="#10b981" label="done" />
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-card shrink-0">
            <span className="w-2 h-2 rounded-full streaming-dot" style={{ background: "var(--gradient-success)" }} />
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              {isStreaming ? "Responding" : "Twin Online"}
            </span>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("studentLoggedIn");
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
        <motion.aside
          initial={{ x: -24, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.45, delay: 0.05 }}
          className="hidden md:flex w-[260px] shrink-0 flex-col border-r"
          style={{ borderColor: "var(--glass-border)" }}
        >
          <div className="p-4 border-b" style={{ borderColor: "var(--glass-border)" }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
              Workspace
            </p>
            <div className="grid gap-2">
              <SidebarBtn active={activePanel === "tasks"} label="My Tasks" count={stats.pending} icon="📋" onClick={() => setActivePanel("tasks")} />
              <SidebarBtn active={activePanel === "chat"} label="Chat with Twin" count={messages.length} icon="💬" onClick={() => setActivePanel("chat")} />
            </div>
          </div>

          {/* Weekly Goals Summary */}
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
              Weekly Goals
            </p>
            <div className="space-y-2">
              {weeklyGoals.map((goal) => {
                const children = dailyTasks.filter((t) => t.parent_id === goal.id);
                const completed = children.filter((t) => t.status === "approved").length;
                const total = children.length;
                const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                return (
                  <div key={goal.id} className="sidebar-list-item">
                    <div className="flex items-center gap-2 mb-1.5">
                      <ProgressRing progress={pct} size={28} strokeWidth={3} color="#10b981" showLabel={false} />
                      <span className="text-[11px] font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                        {goal.title.replace(/^TASK \d+ — /, "")}
                      </span>
                    </div>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {completed}/{total} subtasks · {pct}%
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.aside>

        {/* Mobile Tab Bar */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <div className="md:hidden flex border-b px-3 py-2 gap-2" style={{ borderColor: "var(--glass-border)" }}>
            <SidebarBtn active={activePanel === "tasks"} label="Tasks" count={stats.pending} icon="📋" onClick={() => setActivePanel("tasks")} />
            <SidebarBtn active={activePanel === "chat"} label="Chat" count={messages.length} icon="💬" onClick={() => setActivePanel("chat")} />
          </div>

          <motion.main
            key={activePanel}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25 }}
            className="flex-1 min-w-0 overflow-hidden"
          >
            {activePanel === "tasks" ? (
              <StudentTasksView weeklyGoals={weeklyGoals} dailyTasks={dailyTasks} isLoading={isLoading} stats={stats} />
            ) : (
              <ChatPane />
            )}
          </motion.main>
        </div>
      </div>
    </div>
  );
}

/* ── Student Tasks View ── */
function StudentTasksView({
  weeklyGoals,
  dailyTasks,
  isLoading,
  stats,
}: {
  weeklyGoals: Task[];
  dailyTasks: Task[];
  isLoading: boolean;
  stats: { total: number; pending: number; submitted: number; approved: number; rejected: number; avg_progress: number };
}) {
  const [filter, setFilter] = useState<"all" | "pending" | "submitted" | "reviewed" | "completed">("all");

  const filteredDailyTasks = useMemo(() => {
    return dailyTasks.filter((task) => {
      if (filter === "all") return true;
      if (filter === "pending") return task.status === "pending";
      if (filter === "submitted") return task.status === "submitted";
      if (filter === "completed") return task.status === "approved";
      if (filter === "reviewed") return task.status === "approved" || task.status === "rejected";
      return true;
    });
  }, [dailyTasks, filter]);

  const visibleWeeklyGoals = useMemo(() => {
    return weeklyGoals.filter((goal) => {
      const children = dailyTasks.filter((t) => t.parent_id === goal.id);
      const filteredChildren = children.filter((task) => {
        if (filter === "all") return true;
        if (filter === "pending") return task.status === "pending";
        if (filter === "submitted") return task.status === "submitted";
        if (filter === "completed") return task.status === "approved";
        if (filter === "reviewed") return task.status === "approved" || task.status === "rejected";
        return true;
      });
      return filteredChildren.length > 0;
    });
  }, [weeklyGoals, dailyTasks, filter]);

  const [expandedGoals, setExpandedGoals] = useState<Record<string, boolean>>({});

  // Auto-expand the first goal once loaded
  useEffect(() => {
    if (visibleWeeklyGoals.length > 0 && Object.keys(expandedGoals).length === 0) {
      setExpandedGoals({ [visibleWeeklyGoals[0].id]: true });
    }
  }, [visibleWeeklyGoals, expandedGoals]);

  const toggleGoal = (goalId: string) => {
    setExpandedGoals((prev) => ({ ...prev, [goalId]: !prev[goalId] }));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--glass-border)" }}>
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>My Task Board</h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{stats.total} tasks · {stats.pending} pending</p>
        </div>
        <div className="flex gap-2">
          {(["approved", "submitted", "pending", "rejected"] as const).map((s) => {
            const count = stats[s];
            if (count === 0) return null;
            return <span key={s} className={`badge badge-${s}`}>{count} {s}</span>;
          })}
        </div>
      </div>

      {/* Segmented Apple-Style Filter Bar */}
      <div className="px-6 pt-4 flex justify-center shrink-0">
        <div className="inline-flex p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 relative">
          {(["all", "pending", "submitted", "reviewed", "completed"] as const).map((opt) => {
            const active = filter === opt;
            const label = opt === "all" ? "All" : 
                          opt === "pending" ? "Pending" : 
                          opt === "submitted" ? "Submitted" : 
                          opt === "reviewed" ? "Reviewed" : "Completed";
            return (
              <button
                key={opt}
                onClick={() => setFilter(opt)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                  active 
                    ? "bg-white text-gray-900 shadow-sm" 
                    : "text-gray-500 hover:text-gray-900"
                }`}
                style={{ cursor: "pointer" }}
                type="button"
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {/* Stat Cards */}
        {!isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total" value={stats.total} icon="📋" variant="accent" delay={0} />
            <StatCard label="Pending" value={stats.pending} icon="⏳" variant="warning" delay={0.05} />
            <StatCard label="Approved" value={stats.approved} icon="✅" variant="success" delay={0.1} />
            <StatCard label="Progress" value={stats.avg_progress} icon="📊" variant="accent" suffix="%" delay={0.15} />
          </div>
        )}
        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <SkeletonStat key={i} />)}
          </div>
        )}

        {/* Weekly Goal Groups */}
        {isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>
        ) : (
          <AnimatePresence mode="popLayout">
            {visibleWeeklyGoals.map((goal) => {
              const children = filteredDailyTasks.filter((t) => t.parent_id === goal.id);
              const completed = children.filter((t) => t.status === "approved").length;
              const total = children.length;
              const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
              const isOpen = expandedGoals[goal.id] ?? false;

              return (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.3 }}
                  className="apple-card"
                >
                  {/* Expandable Weekly Goal Header */}
                  <div
                    onClick={() => toggleGoal(goal.id)}
                    className="flex items-center justify-between p-5 cursor-pointer hover:bg-black/[0.01] transition-colors"
                  >
                    <div className="flex items-center gap-3.5 flex-1 min-w-0">
                      <ProgressRing progress={pct} size={42} strokeWidth={4.5} color="#34c759" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold tracking-widest uppercase text-gray-400">
                            Weekly Goal
                          </span>
                          <span className={`badge badge-${goal.status} text-[9px] px-1.5 py-0.5`}>
                            {goal.status}
                          </span>
                        </div>
                        <p className="text-sm font-semibold truncate text-gray-900 mt-0.5">
                          {goal.title}
                        </p>
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

                  {/* Expandable Body */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 pt-1 border-t border-gray-100 bg-gray-50/40 space-y-4">
                          {goal.description && (
                            <div className="p-3.5 rounded-xl bg-white/70 border border-gray-100 shadow-sm text-xs text-gray-600 leading-relaxed">
                              <p className="font-semibold text-gray-700 mb-1">Objective</p>
                              {goal.description}
                            </div>
                          )}

                          {/* Daily Tasks */}
                          <div className="space-y-3 pl-1">
                            <h4 className="text-[10px] font-bold tracking-wider text-gray-400 uppercase mb-2">
                              Daily Tasks
                            </h4>
                            {children.map((task) => (
                              <StudentTaskCard key={task.id} task={task} />
                            ))}
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

            {!isLoading && visibleWeeklyGoals.length === 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center p-8 text-center bg-white/50 border border-black/5 rounded-2xl shadow-sm"
              >
                <span className="text-3xl mb-2">🍎</span>
                <h3 className="text-sm font-bold text-gray-900 mb-1">No tasks in this category</h3>
                <p className="text-xs text-gray-500 max-w-xs">
                  Everything is clear here! Use the tabs above to view other daily tasks.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}

/* ── Sidebar Button ── */
function SidebarBtn({ active, label, count, icon, onClick }: {
  active: boolean; label: string; count: number; icon: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={`sidebar-button ${active ? "sidebar-button-active" : ""}`} type="button">
      <span className="sidebar-button-icon">{icon}</span>
      <span className="flex-1 text-left truncate">{label}</span>
      {count > 0 && <span className="sidebar-count">{count}</span>}
    </button>
  );
}

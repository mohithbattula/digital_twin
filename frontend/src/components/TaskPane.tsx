"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/stores/useAppStore";
import { apiFetch } from "@/lib/api";
import TaskCard from "./TaskCard";
import TaskPlanComposer from "./TaskPlanComposer";
import type { Task } from "@/stores/useAppStore";

export default function TaskPane() {
  const { tasks, setTasks } = useAppStore();

  // Load tasks on mount
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const data = await apiFetch<{ tasks: Task[] }>("/tasks");
        setTasks(data.tasks);
      } catch (err) {
        console.error("Failed to load tasks:", err);
      }
    };

    loadTasks();
  }, [setTasks]);

  // Group tasks: weekly goals and their children
  const weeklyGoals = tasks.filter((t) => t.scope === "weekly_goal");
  const dailyTasks = tasks.filter((t) => t.scope === "daily_task");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Task Header */}
      <div
        className="px-6 py-4 border-b flex items-center justify-between"
        style={{ borderColor: "var(--glass-border)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Task Board
          </h2>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {tasks.length} tasks - {tasks.filter((t) => t.status === "pending").length} pending
          </p>
        </div>

        {/* Status summary pills */}
        <div className="flex gap-2">
          {(["approved", "submitted", "pending", "rejected"] as const).map((status) => {
            const count = tasks.filter((t) => t.status === status).length;
            if (count === 0) return null;
            return (
              <span key={status} className={`badge badge-${status}`}>
                {count} {status}
              </span>
            );
          })}
        </div>
      </div>

      {/* Tasks List */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        <TaskPlanComposer />

        {tasks.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-full text-center"
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)" }}
            >
              <span className="text-sm font-bold" style={{ color: "var(--text-accent)" }}>TB</span>
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              No tasks yet
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Tasks will appear here when assigned
            </p>
          </motion.div>
        )}

        <AnimatePresence>
          {weeklyGoals.map((goal) => {
            const children = dailyTasks.filter((t) => t.parent_id === goal.id);
            return (
              <motion.div
                key={goal.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
              >
                {/* Weekly Goal Header */}
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-1 h-5 rounded-full"
                    style={{ background: "var(--gradient-accent)" }}
                  />
                  <h3
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-accent)" }}
                  >
                    Weekly Goal
                  </h3>
                  <span className={`badge badge-${goal.status}`}>
                    {goal.status}
                  </span>
                </div>

                <div className="glass-card p-4 mb-3">
                  <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {goal.title}
                  </h4>
                  {goal.description && (
                    <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                      {goal.description}
                    </p>
                  )}
                </div>

                {/* Daily Tasks */}
                <div className="ml-4 space-y-2">
                  {children.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                  {children.length === 0 && (
                    <p className="text-xs py-2 pl-3" style={{ color: "var(--text-muted)" }}>
                      No daily tasks under this goal
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}

          {/* Orphaned daily tasks (no parent) */}
          {dailyTasks.filter((t) => !t.parent_id).length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div className="flex items-center gap-2 mb-3 mt-4">
                <div
                  className="w-1 h-5 rounded-full"
                  style={{ background: "var(--gradient-warning)" }}
                />
                <h3
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Unlinked Tasks
                </h3>
              </div>
              <div className="space-y-2">
                {dailyTasks
                  .filter((t) => !t.parent_id)
                  .map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAppStore, type Task } from "@/stores/useAppStore";

export default function TaskPlanComposer() {
  const { currentUser, tasks, setTasks } = useAppStore();
  const [weeklyTitle, setWeeklyTitle] = useState("");
  const [weeklyDescription, setWeeklyDescription] = useState("");
  const [dailyTasks, setDailyTasks] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentUser || !weeklyTitle.trim() || isSaving) return;

    setIsSaving(true);
    setError("");

    try {
      const dailyPayload = dailyTasks
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((title) => ({ title, description: "" }));

      const data = await apiFetch<{ tasks: Task[] }>("/tasks/week-plan", {
        method: "POST",
        body: JSON.stringify({
          user_id: currentUser.id,
          weekly_title: weeklyTitle.trim(),
          weekly_description: weeklyDescription.trim(),
          daily_tasks: dailyPayload,
        }),
      });

      const existingIds = new Set(tasks.map((task) => task.id));
      const createdTasks = data.tasks.filter((task) => !existingIds.has(task.id));
      setTasks([...createdTasks, ...tasks]);
      setWeeklyTitle("");
      setWeeklyDescription("");
      setDailyTasks("");
    } catch (err) {
      console.error("Failed to save week plan:", err);
      setError("Could not save the week plan. Check the backend and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Add This Week&apos;s Context
        </h3>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Add the weekly goal and daily tasks so the twin can use them while responding.
        </p>
      </div>

      <div className="mt-4 grid gap-3">
        <input
          value={weeklyTitle}
          onChange={(event) => setWeeklyTitle(event.target.value)}
          placeholder="Weekly goal, for example: Complete dashboard MVP"
          className="glass-input"
        />
        <textarea
          value={weeklyDescription}
          onChange={(event) => setWeeklyDescription(event.target.value)}
          placeholder="Weekly goal details or acceptance criteria"
          rows={2}
          className="glass-input resize-none"
        />
        <textarea
          value={dailyTasks}
          onChange={(event) => setDailyTasks(event.target.value)}
          placeholder={"Daily tasks, one per line\nFix chat streaming\nAdd task creation UI\nVerify Supabase schema"}
          rows={4}
          className="glass-input resize-none"
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: error ? "#f87171" : "var(--text-muted)" }}>
          {error || "Daily tasks are optional; each line becomes a child task."}
        </p>
        <button
          type="submit"
          disabled={!weeklyTitle.trim() || isSaving}
          className="btn-accent shrink-0"
        >
          {isSaving ? "Adding..." : "Add Plan"}
        </button>
      </div>
    </form>
  );
}

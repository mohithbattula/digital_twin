"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAppStore, type Task, type Notification } from "@/stores/useAppStore";

/**
 * Subscribes to Supabase Realtime changes on the `tasks` table.
 * - For students: filters by assigned_to = userId
 * - For leads: receives all task changes
 * Dispatches upsert/remove to Zustand store and creates notifications.
 */
export function useRealtimeTasks(
  role: "student" | "lead",
  userId?: string
) {
  const { upsertTask, removeTask, addNotification } = useAppStore();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    // Build a filter for student role
    const filter =
      role === "student" && userId
        ? `assigned_to=eq.${userId}`
        : undefined;

    const channel = supabase
      .channel(`tasks-realtime-${role}`)
      .on(
        "postgres_changes" as any,
        {
          event: "INSERT",
          schema: "public",
          table: "tasks",
          ...(filter ? { filter } : {}),
        },
        (payload: any) => {
          const task = payload.new as Task;
          upsertTask(task);
        }
      )
      .on(
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "tasks",
          ...(filter ? { filter } : {}),
        },
        (payload: any) => {
          const task = payload.new as Task;
          const oldTask = payload.old as Partial<Task>;
          upsertTask(task);

          // Generate notifications on status changes
          if (oldTask.status !== task.status) {
            const notification = buildNotification(task, role);
            if (notification) {
              addNotification(notification);
            }
          }
        }
      )
      .on(
        "postgres_changes" as any,
        {
          event: "DELETE",
          schema: "public",
          table: "tasks",
          ...(filter ? { filter } : {}),
        },
        (payload: any) => {
          removeTask(payload.old?.id);
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [role, userId, upsertTask, removeTask, addNotification]);
}

function buildNotification(
  task: Task,
  role: "student" | "lead"
): Notification | null {
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();

  if (role === "lead" && task.status === "submitted") {
    return {
      id,
      type: "task_submitted",
      title: "Task Submitted",
      message: `"${task.title}" has been submitted for review`,
      taskId: task.id,
      timestamp,
      read: false,
    };
  }

  if (role === "student" && task.status === "approved") {
    return {
      id,
      type: "task_approved",
      title: "Task Approved ✅",
      message: `"${task.title}" has been approved!`,
      taskId: task.id,
      timestamp,
      read: false,
    };
  }

  if (role === "student" && task.status === "rejected") {
    return {
      id,
      type: "task_rejected",
      title: "Task Needs Revision",
      message: `"${task.title}" was sent back for revision`,
      taskId: task.id,
      timestamp,
      read: false,
    };
  }

  return null;
}

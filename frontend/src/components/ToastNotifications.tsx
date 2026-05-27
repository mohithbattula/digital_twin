"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore, type Notification } from "@/stores/useAppStore";

interface Toast extends Notification {
  exiting?: boolean;
}

export default function ToastNotifications() {
  const { notifications, markNotificationRead } = useAppStore();
  const [visibleToasts, setVisibleToasts] = useState<Toast[]>([]);

  // Show new unread notifications as toasts
  useEffect(() => {
    const unread = notifications.filter((n) => !n.read);
    const existing = new Set(visibleToasts.map((t) => t.id));
    const newOnes = unread.filter((n) => !existing.has(n.id));

    if (newOnes.length > 0) {
      setVisibleToasts((prev) => [...newOnes.map((n) => ({ ...n })), ...prev].slice(0, 5));
    }
  }, [notifications]);

  const dismiss = useCallback(
    (id: string) => {
      setVisibleToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );
      setTimeout(() => {
        setVisibleToasts((prev) => prev.filter((t) => t.id !== id));
        markNotificationRead(id);
      }, 300);
    },
    [markNotificationRead]
  );

  // Auto-dismiss after 5s
  useEffect(() => {
    const timers = visibleToasts
      .filter((t) => !t.exiting)
      .map((t) =>
        setTimeout(() => dismiss(t.id), 5000)
      );
    return () => timers.forEach(clearTimeout);
  }, [visibleToasts, dismiss]);

  const typeClass: Record<string, string> = {
    task_submitted: "toast-submitted",
    task_approved: "toast-approved",
    task_rejected: "toast-rejected",
    comment_added: "toast-submitted",
  };

  return (
    <div className="toast-container">
      <AnimatePresence>
        {visibleToasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 100, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.95 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`toast ${typeClass[toast.type] || ""} ${toast.exiting ? "toast-exit" : ""}`}
            onClick={() => dismiss(toast.id)}
            style={{ cursor: "pointer" }}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {toast.title}
                </p>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-secondary)" }}>
                  {toast.message}
                </p>
              </div>
              <span className="text-[10px] shrink-0 pt-0.5" style={{ color: "var(--text-muted)" }}>
                now
              </span>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

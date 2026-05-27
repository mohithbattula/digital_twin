"use client";

import { motion } from "framer-motion";

interface TimelineEvent {
  id: string;
  title: string;
  description?: string;
  timestamp: string;
  status: "submitted" | "approved" | "rejected" | "pending" | "flagged";
}

interface TaskTimelineProps {
  events: TimelineEvent[];
}

const dotClass: Record<string, string> = {
  submitted: "timeline-dot",
  approved: "timeline-dot timeline-dot-success",
  rejected: "timeline-dot timeline-dot-danger",
  pending: "timeline-dot timeline-dot-warning",
  flagged: "timeline-dot timeline-dot-danger",
};

const statusIcon: Record<string, string> = {
  submitted: "📤",
  approved: "✅",
  rejected: "❌",
  pending: "⏳",
  flagged: "🚩",
};

function relativeTime(ts: string): string {
  const now = Date.now();
  const then = new Date(ts).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function TaskTimeline({ events }: TaskTimelineProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <span className="text-2xl mb-2">📋</span>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          No recent activity
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {events.map((event, i) => (
        <motion.div
          key={event.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: i * 0.05 }}
          className="timeline-item"
        >
          <div className={dotClass[event.status] || "timeline-dot"} />
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                {statusIcon[event.status] || "📋"} {event.title}
              </p>
              {event.description && (
                <p className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                  {event.description}
                </p>
              )}
            </div>
            <span className="text-[10px] shrink-0 pt-0.5" style={{ color: "var(--text-muted)" }}>
              {relativeTime(event.timestamp)}
            </span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

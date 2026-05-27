"use client";

import { motion } from "framer-motion";
import type { Message } from "@/stores/useAppStore";

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isHuman = message.sender_type === "human";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`flex ${isHuman ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
          isHuman ? "" : "glass-card"
        }`}
        style={
          isHuman
            ? {
                background: "var(--gradient-accent)",
                color: "white",
                borderBottomRightRadius: 6,
              }
            : {
                borderBottomLeftRadius: 6,
                boxShadow: "var(--shadow-glow)",
              }
        }
      >
        {/* Sender label */}
        <p
          className="text-[10px] font-semibold uppercase tracking-wider mb-1"
          style={{
            color: isHuman ? "rgba(255,255,255,0.7)" : "var(--text-accent)",
          }}
        >
          {isHuman ? "You" : "Jaswanth (Twin)"}
        </p>

        {/* Message content */}
        <p
          className="text-sm leading-relaxed whitespace-pre-wrap"
          style={{
            color: isHuman ? "white" : "var(--text-primary)",
          }}
        >
          {message.content || (
            <span className="streaming-dot inline-block">●●●</span>
          )}
        </p>

        {/* Timestamp */}
        <p
          className="text-[10px] mt-1.5"
          style={{
            color: isHuman ? "rgba(255,255,255,0.5)" : "var(--text-muted)",
            textAlign: isHuman ? "right" : "left",
          }}
        >
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>

        {/* Feedback buttons for twin messages */}
        {!isHuman && message.content && message.trace_id && (
          <div className="flex gap-2 mt-2 pt-2 border-t" style={{ borderColor: "var(--glass-border)" }}>
            <button
              className="text-xs px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
              style={{ color: "var(--text-muted)" }}
              title="Good response"
              id={`feedback-up-${message.id}`}
            >
              👍
            </button>
            <button
              className="text-xs px-2 py-1 rounded-md hover:bg-white/10 transition-colors"
              style={{ color: "var(--text-muted)" }}
              title="Bad response"
              id={`feedback-down-${message.id}`}
            >
              👎
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

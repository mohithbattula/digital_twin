"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/lib/api";
import { useAppStore, type TaskComment } from "@/stores/useAppStore";

interface CommentThreadProps {
  taskId: string;
}

export default function CommentThread({ taskId }: CommentThreadProps) {
  const { currentUser } = useAppStore();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [content, setContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await apiFetch<{ comments: TaskComment[] }>(`/tasks/${taskId}/comments`);
        setComments(data.comments);
      } catch (err) {
        console.error("Failed to load comments:", err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [taskId]);

  const handleSend = async () => {
    if (!content.trim() || !currentUser || isSending) return;
    setIsSending(true);
    try {
      const data = await apiFetch<{ comment: TaskComment }>(`/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ user_id: currentUser.id, content: content.trim() }),
      });
      setComments((prev) => [...prev, data.comment]);
      setContent("");
    } catch (err) {
      console.error("Failed to add comment:", err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  function relativeTime(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  return (
    <div className="mt-3">
      {/* Comments List */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-[11px] text-center py-3" style={{ color: "var(--text-muted)" }}>
          No comments yet — start the conversation
        </p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
          <AnimatePresence initial={false}>
            {comments.map((comment) => {
              const isLead = comment.users?.role === "team_lead";
              return (
                <motion.div
                  key={comment.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`comment-bubble ${isLead ? "comment-bubble-lead" : "comment-bubble-student"}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-semibold" style={{ color: isLead ? "var(--text-accent)" : "var(--student-accent-light)" }}>
                      {comment.users?.name || "User"}
                    </span>
                    <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                      {relativeTime(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                    {comment.content}
                  </p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment..."
          rows={1}
          className="glass-input resize-none flex-1 text-xs"
          style={{ padding: "8px 12px" }}
        />
        <button
          onClick={handleSend}
          disabled={!content.trim() || isSending}
          className="btn-accent"
          style={{ padding: "8px 14px", borderRadius: 10, fontSize: 12 }}
        >
          {isSending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}

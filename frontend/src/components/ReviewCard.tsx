"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Task } from "@/stores/useAppStore";
import { apiFetch, getApiBaseUrl } from "@/lib/api";
import { useAppStore } from "@/stores/useAppStore";
import CommentThread from "./CommentThread";

interface ReviewCardProps {
  task: Task;
}

interface AttachedFile {
  name: string;
  type: string;
  url: string;
  size?: number;
}

function fileIcon(type: string): string {
  if (type.startsWith("image/")) return "🖼️";
  if (type.includes("pdf")) return "📄";
  if (type.includes("word") || type.includes("document")) return "📝";
  if (type.includes("sheet") || type.includes("csv")) return "📊";
  if (type.includes("presentation")) return "📽️";
  return "📎";
}

function parseAttachedDocs(notes: string): { cleanNotes: string; files: AttachedFile[] } {
  const separator = "--- Attached Documents ---";
  const idx = notes.indexOf(separator);
  if (idx === -1) return { cleanNotes: notes.trim(), files: [] };

  const cleanNotes = notes.substring(0, idx).trim();
  const docSection = notes.substring(idx + separator.length).trim();
  const files: AttachedFile[] = [];

  for (const line of docSection.split("\n")) {
    // New format: • name | type | url
    const pipeMatch = line.match(/^[•\-]\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/);
    if (pipeMatch) {
      files.push({
        name: pipeMatch[1].trim(),
        type: pipeMatch[2].trim(),
        url: pipeMatch[3].trim(),
      });
      continue;
    }
    // Legacy format: • name (type)
    const parenMatch = line.match(/^[•\-]\s*(.+?)\s*\((.+?)\)$/);
    if (parenMatch) {
      files.push({
        name: parenMatch[1].trim(),
        type: parenMatch[2].trim(),
        url: "",
      });
    }
  }

  return { cleanNotes, files };
}

export default function ReviewCard({ task }: ReviewCardProps) {
  const { updateTask } = useAppStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiFiles, setApiFiles] = useState<AttachedFile[]>([]);

  // Parse docs from submission notes + try to fetch actual file list
  const { cleanNotes, files: parsedFiles } = parseAttachedDocs(task.submission_notes || "");

  useEffect(() => {
    let active = true;
    apiFetch<{ files: AttachedFile[] }>(`/tasks/${task.id}/files`)
      .then((data) => {
        if (active && data.files) {
          setApiFiles(data.files);
        }
      })
      .catch((err) => console.error("Failed to load task files:", err));
    return () => {
      active = false;
    };
  }, [task.id]);

  const allFiles = useMemo(() => {
    if (parsedFiles.length === 0) return apiFiles;
    if (apiFiles.length === 0) return parsedFiles;

    const usedApiIndices = new Set<number>();
    return parsedFiles.map((pf, idx) => {
      const pExt = pf.name.split('.').pop()?.toLowerCase() || '';
      
      let matchIdx = apiFiles.findIndex((af, aIdx) => {
        if (usedApiIndices.has(aIdx)) return false;
        const aExt = af.name.split('.').pop()?.toLowerCase() || '';
        const extMatch = pExt && aExt && pExt === aExt;
        const typeMatch = af.type === pf.type;
        return extMatch || typeMatch;
      });

      if (matchIdx === -1 && apiFiles.length === parsedFiles.length && !usedApiIndices.has(idx)) {
        matchIdx = idx;
      }

      if (matchIdx !== -1) {
        usedApiIndices.add(matchIdx);
        return {
          ...pf,
          url: apiFiles[matchIdx].url,
          size: apiFiles[matchIdx].size || pf.size,
        };
      }
      return pf;
    });
  }, [parsedFiles, apiFiles]);

  const handleReview = async (status: "approved" | "rejected") => {
    setIsSubmitting(true);
    try {
      const data = await apiFetch<{ task: Task }>(`/tasks/${task.id}/review`, {
        method: "PATCH",
        body: JSON.stringify({ status, review_notes: reviewNotes.trim() }),
      });
      updateTask(task.id, data.task);
      setIsExpanded(false);
      setReviewNotes("");
    } catch (err) {
      console.error("Review failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const submittedAgo = task.completed_at ? relativeTime(task.completed_at) : "recently";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="apple-subtask-card overflow-hidden"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(0, 113, 227, 0.08)" }}
            >
              <span className="text-sm">📤</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-gray-900 truncate">
                {task.title}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Submitted {submittedAgo}
              </p>
            </div>
          </div>
          <span className="badge badge-submitted text-[9px] px-2 py-0.5 font-bold shrink-0">Review</span>
        </div>

        {/* Task Description */}
        {task.description && (
          <div className="mt-3.5 p-3 rounded-xl bg-gray-50 border border-gray-100 text-xs text-gray-600 leading-relaxed">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-1">
              Task Description
            </p>
            <p className="whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {/* Submission Notes */}
        {cleanNotes && (
          <div className="mt-3.5 p-3.5 rounded-xl bg-blue-50/40 border border-blue-100 text-xs text-gray-700 leading-relaxed">
            <p className="text-[9px] font-bold uppercase tracking-wider text-blue-600 mb-1.5">
              Student Submission Notes
            </p>
            <p className="whitespace-pre-wrap font-medium">{cleanNotes}</p>
          </div>
        )}

        {/* Attached Documents */}
        {allFiles.length > 0 && (
          <div className="mt-3.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-gray-400 mb-2">
              📎 Attached Documents ({allFiles.length})
            </p>
            <div className="space-y-2">
              {allFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 p-3 rounded-xl bg-gray-50/50 border border-gray-100"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "rgba(0, 113, 227, 0.08)" }}
                  >
                    <span className="text-sm">{fileIcon(file.type)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800 truncate">
                      {file.name}
                    </p>
                    <p className="text-[9px] text-gray-400 mt-0.5">
                      {file.type}
                      {file.size ? ` · ${formatSize(file.size)}` : ""}
                    </p>
                  </div>
                  {file.url && file.url.length > 1 ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={file.url.startsWith("/v1/") ? `${getApiBaseUrl().replace(/\/v1$/, "")}${file.url}` : file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="apple-button-pill bg-gray-100 hover:bg-gray-200 text-[10px] text-gray-700 px-3.5 py-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        View
                      </a>
                      <a
                        href={file.url.startsWith("/v1/") ? `${getApiBaseUrl().replace(/\/v1$/, "")}${file.url}` : file.url}
                        download={file.name}
                        className="apple-button-pill bg-blue-600 text-[10px] text-white px-3.5 py-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Download
                      </a>
                    </div>
                  ) : (
                    <span className="text-[9px] px-2 py-1 text-gray-400">
                      No link
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress info */}
        {task.progress > 0 && (
          <div className="mt-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Progress</span>
              <span className="text-[10px] font-bold text-blue-600">{task.progress}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${task.progress}%` }} />
            </div>
          </div>
        )}

        {/* Jarvis Co-pilot Recommendation */}
        {task.twin_review_status && (
          <div
            className="mt-4 p-4 rounded-2xl text-xs relative overflow-hidden border border-indigo-100"
            style={{
              background: "linear-gradient(135deg, rgba(99, 102, 241, 0.04), rgba(99, 102, 241, 0.01))",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold uppercase tracking-wider text-[9px] text-indigo-600 flex items-center gap-1">
                🤖 Jarvis Assistant Suggestion
              </span>
              <span className={`badge badge-${task.twin_review_status} text-[9px] px-2 py-0.5`}>
                Proposes {task.twin_review_status}
              </span>
            </div>
            {task.twin_review_notes && (
              <p className="whitespace-pre-wrap italic mb-3 text-[11px] leading-relaxed text-indigo-950 font-medium">
                &ldquo;{task.twin_review_notes}&rdquo;
              </p>
            )}
            <button
              onClick={() => {
                setReviewNotes(task.twin_review_notes || "");
                setIsExpanded(true);
              }}
              className="w-full apple-button-pill text-[10px] py-2 flex items-center justify-center gap-1 text-indigo-700 bg-indigo-50 border border-indigo-200"
              type="button"
            >
              ⚡ Accept Jarvis Suggestion (Pre-fill Feedback)
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-4.5">
          <button
            onClick={() => handleReview("approved")}
            disabled={isSubmitting}
            className="apple-button-pill bg-green-600 text-white flex-1 text-xs py-2.5"
            type="button"
          >
            {isSubmitting ? "..." : "✓ Approve"}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="apple-button-pill bg-gray-100 text-gray-700 text-xs py-2.5"
            type="button"
          >
            💬 Note
          </button>
          <button
            onClick={() => handleReview("rejected")}
            disabled={isSubmitting}
            className="apple-button-pill bg-red-500 text-white flex-1 text-xs py-2.5"
            type="button"
          >
            {isSubmitting ? "..." : "✗ Reject"}
          </button>
        </div>
      </div>

      {/* Expandable Review Notes */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-gray-100 bg-gray-50/20">
              <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mt-3 mb-1.5">
                Review Feedback
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Add feedback for the student..."
                rows={3}
                className="apple-input w-full resize-none text-xs"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => setIsExpanded(false)} className="apple-button-pill bg-gray-100 text-gray-700 text-xs py-1.5" type="button">
                  Cancel
                </button>
                <button
                  onClick={() => handleReview("approved")}
                  disabled={isSubmitting}
                  className="apple-button-pill bg-green-600 text-white text-xs py-1.5"
                  type="button"
                >
                  Approve with Note
                </button>
                <button
                  onClick={() => handleReview("rejected")}
                  disabled={isSubmitting}
                  className="apple-button-pill bg-red-500 text-white text-xs py-1.5"
                  type="button"
                >
                  Reject with Note
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comment Thread Toggle */}
      <div className="px-5 pb-3.5">
        <button onClick={() => setShowComments(!showComments)} className="btn-ghost text-[10px] text-gray-400 hover:text-gray-900 w-full border-dashed" type="button">
          💬 {showComments ? "Hide Comments Discussion" : "Show Comments & Discussion"}
        </button>
      </div>

      <AnimatePresence>
        {showComments && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-5 pb-5 border-t border-gray-100 bg-gray-50/10">
              <CommentThread taskId={task.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


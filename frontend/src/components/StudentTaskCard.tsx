"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Task } from "@/stores/useAppStore";
import { useAppStore } from "@/stores/useAppStore";
import { apiFetch, apiUpload, type UploadedFile } from "@/lib/api";
import CommentThread from "./CommentThread";

interface StagedFile {
  file: File;
  id: string;
}

const ALLOWED_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xlsx", ".pptx",
  ".txt", ".md", ".csv", ".png", ".jpg", ".jpeg", ".webp",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string): string {
  if (type.startsWith("image/")) return "🖼️";
  if (type.includes("pdf")) return "📄";
  if (type.includes("word") || type.includes("document")) return "📝";
  if (type.includes("sheet") || type.includes("csv")) return "📊";
  if (type.includes("presentation")) return "📽️";
  return "📎";
}

const statusConfig: Record<string, { icon: string; label: string; color: string }> = {
  pending: { icon: "⏳", label: "Not Started", color: "#fbbf24" },
  submitted: { icon: "📤", label: "Submitted", color: "#a5b4fc" },
  approved: { icon: "✅", label: "Approved", color: "#34d399" },
  rejected: { icon: "🔄", label: "Needs Revision", color: "#f87171" },
  flagged: { icon: "🚩", label: "Flagged", color: "#fca5a5" },
};

export default function StudentTaskCard({ task }: { task: Task }) {
  const { updateTask, currentUser } = useAppStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [notes, setNotes] = useState(task.submission_notes || "");
  const [docUpdates, setDocUpdates] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = statusConfig[task.status] || statusConfig.pending;
  const canSubmit = task.status === "pending" || task.status === "rejected";
  const canSend = Boolean(notes.trim() || docUpdates.trim() || stagedFiles.length > 0 || uploadedFiles.length > 0) && !isSubmitting;
  const totalFiles = stagedFiles.length + uploadedFiles.length;

  const validateFile = useCallback((file: File): string | null => {
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) return `"${file.name}" — type not supported`;
    if (file.size > MAX_FILE_SIZE) return `"${file.name}" exceeds 10 MB`;
    return null;
  }, []);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    setUploadError("");
    const newFiles: StagedFile[] = [];
    const existing = stagedFiles.length + uploadedFiles.length;
    for (const file of Array.from(fileList)) {
      if (existing + newFiles.length >= 5) { setUploadError("Maximum 5 files per task"); break; }
      const err = validateFile(file);
      if (err) { setUploadError(err); continue; }
      newFiles.push({ file, id: crypto.randomUUID() });
    }
    if (newFiles.length > 0) setStagedFiles((prev) => [...prev, ...newFiles]);
  }, [stagedFiles, uploadedFiles, validateFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragActive(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleSubmit = async () => {
    if (!canSend) return;
    setIsSubmitting(true);
    setUploadError("");
    try {
      let allUploaded = [...uploadedFiles];
      if (stagedFiles.length > 0) {
        setIsUploading(true);
        const formData = new FormData();
        stagedFiles.forEach((sf) => formData.append("files", sf.file));
        try {
          const result = await apiUpload(`/tasks/${task.id}/upload`, formData);
          allUploaded = [...allUploaded, ...result.files];
          setUploadedFiles(allUploaded);
          setStagedFiles([]);
        } catch (err) {
          setUploadError(err instanceof Error ? err.message : "Upload failed");
          return;
        } finally { setIsUploading(false); }
      }
      let fullNotes = notes.trim();
      if (allUploaded.length > 0) {
        const refs = allUploaded.map((f) => `• ${f.name} | ${f.type} | ${f.url}`).join("\n");
        fullNotes += fullNotes ? `\n\n--- Attached Documents ---\n${refs}` : `--- Attached Documents ---\n${refs}`;
      }
      const data = await apiFetch<{ task: Task }>(`/tasks/${task.id}/submit`, {
        method: "PATCH",
        body: JSON.stringify({ submission_notes: fullNotes, documentation_updates: docUpdates.trim() }),
      });
      updateTask(task.id, data.task);
      setIsExpanded(false);
      setDocUpdates("");
      setStagedFiles([]);
      setUploadedFiles([]);
    } catch (err) {
      console.error("Submit failed:", err);
    } finally { setIsSubmitting(false); }
  };

  const handleProgressUpdate = async (newProgress: number) => {
    try {
      const data = await apiFetch<{ task: Task }>(`/tasks/${task.id}/progress`, {
        method: "PATCH",
        body: JSON.stringify({ progress: newProgress }),
      });
      updateTask(task.id, data.task);
    } catch (err) {
      console.error("Progress update failed:", err);
    }
  };

  return (
    <motion.div layout className="apple-subtask-card overflow-hidden">
      {/* Main Row */}
      <div
        className="flex items-center gap-3.5 p-4.5"
        onClick={() => canSubmit && setIsExpanded(!isExpanded)}
        style={{ cursor: canSubmit ? "pointer" : "default" }}
      >
        <span className="text-xl shrink-0">{config.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-900 truncate">
            {task.title}
          </p>
          {task.description && (
            <p className="text-[10px] text-gray-400 mt-1 truncate">
              {task.description}
            </p>
          )}
        </div>
        <span className={`badge badge-${task.status} text-[9px] font-bold px-2 py-0.5 shrink-0`}>
          {config.label}
        </span>
        {canSubmit && (
          <motion.svg animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}
            width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" className="text-gray-400 shrink-0">
            <polyline points="6 9 12 15 18 9" />
          </motion.svg>
        )}
      </div>

      {/* Progress Slider Bar */}
      {task.status !== "approved" && (
        <div className="px-4.5 pb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-gray-400">Progress</span>
            <span className="text-[10px] font-bold text-gray-800">{task.progress}%</span>
          </div>
          <div className="progress-bar">
            <motion.div
              className="progress-bar-fill"
              initial={{ width: 0 }}
              animate={{ width: `${task.progress}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
          {canSubmit && (
            <input
              type="range" min="0" max="100" step="10"
              value={task.progress}
              onChange={(e) => handleProgressUpdate(Number(e.target.value))}
              className="w-full mt-2 accent-blue-600 h-1 cursor-ew-resize bg-gray-200 rounded-lg appearance-none"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}

      {/* Review Notes (shown when rejected) */}
      {task.review_notes && task.status === "rejected" && (
        <div className="mx-4.5 mb-3 p-3.5 rounded-xl bg-red-50 border border-red-100 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-wider text-red-500 mb-1">Feedback from Lead</p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{task.review_notes}</p>
        </div>
      )}

      {/* Approved Review Notes */}
      {task.review_notes && task.status === "approved" && (
        <div className="mx-4.5 mb-3 p-3.5 rounded-xl bg-green-50 border border-green-100 shadow-sm">
          <p className="text-[9px] font-bold uppercase tracking-wider text-green-600 mb-1">Approval Notes</p>
          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{task.review_notes}</p>
        </div>
      )}

      {/* Submission Notes (after submitted) */}
      {task.submission_notes && !canSubmit && (
        <div className="px-4.5 pb-4 border-t border-gray-100 bg-white">
          <p className="text-[9px] uppercase tracking-wider font-bold text-gray-400 mb-1.5 mt-3">Your Submission</p>
          <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{task.submission_notes}</p>
        </div>
      )}

      {/* Expandable Submission Form */}
      <AnimatePresence>
        {isExpanded && canSubmit && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
            <div className="px-4.5 pb-4.5 pt-1 border-t border-gray-100 bg-white space-y-3.5">
              <div>
                <label className="text-[10px] font-bold tracking-wider text-gray-400 uppercase mb-1.5 block">Submission Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Describe the updates, changes made, and what was completed..."
                  rows={3} className="apple-input w-full resize-none text-xs" />
              </div>

              <div>
                <label className="text-[10px] font-bold tracking-wider text-gray-400 uppercase mb-1.5 block">Documentation Updates</label>
                <textarea value={docUpdates} onChange={(e) => setDocUpdates(e.target.value)}
                  placeholder="Attach links, API endpoint updates, or detailed operational notes..."
                  rows={2} className="apple-input w-full resize-none text-xs" />
              </div>

              {/* Upload Zone */}
              <div>
                <label className="text-[10px] font-bold tracking-wider text-gray-400 uppercase mb-1.5 block">
                  Attach Evidence / Documents <span className="font-normal text-gray-400 text-[9px] lowercase">(up to 5 files, max 10MB each)</span>
                </label>
                <div
                  className={`upload-zone flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                    isDragActive 
                      ? "border-blue-500 bg-blue-50/50" 
                      : "border-gray-200 hover:border-gray-300 bg-gray-50/30"
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setIsDragActive(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragActive(false); }}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input ref={fileInputRef} type="file" multiple accept={ALLOWED_EXTENSIONS.join(",")}
                    className="hidden"
                    onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    className={isDragActive ? "text-blue-500" : "text-gray-400"}>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="text-[11px] font-semibold mt-1.5 text-gray-600">
                    {isDragActive ? "Drop your files here" : "Drag & drop files here, or click to browse"}
                  </p>
                </div>
              </div>

              {isUploading && (
                <div className="upload-progress-bar bg-gray-100 rounded-full h-1 relative overflow-hidden">
                  <motion.div className="upload-progress-fill bg-blue-500 h-full rounded-full" initial={{ width: "10%" }}
                    animate={{ width: "90%" }} transition={{ duration: 2 }} />
                </div>
              )}
              {uploadError && <p className="text-xs text-red-500">⚠️ {uploadError}</p>}

              {totalFiles > 0 && (
                <div className="file-chip-list flex flex-wrap gap-2">
                  {stagedFiles.map((sf) => (
                    <span key={sf.id} className="file-chip bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-[10px] font-medium border border-gray-200 flex items-center gap-1.5">
                      <span>{fileIcon(sf.file.type)}</span>
                      <span className="file-chip-name max-w-[120px] truncate">{sf.file.name}</span>
                      <span className="text-gray-400 text-[9px]">{formatSize(sf.file.size)}</span>
                      <button className="text-gray-400 hover:text-red-500 ml-1" onClick={(e) => { e.stopPropagation(); setStagedFiles((p) => p.filter((f) => f.id !== sf.id)); }} type="button">✕</button>
                    </span>
                  ))}
                  {uploadedFiles.map((uf) => (
                    <span key={uf.url} className="file-chip bg-green-50 text-green-700 px-3 py-1 rounded-full text-[10px] font-medium border border-green-200 flex items-center gap-1.5">
                      <span>{fileIcon(uf.type)}</span>
                      <span className="file-chip-name max-w-[120px] truncate">{uf.name}</span>
                      <span className="text-green-500">✓</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setIsExpanded(false)} className="btn-ghost text-xs apple-button-pill" type="button">Cancel</button>
                <button onClick={handleSubmit} disabled={!canSend} className="apple-button-pill bg-blue-600 text-white text-xs px-4" type="button">
                  {isUploading ? "Uploading..." : isSubmitting ? "Submitting..." : `Submit for Review${totalFiles > 0 ? ` (${totalFiles})` : ""}`}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Comment Toggle */}
      <div className="px-4.5 pb-3">
        <button onClick={() => setShowComments(!showComments)} className="btn-ghost text-[10px] w-full text-gray-500 hover:text-gray-900 border-dashed" type="button">
          💬 {showComments ? "Hide Comments" : "Show Comments & Discussion"}
        </button>
      </div>

      <AnimatePresence>
        {showComments && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4.5 pb-4.5 border-t border-gray-100 bg-gray-50/20">
              <CommentThread taskId={task.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

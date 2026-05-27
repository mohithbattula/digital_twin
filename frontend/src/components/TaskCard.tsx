"use client";

import { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Task } from "@/stores/useAppStore";
import { useAppStore } from "@/stores/useAppStore";
import { apiFetch, apiUpload, type UploadedFile } from "@/lib/api";

interface StagedFile {
  file: File;
  id: string; // client-generated unique key for React list
}

interface TaskCardProps {
  task: Task;
}

/** Human-readable file size */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** File-type icon based on MIME */
function fileIcon(type: string): string {
  if (type.startsWith("image/")) return "🖼️";
  if (type.includes("pdf")) return "📄";
  if (type.includes("word") || type.includes("document")) return "📝";
  if (type.includes("sheet") || type.includes("csv")) return "📊";
  if (type.includes("presentation")) return "📽️";
  if (type.includes("text") || type.includes("markdown")) return "📃";
  return "📎";
}

const ALLOWED_EXTENSIONS = [
  ".pdf", ".doc", ".docx", ".xlsx", ".pptx",
  ".txt", ".md", ".csv", ".png", ".jpg", ".jpeg", ".webp",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function TaskCard({ task }: TaskCardProps) {
  const { updateTask, currentUser } = useAppStore();
  const [isExpanded, setIsExpanded] = useState(false);
  const [notes, setNotes] = useState(task.submission_notes || "");
  const [documentationUpdates, setDocumentationUpdates] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Staged files awaiting submission
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  // Files already uploaded via the API
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = task.status === "pending" && currentUser?.role === "team_member";
  const canSendSubmission =
    Boolean(notes.trim() || documentationUpdates.trim() || stagedFiles.length > 0 || uploadedFiles.length > 0) && !isSubmitting;

  // ── File validation ──
  const validateFile = useCallback((file: File): string | null => {
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `"${file.name}" — type not supported`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" exceeds 10 MB`;
    }
    return null;
  }, []);

  // ── Add files from input or drop ──
  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      setUploadError("");
      const newFiles: StagedFile[] = [];
      const existing = stagedFiles.length + uploadedFiles.length;

      for (const file of Array.from(fileList)) {
        if (existing + newFiles.length >= 5) {
          setUploadError("Maximum 5 files per task");
          break;
        }
        const err = validateFile(file);
        if (err) {
          setUploadError(err);
          continue;
        }
        newFiles.push({ file, id: crypto.randomUUID() });
      }

      if (newFiles.length > 0) {
        setStagedFiles((prev) => [...prev, ...newFiles]);
      }
    },
    [stagedFiles, uploadedFiles, validateFile]
  );

  // ── Drag-and-drop handlers ──
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (e.dataTransfer.files.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        addFiles(e.target.files);
      }
      // Reset input so re-selecting the same file works
      e.target.value = "";
    },
    [addFiles]
  );

  const removeStaged = useCallback((id: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.id !== id));
    setUploadError("");
  }, []);

  const removeUploaded = useCallback((url: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.url !== url));
    setUploadError("");
  }, []);

  // ── Upload staged files then submit task ──
  const handleSubmit = async () => {
    if (!canSendSubmission) return;

    setIsSubmitting(true);
    setUploadError("");

    try {
      let allUploaded = [...uploadedFiles];

      // Upload any staged files first
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
        } finally {
          setIsUploading(false);
        }
      }

      // Build notes that reference uploaded docs
      let fullNotes = notes.trim();
      if (allUploaded.length > 0) {
        const fileRefs = allUploaded
          .map((f) => `• ${f.name} | ${f.type} | ${f.url}`)
          .join("\n");
        fullNotes += fullNotes
          ? `\n\n--- Attached Documents ---\n${fileRefs}`
          : `--- Attached Documents ---\n${fileRefs}`;
      }

      const data = await apiFetch<{ task: Task }>(`/tasks/${task.id}/submit`, {
        method: "PATCH",
        body: JSON.stringify({
          submission_notes: fullNotes,
          documentation_updates: documentationUpdates.trim(),
        }),
      });

      updateTask(task.id, data.task);
      setIsExpanded(false);
      setDocumentationUpdates("");
      setStagedFiles([]);
      setUploadedFiles([]);
    } catch (err) {
      console.error("Submit failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusIcon: Record<string, string> = {
    pending: "⏳",
    submitted: "📤",
    approved: "✅",
    rejected: "❌",
    flagged: "🚩",
  };

  const totalFiles = stagedFiles.length + uploadedFiles.length;

  return (
    <motion.div
      layout
      className="glass-card overflow-hidden"
      style={{ cursor: canSubmit ? "pointer" : "default" }}
    >
      {/* Task Row */}
      <div
        className="flex items-center gap-3 p-3.5"
        onClick={() => canSubmit && setIsExpanded(!isExpanded)}
      >
        <span className="text-base">{statusIcon[task.status] || "📋"}</span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {task.title}
          </p>
          {task.description && (
            <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
              {task.description}
            </p>
          )}
        </div>

        <span className={`badge badge-${task.status}`}>
          {task.status}
        </span>

        {canSubmit && (
          <motion.svg
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ color: "var(--text-muted)", flexShrink: 0 }}
          >
            <polyline points="6 9 12 15 18 9" />
          </motion.svg>
        )}
      </div>

      {/* Expandable Submission Form */}
      <AnimatePresence>
        {isExpanded && canSubmit && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div
              className="px-3.5 pb-3.5 pt-1 border-t"
              style={{ borderColor: "var(--glass-border)" }}
            >
              <label
                className="text-xs font-medium mb-1.5 block"
                style={{ color: "var(--text-secondary)" }}
              >
                Submission Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe what you completed..."
                rows={3}
                className="glass-input resize-none text-xs mb-2"
                id={`task-notes-${task.id}`}
              />
              <label
                className="text-xs font-medium mb-1.5 block"
                style={{ color: "var(--text-secondary)" }}
              >
                Documentation Updates
              </label>
              <textarea
                value={documentationUpdates}
                onChange={(e) => setDocumentationUpdates(e.target.value)}
                placeholder="Add docs changed, links updated, API notes, test evidence, or decisions the twin should read..."
                rows={3}
                className="glass-input resize-none text-xs mb-2"
                id={`task-docs-${task.id}`}
              />

              {/* ── Document Upload Zone ── */}
              <label
                className="text-xs font-medium mb-1.5 block"
                style={{ color: "var(--text-secondary)" }}
              >
                Attach Documents for Review
                <span className="ml-1.5" style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                  (max 5 files, 10 MB each)
                </span>
              </label>

              <div
                className={`upload-zone mb-2 ${isDragActive ? "drag-active" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                id={`task-upload-zone-${task.id}`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ALLOWED_EXTENSIONS.join(",")}
                  onChange={handleFileInput}
                  tabIndex={-1}
                />

                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: isDragActive ? "var(--accent-primary)" : "var(--text-muted)" }}
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>

                <p className="text-xs" style={{ color: isDragActive ? "var(--accent-primary)" : "var(--text-muted)" }}>
                  {isDragActive ? "Drop files here" : "Drag & drop or click to browse"}
                </p>
                <p className="text-[10px]" style={{ color: "var(--text-muted)", opacity: 0.7 }}>
                  PDF, DOCX, XLSX, PPTX, TXT, MD, CSV, PNG, JPG
                </p>
              </div>

              {/* Uploading progress indicator */}
              {isUploading && (
                <div className="upload-progress-bar mb-2">
                  <motion.div
                    className="upload-progress-fill"
                    initial={{ width: "10%" }}
                    animate={{ width: "90%" }}
                    transition={{ duration: 2, ease: "easeInOut" }}
                  />
                </div>
              )}

              {/* Upload error */}
              {uploadError && (
                <p className="text-xs mb-2" style={{ color: "#f87171" }}>
                  ⚠️ {uploadError}
                </p>
              )}

              {/* Staged + Uploaded file chips */}
              {totalFiles > 0 && (
                <div className="file-chip-list mb-2">
                  {stagedFiles.map((sf) => (
                    <span key={sf.id} className="file-chip">
                      <span>{fileIcon(sf.file.type)}</span>
                      <span className="file-chip-name" title={sf.file.name}>
                        {sf.file.name}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontSize: 10 }}>
                        {formatSize(sf.file.size)}
                      </span>
                      <button
                        className="file-chip-remove"
                        onClick={(e) => { e.stopPropagation(); removeStaged(sf.id); }}
                        title="Remove file"
                        type="button"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                  {uploadedFiles.map((uf) => (
                    <span key={uf.url} className="file-chip" style={{ borderColor: "rgba(16, 185, 129, 0.3)", background: "rgba(16, 185, 129, 0.1)" }}>
                      <span>{fileIcon(uf.type)}</span>
                      <span className="file-chip-name" title={uf.name}>
                        {uf.name}
                      </span>
                      <span style={{ color: "#34d399", fontSize: 10 }}>✓</span>
                      <button
                        className="file-chip-remove"
                        onClick={(e) => { e.stopPropagation(); removeUploaded(uf.url); }}
                        title="Remove file"
                        type="button"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setIsExpanded(false)}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: "var(--text-muted)" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSendSubmission}
                  className="btn-accent text-xs"
                  style={{ padding: "6px 16px" }}
                  id={`task-submit-${task.id}`}
                >
                  {isUploading
                    ? "Uploading..."
                    : isSubmitting
                      ? "Submitting..."
                      : `Submit for Review${totalFiles > 0 ? ` (${totalFiles} file${totalFiles > 1 ? "s" : ""})` : ""}`}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Show submission notes for non-pending tasks */}
      {task.submission_notes && task.status !== "pending" && (
        <div
          className="px-3.5 pb-3 pt-1 border-t"
          style={{ borderColor: "var(--glass-border)" }}
        >
          <p className="text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-muted)" }}>
            Submission and docs
          </p>
          <p className="text-xs whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
            {task.submission_notes}
          </p>
        </div>
      )}
    </motion.div>
  );
}

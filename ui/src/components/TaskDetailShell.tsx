import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  API_BASE_URL,
  deleteTaskAttachment,
  getFederationConnections,
  getTaskFederation,
  patchTask,
  shareTask,
  unshareTask,
  uploadTaskAttachment,
} from "../api";
import { isUserAgent } from "../constants";
import { TASK_COLUMNS } from "../lib/status";
import type { Agent, FederationConnection, FederationTaskInfo, Task, TaskAttachment, TaskComment } from "../types";
import type { Activity } from "../types";
import { McButton, McModal, McPanel, McPill, McSectionTitle, McSelect, McTextarea } from "./mc";

type GitHubPayload = { pr_url?: string; branch?: string; status?: string };

type PillVariant = "success" | "warning" | "error" | "info" | "ghost" | "primary";

const PRIORITY_VARIANT: Record<string, PillVariant> = {
  low: "ghost",
  medium: "warning",
  high: "error",
  urgent: "error",
};

const STATUS_VARIANT: Record<string, PillVariant> = {
  inbox: "ghost",
  assigned: "info",
  in_progress: "primary",
  review: "warning",
  done: "success",
  blocked: "error",
  dismissed: "ghost",
};

type Props = {
  task: Task | null;
  comments: TaskComment[];
  taskActivities: Activity[];
  attachments: TaskAttachment[];
  agents: Agent[];
  onTaskUpdated: (task: Task) => void;
  onSubmitComment: (body: string) => Promise<void>;
  onSubmitCommentWithFile: (body: string, file: File) => Promise<void>;
  onAttachmentChange: () => void;
  onDelete?: () => Promise<void>;
};

type TimelineEntry =
  | { kind: "activity"; data: Activity; created_at: string }
  | { kind: "comment"; data: TaskComment; created_at: string };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function commentAttachmentUrl(taskId: string, attachment: TaskComment["attachment_json"]): string {
  if (!attachment) return "";
  const pathParts = attachment.path.split("/");
  const filename = pathParts[pathParts.length - 1];
  return `${API_BASE_URL}/api/attachments/${taskId}/${encodeURIComponent(filename)}`;
}

function taskAttachmentUrl(taskId: string, storedFilename: string): string {
  return `${API_BASE_URL}/api/attachments/${taskId}/${encodeURIComponent(storedFilename)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const controlLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  whiteSpace: "nowrap",
};

export default function TaskDetailShell({
  task,
  comments,
  taskActivities,
  attachments,
  agents,
  onTaskUpdated,
  onSubmitComment,
  onSubmitCommentWithFile,
  onAttachmentChange,
  onDelete
}: Props) {
  const [commentBody, setCommentBody] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [savingComment, setSavingComment] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachFileInputRef = useRef<HTMLInputElement>(null);

  // Federation state
  const [fedInfo, setFedInfo] = useState<FederationTaskInfo | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareConnections, setShareConnections] = useState<FederationConnection[]>([]);
  const [selectedConnId, setSelectedConnId] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  // Inline editing state
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const summaryInputRef = useRef<HTMLTextAreaElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);
  useEffect(() => {
    if (editingSummary) summaryInputRef.current?.focus();
  }, [editingSummary]);

  // Reset editing state when task changes
  useEffect(() => {
    setEditingTitle(false);
    setEditingSummary(false);
    setConfirmDelete(false);
    setSelectedFile(null);
    setFedInfo(null);
    setShowShareModal(false);
  }, [task?.id]);

  // Fetch federation info when task is selected
  useEffect(() => {
    if (!task) return;
    getTaskFederation(task.id)
      .then(setFedInfo)
      .catch(() => setFedInfo(null));
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps


  // Merged timeline: activities + comments sorted by created_at
  const timeline = useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [
      ...taskActivities.map((a): TimelineEntry => ({ kind: "activity", data: a, created_at: a.created_at })),
      ...comments.map((c): TimelineEntry => ({ kind: "comment", data: c, created_at: c.created_at })),
    ];
    entries.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    return entries;
  }, [taskActivities, comments]);

  const agentLabel = (id: string | null) => {
    if (!id) return "unassigned";
    const a = agents.find((ag) => ag.id === id);
    return a ? `${a.emoji || ""} ${a.name}`.trim() : id;
  };

  const saveTitle = async () => {
    if (!task || !editTitle.trim() || editTitle.trim() === task.title) {
      setEditingTitle(false);
      return;
    }
    const updated = await patchTask(task.id, { title: editTitle.trim() });
    onTaskUpdated(updated);
    setEditingTitle(false);
  };

  const saveSummary = async () => {
    if (!task || editSummary.trim() === (task.summary ?? "")) {
      setEditingSummary(false);
      return;
    }
    const updated = await patchTask(task.id, { summary: editSummary.trim() });
    onTaskUpdated(updated);
    setEditingSummary(false);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!task || newStatus === task.status) return;
    const updated = await patchTask(task.id, { status: newStatus });
    onTaskUpdated(updated);
  };

  const handlePriorityChange = async (newPriority: string) => {
    if (!task || newPriority === task.priority) return;
    const updated = await patchTask(task.id, { priority: newPriority });
    onTaskUpdated(updated);
  };

  const handleAssigneeChange = async (newAssignee: string) => {
    if (!task) return;
    const updated = await patchTask(task.id, { assignee_agent_id: newAssignee || null });
    onTaskUpdated(updated);
  };

  const handleReviewerChange = async (newReviewer: string) => {
    if (!task) return;
    const updated = await patchTask(task.id, { reviewer_agent_id: newReviewer || null });
    onTaskUpdated(updated);
  };


  const openShareModal = async () => {
    setShareError(null);
    setSelectedConnId("");
    try {
      const conns = await getFederationConnections();
      setShareConnections(conns.filter((c) => c.status === "active"));
    } catch {
      setShareConnections([]);
    }
    setShowShareModal(true);
  };

  const handleShare = async () => {
    if (!task || !selectedConnId) return;
    setSharing(true);
    setShareError(null);
    try {
      const info = await shareTask(task.id, selectedConnId);
      setFedInfo(info);
      setShowShareModal(false);
    } catch (err: unknown) {
      setShareError((err as Error).message);
    } finally {
      setSharing(false);
    }
  };

  const handleUnshare = async (connectionId: string) => {
    if (!task) return;
    try {
      await unshareTask(task.id, connectionId);
      const info = await getTaskFederation(task.id);
      setFedInfo(info);
    } catch {
      // Ignore
    }
  };

  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    if (!commentBody.trim() && !selectedFile) return;
    setSavingComment(true);
    try {
      if (selectedFile) {
        await onSubmitCommentWithFile(commentBody.trim(), selectedFile);
      } else {
        await onSubmitComment(commentBody.trim());
      }
      setCommentBody("");
      setSelectedFile(null);
    } finally {
      setSavingComment(false);
    }
  };

  const handleAttachUpload = async (file: File) => {
    if (!task) return;
    setUploading(true);
    try {
      await uploadTaskAttachment(task.id, file);
      onAttachmentChange();
    } finally {
      setUploading(false);
      if (attachFileInputRef.current) attachFileInputRef.current.value = "";
    }
  };

  const handleAttachDelete = async (attachmentId: string) => {
    if (!task) return;
    await deleteTaskAttachment(task.id, attachmentId);
    onAttachmentChange();
  };

  if (!task) {
    return (
      <McPanel padding="md">
        <McSectionTitle>Task Detail</McSectionTitle>
        <p className="mc-text-faint" style={{ fontSize: "13px", marginTop: "8px" }}>
          Select a task to view details.
        </p>
      </McPanel>
    );
  }

  return (
    <McPanel padding="none">
      {/* Header */}
      <div className="mc-border-bottom" style={{ padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <McPill variant={PRIORITY_VARIANT[task.priority] || "ghost"} size="sm">
            {task.priority}
          </McPill>
          <McPill variant={STATUS_VARIANT[task.status] || "ghost"} size="sm">
            {task.status.replace("_", " ")}
          </McPill>
          {fedInfo?.is_shared && fedInfo.connections.map((fc) => (
            <McPill
              key={fc.connection_id}
              variant={fedInfo.direction === "outbound" ? "cyan" : "purple"}
              size="sm"
            >
              {fedInfo.direction === "outbound" ? "\u2197" : "\u2199"} {fc.connection_name}
            </McPill>
          ))}
        </div>

        {/* Inline-editable title */}
        {editingTitle ? (
          <input
            ref={titleInputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveTitle();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            className="mc-text-primary mc-bg-2 mc-rounded-input"
            style={{
              width: "100%",
              fontSize: "16px",
              fontWeight: 700,
              border: "1px solid var(--mc-indigo)",
              padding: "6px 10px",
              outline: "none",
            }}
          />
        ) : (
          <p
            className="mc-text-primary mc-hover-text-indigo"
            onClick={() => { setEditTitle(task.title); setEditingTitle(true); }}
            style={{
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: "4px",
            }}
          >
            {task.title}
          </p>
        )}

        <div className="mc-text-faint" style={{ fontSize: "11px" }}>
          Created {timeAgo(task.created_at)} · Assigned to {agentLabel(task.assignee_agent_id)}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* Summary */}
        <div>
          <McSectionTitle>Summary</McSectionTitle>
          {editingSummary ? (
            <McTextarea
              ref={summaryInputRef}
              mcSize="sm"
              rows={3}
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              onBlur={() => void saveSummary()}
              onKeyDown={(e) => {
                if (e.key === "Escape") setEditingSummary(false);
              }}
            />
          ) : (
            <p
              className="mc-text-muted mc-hover-text-body"
              onClick={() => { setEditSummary(task.summary ?? ""); setEditingSummary(true); }}
              style={{
                fontSize: "12px",
                lineHeight: 1.6,
                cursor: "pointer",
              }}
            >
              {task.summary || (
                <span className="mc-text-ghost" style={{ fontStyle: "italic" }}>Add description...</span>
              )}
            </p>
          )}
        </div>

        {/* Attachments */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span className="mc-section-label">
              Attachments
            </span>
            <div>
              <input
                ref={attachFileInputRef}
                type="file"
                style={{ display: "none" }}
                accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.md,.csv,.json,.yaml,.yml,.zip"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleAttachUpload(file);
                }}
              />
              <McButton
                variant="ghost"
                size="xs"
                disabled={uploading}
                onClick={() => attachFileInputRef.current?.click()}
              >
                {uploading ? "Uploading..." : "\uD83D\uDCCE Add"}
              </McButton>
            </div>
          </div>
          {attachments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {attachments.map((att) => (
                <div key={att.id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {att.content_type.startsWith("image/") && (
                    <a href={taskAttachmentUrl(task.id, att.stored_filename)} target="_blank" rel="noopener noreferrer">
                      <img
                        src={taskAttachmentUrl(task.id, att.stored_filename)}
                        alt={att.filename}
                        className="mc-rounded-input mc-border"
                        style={{ maxWidth: "150px" }}
                      />
                    </a>
                  )}
                  <a
                    href={taskAttachmentUrl(task.id, att.stored_filename)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mc-text-blue"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "12px",
                      textDecoration: "none",
                    }}
                  >
                    {"\uD83D\uDCCE"} {att.filename}
                    <span className="mc-text-faint">({formatSize(att.size_bytes)})</span>
                  </a>
                  <button
                    type="button"
                    className="mc-text-ghost mc-hover-text-red"
                    onClick={() => void handleAttachDelete(att.id)}
                    style={{
                      fontSize: "12px",
                      cursor: "pointer",
                      marginLeft: "auto",
                      background: "none",
                      border: "none",
                    }}
                  >
                    {"\u2715"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Details / Controls */}
        <div>
          <McSectionTitle>Details</McSectionTitle>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "7rem 1fr",
              gap: "8px 12px",
              alignItems: "center",
            }}
          >
            <span className="mc-text-faint" style={controlLabelStyle}>Status</span>
            <McSelect
              value={task.status}
              onChange={(e) => void handleStatusChange(e.target.value)}
            >
              {TASK_COLUMNS.map((col) => (
                <option key={col.key} value={col.key}>{col.label}</option>
              ))}
            </McSelect>

            <span className="mc-text-faint" style={controlLabelStyle}>Priority</span>
            <McSelect
              value={task.priority}
              onChange={(e) => void handlePriorityChange(e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </McSelect>

            <span className="mc-text-faint" style={controlLabelStyle}>Assigned Agent</span>
            <McSelect
              value={task.assignee_agent_id ?? ""}
              onChange={(e) => void handleAssigneeChange(e.target.value)}
            >
              <option value="">Unassigned</option>
              {agents.filter(isUserAgent).map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </McSelect>

            <span className="mc-text-faint" style={controlLabelStyle}>Reviewed by</span>
            <McSelect
              value={task.reviewer_agent_id ?? ""}
              onChange={(e) => void handleReviewerChange(e.target.value)}
            >
              <option value="">No reviewer</option>
              {agents.filter(isUserAgent).map((agent) => (
                <option key={agent.id} value={agent.id}>{agent.name}</option>
              ))}
            </McSelect>


          </div>

          {/* GitHub info */}
          {!!task.payload_json?.github && (
            <div
              className="mc-border mc-rounded-input"
              style={{
                marginTop: "12px",
                padding: "10px",
                background: "rgba(0, 0, 0, 0.15)",
              }}
            >
              <span className="mc-section-label" style={{ display: "block", marginBottom: "6px" }}>
                GitHub
              </span>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {(task.payload_json.github as GitHubPayload).pr_url &&
                  /^https?:\/\//i.test((task.payload_json.github as GitHubPayload).pr_url!) && (
                  <a
                    href={(task.payload_json.github as GitHubPayload).pr_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mc-text-blue"
                    style={{ textDecoration: "none" }}
                  >
                    PR: {(task.payload_json.github as GitHubPayload).pr_url}
                  </a>
                )}
                {(task.payload_json.github as GitHubPayload).branch && (
                  <p className="mc-text-muted">
                    Branch: {(task.payload_json.github as GitHubPayload).branch}
                  </p>
                )}
                {(task.payload_json.github as GitHubPayload).status && (
                  <McPill variant="ghost" size="xs">
                    {(task.payload_json.github as GitHubPayload).status}
                  </McPill>
                )}
              </div>
            </div>
          )}

          {/* Collaboration info */}
          {fedInfo?.is_shared && (
            <div
              className="mc-border mc-rounded-input"
              style={{
                marginTop: "12px",
                padding: "10px",
                background: "rgba(0, 0, 0, 0.15)",
              }}
            >
              <span className="mc-section-label" style={{ display: "block", marginBottom: "6px" }}>
                Shared With
              </span>
              <div style={{ fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                {fedInfo.connections.map((fc) => (
                  <div key={fc.connection_id} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <McPill variant={fedInfo.direction === "outbound" ? "cyan" : "purple"} size="xs">
                      {fedInfo.direction === "outbound" ? "outbound" : "inbound"}
                    </McPill>
                    <span className="mc-text-body">{fc.connection_name}</span>
                    {fc.last_synced_at && (
                      <span className="mc-text-ghost" style={{ fontSize: "10px" }}>
                        synced {timeAgo(fc.last_synced_at)}
                      </span>
                    )}
                    {fedInfo.direction === "outbound" && (
                      <button
                        type="button"
                        className="mc-ghost-btn mc-text-red"
                        onClick={() => void handleUnshare(fc.connection_id)}
                        style={{ marginLeft: "auto", fontSize: "11px" }}
                      >
                        Unshare
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              className="mc-ghost-btn mc-text-cyan"
              onClick={() => void openShareModal()}
            >
              {"\u2197"} Share
            </button>
            {task.status !== "done" ? (
              <button
                type="button"
                className="mc-ghost-btn mc-text-orange"
                onClick={() => void handleStatusChange("done")}
              >
                {"\u23F9"} Stop
              </button>
            ) : (
              <button
                type="button"
                className="mc-ghost-btn mc-text-green"
                onClick={() => void handleStatusChange("in_progress")}
              >
                {"\u25B6"} Restart
              </button>
            )}
            {onDelete && (
              confirmDelete ? (
                <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  <McButton
                    variant="error"
                    size="xs"
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true);
                      try { await onDelete(); } finally { setDeleting(false); setConfirmDelete(false); }
                    }}
                  >
                    {deleting ? "Deleting..." : "Confirm"}
                  </McButton>
                  <McButton variant="ghost" size="xs" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </McButton>
                </span>
              ) : (
                <button
                  type="button"
                  className="mc-ghost-btn mc-text-red"
                  onClick={() => setConfirmDelete(true)}
                >
                  {"\uD83D\uDDD1\uFE0F"} Delete
                </button>
              )
            )}
          </div>
        </div>

        {/* Timeline */}
        <div>
          <McSectionTitle>Timeline</McSectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {timeline.map((entry) =>
              entry.kind === "comment" ? (
                <div
                  key={`c-${entry.data.id}`}
                  style={{
                    padding: "10px",
                    background: "rgba(96, 165, 250, 0.06)",
                    borderRadius: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span className="mc-text-blue" style={{ fontSize: "11px", fontWeight: 600 }}>
                      {entry.data.author_id}
                    </span>
                    <span
                      className="mc-text-ghost"
                      style={{ fontSize: "10px" }}
                      title={new Date(entry.created_at).toLocaleString()}
                    >
                      {timeAgo(entry.created_at)}
                    </span>
                  </div>
                  {entry.data.body && (
                    <p className="mc-text-body" style={{ fontSize: "12px", lineHeight: 1.5 }}>
                      {entry.data.body}
                    </p>
                  )}
                  {entry.data.attachment_json && (
                    <div style={{ marginTop: "6px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                      {entry.data.attachment_json.content_type.startsWith("image/") && (
                        <a
                          href={commentAttachmentUrl(task.id, entry.data.attachment_json)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <img
                            src={commentAttachmentUrl(task.id, entry.data.attachment_json)}
                            alt={entry.data.attachment_json.filename}
                            className="mc-rounded-input mc-border"
                            style={{ maxWidth: "200px" }}
                          />
                        </a>
                      )}
                      <a
                        href={commentAttachmentUrl(task.id, entry.data.attachment_json)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mc-text-blue"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          fontSize: "12px",
                          textDecoration: "none",
                        }}
                      >
                        {"\uD83D\uDCCE"} {entry.data.attachment_json.filename}
                        <span className="mc-text-faint">
                          ({formatSize(entry.data.attachment_json.size_bytes)})
                        </span>
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  key={`a-${entry.data.id}`}
                  style={{
                    padding: "10px",
                    background: "rgba(0, 0, 0, 0.15)",
                    borderRadius: "10px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                    <span
                      className="mc-text-faint"
                      style={{
                        fontSize: "10px",
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {entry.data.activity_type}
                    </span>
                    <span
                      className="mc-text-ghost"
                      style={{ fontSize: "10px" }}
                      title={new Date(entry.created_at).toLocaleString()}
                    >
                      {timeAgo(entry.created_at)}
                    </span>
                  </div>
                  <p className="mc-text-body" style={{ fontSize: "12px", marginBottom: "4px" }}>
                    {entry.data.summary}
                  </p>
                  {Array.isArray(entry.data.detail_json?.changes) && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      {(entry.data.detail_json.changes as Array<{field: string; from: string; to: string}>).map((ch, i) => (
                        <span key={i} style={{ fontSize: "11px" }}>
                          <span className="mc-text-faint">{ch.field}:</span>{" "}
                          {ch.from && (
                            <>
                              <span style={{ textDecoration: "line-through", opacity: 0.4 }}>{ch.from}</span>
                              {" \u2192 "}
                            </>
                          )}
                          <span className="mc-text-body">{ch.to}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
            {!timeline.length && (
              <p className="mc-text-faint" style={{ fontSize: "12px" }}>No activity yet.</p>
            )}
          </div>
        </div>

        {/* Comment form */}
        <form onSubmit={submitComment}>
          {selectedFile && (
            <div style={{ marginBottom: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
              <McPill variant="ghost" size="sm">
                {"\uD83D\uDCCE"} {selectedFile.name}
              </McPill>
              <button
                type="button"
                className="mc-text-ghost mc-hover-text-red"
                onClick={() => { setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                  background: "none",
                  border: "none",
                }}
              >
                {"\u2715"}
              </button>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ flex: 1 }}>
              <McTextarea
                mcSize="sm"
                rows={1}
                placeholder="Add a comment..."
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
              />
            </div>
            <McButton type="submit" size="sm" disabled={savingComment}>
              {savingComment ? "..." : "Post"}
            </McButton>
            <input
              ref={fileInputRef}
              type="file"
              style={{ display: "none" }}
              accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.md,.csv,.json,.yaml,.yml,.zip"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setSelectedFile(file);
              }}
            />
            <McButton type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              {"\uD83D\uDCCE"}
            </McButton>
          </div>
        </form>
      </div>

      {/* Share modal */}
      <McModal
        open={showShareModal}
        onClose={() => setShowShareModal(false)}
        title="Share Task"
        actions={
          <>
            <McButton variant="ghost" onClick={() => setShowShareModal(false)} disabled={sharing}>
              Cancel
            </McButton>
            <McButton onClick={() => void handleShare()} disabled={sharing || !selectedConnId}>
              {sharing ? "Sharing..." : "Share"}
            </McButton>
          </>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div>
            <label
              className="mc-text-muted"
              style={{ fontSize: "12px", fontWeight: 600, marginBottom: "6px", display: "block" }}
            >
              Connection
            </label>
            {shareConnections.length === 0 ? (
              <p className="mc-text-faint" style={{ fontSize: "12px" }}>
                No active connections. Set up collaboration first.
              </p>
            ) : (
              <McSelect
                value={selectedConnId}
                onChange={(e) => setSelectedConnId(e.target.value)}
              >
                <option value="">Select a connection...</option>
                {shareConnections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.endpoint})</option>
                ))}
              </McSelect>
            )}
          </div>
          {shareError && (
            <p className="mc-text-red" style={{ fontSize: "12px" }}>{shareError}</p>
          )}
        </div>
      </McModal>
    </McPanel>
  );
}

import { useEffect, useRef, useState } from "react";

import { createTask, getBoards, getProjects, uploadTaskAttachment } from "../api";
import { isUserAgent } from "../constants";
import type { Agent, Board, Project, Task } from "../types";
import { McButton, McInput, McModal, McPill, McSelect, McTextarea } from "./mc";

type Prefill = {
  title?: string;
  priority?: string;
  assigneeAgentId?: string | null;
  sourceActivityId?: string;
  sourceActivityTitle?: string;
  sourceActivityAgentId?: string | null;
  sourceActivityTime?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
  agents: Agent[];
  prefill?: Prefill | null;
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  marginBottom: "6px",
};

export default function CreateTaskModal({ open, onClose, onCreated, agents, prefill }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [priority, setPriority] = useState("medium");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitLabel, setSubmitLabel] = useState("Create Task");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectBoards, setProjectBoards] = useState<Board[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedBoardId, setSelectedBoardId] = useState("");
  const [reviewer, setReviewer] = useState("");

  // Fetch projects list
  useEffect(() => {
    void getProjects().then(setProjects).catch(() => {});
  }, []);

  // Reset form when opening with new prefill
  useEffect(() => {
    if (open) {
      setTitle(prefill?.title ?? "");
      setDescription("");
      setAssignee(prefill?.assigneeAgentId ?? "");
      setPriority(prefill?.priority ?? "medium");
      setFiles([]);
      setSubmitting(false);
      setSubmitLabel("Create Task");
      setSelectedProjectId("");
      setSelectedBoardId("");
      setProjectBoards([]);
      setReviewer("");
    }
  }, [open, prefill]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      setSubmitLabel("Creating...");
      const task = await createTask({
        title: title.trim(),
        summary: description.trim(),
        type: "task",
        status: "inbox",
        priority,
        assignee_agent_id: assignee || null,
        worker_kind: assignee ? "openclaw_agent" : "human",
        payload_json: {},
        source_event_ids_json: prefill?.sourceActivityId
          ? { activity_log: [prefill.sourceActivityId] }
          : null,
        created_by: "user",
        project_id: selectedProjectId || null,
        board_id: selectedBoardId || null,
        reviewer_agent_id: reviewer || null,
      });

      if (files.length > 0) {
        setSubmitLabel("Uploading attachments...");
        for (const file of files) {
          await uploadTaskAttachment(task.id, file);
        }
      }

      onCreated(task);
      onClose();
    } finally {
      setSubmitting(false);
      setSubmitLabel("Create Task");
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <McModal
      open={open}
      onClose={onClose}
      title="Create Task"
      actions={
        <>
          <McButton variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </McButton>
          <McButton
            onClick={() => void handleSubmit()}
            disabled={submitting || !title.trim()}
          >
            {submitting ? submitLabel : "Create Task"}
          </McButton>
        </>
      }
    >
      <div className="space-y-3">
        {/* Linked Activity card */}
        {prefill?.sourceActivityId && (
          <div
            className="mc-rounded-inner mc-bg-2 mc-border"
            style={{ padding: "8px" }}
          >
            <div className="flex items-center gap-2 text-xs mc-text-muted">
              <span>{agents.find((a) => a.id === prefill.sourceActivityAgentId)?.emoji || "\u{1F4CB}"}</span>
              <McPill variant="ghost" size="xs">{prefill.sourceActivityAgentId || "unknown"}</McPill>
              {prefill.sourceActivityTime && (
                <span>{new Date(prefill.sourceActivityTime).toLocaleString("en-GB")}</span>
              )}
            </div>
            <p className="mt-1 text-sm truncate mc-text-body">
              {prefill.sourceActivityTitle}
            </p>
          </div>
        )}

        {/* Title */}
        <div>
          <label className="mc-text-muted" style={labelStyle}>Title</label>
          <McInput
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="mc-text-muted" style={labelStyle}>Description</label>
          <McTextarea
            className="h-28"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Instructions for the agent (optional)"
          />
        </div>

        {/* Attachments */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.md,.csv,.json,.yaml,.yml,.zip"
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? []);
              if (selected.length > 0) setFiles((prev) => [...prev, ...selected]);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
          />
          <McButton
            variant="ghost"
            size="xs"
            onClick={() => fileInputRef.current?.click()}
          >
            {"\uD83D\uDCCE"} Add attachments
          </McButton>
          {files.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {files.map((file, i) => (
                <McPill key={i} variant="ghost" size="sm">
                  {file.name}
                  <button
                    type="button"
                    className="mc-hover-text-red"
                    style={{ marginLeft: "4px", fontSize: "10px", fontWeight: 700, color: "inherit", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                    onClick={() => removeFile(i)}
                  >
                    {"\u2715"}
                  </button>
                </McPill>
              ))}
            </div>
          )}
        </div>

        {/* Assign to */}
        <div>
          <label className="mc-text-muted" style={labelStyle}>Assign to</label>
          <McSelect
            size="md"
            className="w-full"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">Unassigned</option>
            {agents.filter(isUserAgent).map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </McSelect>
        </div>

        {/* Reviewer */}
        <div>
          <label className="mc-text-muted" style={labelStyle}>Reviewer</label>
          <McSelect
            size="md"
            className="w-full"
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
          >
            <option value="">No reviewer</option>
            {agents.filter(isUserAgent).map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </McSelect>
        </div>

        {/* Priority */}
        <div>
          <label className="mc-text-muted" style={labelStyle}>Priority</label>
          <McSelect
            size="md"
            className="w-full"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </McSelect>
        </div>

        {/* Project */}
        <div>
          <label className="mc-text-muted" style={labelStyle}>Project</label>
          <McSelect
            size="md"
            className="w-full"
            value={selectedProjectId}
            onChange={(e) => {
              const pid = e.target.value;
              setSelectedProjectId(pid);
              setSelectedBoardId("");
              setProjectBoards([]);
              if (pid) { void getBoards(pid).then(setProjectBoards).catch(() => {}); }
            }}
          >
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </McSelect>
        </div>

        {/* Board (filtered by project) */}
        {selectedProjectId && (
          <div>
            <label className="mc-text-muted" style={labelStyle}>Board</label>
            <McSelect
              size="md"
              className="w-full"
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
            >
              <option value="">No board</option>
              {projectBoards.map(
                (b: Board) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                )
              )}
            </McSelect>
          </div>
        )}
      </div>
    </McModal>
  );
}

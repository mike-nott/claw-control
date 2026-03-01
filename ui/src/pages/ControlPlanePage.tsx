import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { isUserAgent } from "../constants";
import {
  createCommentWithAttachment,
  createTaskComment,
  deleteTask,
  getAgents,
  getBoards,
  getProjects,
  getTaskActivities,
  getTaskAttachments,
  getTask,
  getTaskComments,
  getTasks
} from "../api";
import CreateTaskModal from "../components/CreateTaskModal";
import KanbanBoard from "../components/KanbanBoard";
import TaskDetailShell from "../components/TaskDetailShell";
import { McButton, McFilterBar, McSelect } from "../components/mc";
import { upsertTask } from "../lib/status";
import { connectStream } from "../sse";
import type { Activity, Agent, Board, Project, StreamEvent, Task, TaskAttachment, TaskComment } from "../types";

function asTask(payload: Record<string, unknown>): Task | null {
  if (typeof payload.id !== "string" || typeof payload.status !== "string") {
    return null;
  }
  return payload as unknown as Task;
}

function asActivity(payload: Record<string, unknown>): Activity | null {
  if (typeof payload.id !== "string") {
    return null;
  }
  return payload as unknown as Activity;
}

const TIME_RANGES = [
  { key: "all", label: "All" },
  { key: "1h", label: "1h" },
  { key: "24h", label: "24h" },
  { key: "7d", label: "7d" },
  { key: "30d", label: "30d" },
];

export default function ControlPlanePage() {
  const { boardId } = useParams<{ boardId?: string }>();
  const [searchParams] = useSearchParams();
  const queryBoardId = searchParams.get("board_id");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [taskActivities, setTaskActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [filterRange, setFilterRange] = useState("all");
  const [filterProjectId, setFilterProjectId] = useState("");
  const [filterBoardId, setFilterBoardId] = useState(boardId ?? queryBoardId ?? "");
  const [projectBoards, setProjectBoards] = useState<Board[]>([]);

  // Fetch agents and projects once on mount
  useEffect(() => {
    void getAgents().then(setAgents).catch(() => {});
    void getProjects().then(setProjects).catch(() => {});
  }, []);

  // Sync board filter from route param or query param, and resolve parent project
  useEffect(() => {
    const bid = boardId ?? queryBoardId;
    if (!bid) return;
    setFilterBoardId(bid);
    // Find which project owns this board and pre-select it
    void (async () => {
      try {
        const allProjects = await getProjects();
        for (const p of allProjects) {
          const boards = await getBoards(p.id);
          const match = boards.find((b: Board) => b.id === bid);
          if (match) {
            setFilterProjectId(p.id);
            setProjectBoards(boards);
            break;
          }
        }
      } catch { /* ignore */ }
    })();
  }, [boardId, queryBoardId]);

  const refreshTaskDetail = async (taskId: string) => {
    const [freshTask, nextComments, nextAttachments, nextTaskActivities] = await Promise.all([
      getTask(taskId),
      getTaskComments(taskId),
      getTaskAttachments(taskId),
      getTaskActivities(taskId),
    ]);
    setActiveTask(freshTask);
    setComments(nextComments);
    setAttachments(nextAttachments);
    setTaskActivities(nextTaskActivities);
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    getTasks()
      .then((nextTasks) => {
        if (!mounted) return;
        setTasks(nextTasks);
      })
      .catch((err: Error) => {
        if (!mounted) return;
        setError(err.message);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeTask?.id) {
      setComments([]);
      setAttachments([]);
      setTaskActivities([]);
      return;
    }

    void refreshTaskDetail(activeTask.id).catch((err: Error) => setError(err.message));
  }, [activeTask?.id]);

  useEffect(() => {
    return connectStream({
      onEvent: (event: StreamEvent) => {
        if (event.type === "keepalive") return;

        if (event.type.startsWith("task.")) {
          const task = asTask(event.payload);
          if (task) {
            setTasks((prev) => upsertTask(prev, task));
            if (activeTask?.id === task.id) {
              setActiveTask(task);
            }
          }
        }

        if (event.type === "comment.created" && activeTask?.id && event.payload.task_id === activeTask.id) {
          void refreshTaskDetail(activeTask.id).catch(() => {});
        }

        if (event.type === "activity.created") {
          const activity = asActivity(event.payload);
          if (activity && activeTask?.id && activity.task_id === activeTask.id) {
            void refreshTaskDetail(activeTask.id).catch(() => {});
          }
        }
      },
      onError: (message) => setError(message)
    });
  }, [activeTask?.id]);

  const filteredTasks = useMemo(() => {
    const now = Date.now();
    const rangeMs: Record<string, number> = {
      "1h": 60 * 60 * 1000,
      "24h": 24 * 60 * 60 * 1000,
      "7d": 7 * 24 * 60 * 60 * 1000,
      "30d": 30 * 24 * 60 * 60 * 1000,
    };
    return tasks.filter((t) => {
      if (filterRange !== "all" && rangeMs[filterRange]) {
        if (now - new Date(t.created_at).getTime() > rangeMs[filterRange]) return false;
      }
      if (filterPriority && t.priority !== filterPriority) return false;
      if (filterAgent === "__unassigned__" && t.assignee_agent_id) return false;
      if (filterAgent && filterAgent !== "__unassigned__" && t.assignee_agent_id !== filterAgent) return false;
      if (filterBoardId) {
        // Board implies project — only check board when both are set
        if (t.board_id !== filterBoardId) return false;
      } else if (filterProjectId) {
        if (t.project_id !== filterProjectId) return false;
      }
      return true;
    });
  }, [tasks, filterRange, filterPriority, filterAgent, filterProjectId, filterBoardId]);

  const handleTaskCreated = (task: Task) => {
    setTasks((prev) => upsertTask(prev, task));
    setActiveTask(task);
    setShowCreateModal(false);
  };

  const handleTaskUpdated = (task: Task) => {
    setTasks((prev) => upsertTask(prev, task));
    setActiveTask(task);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {error && (
        <div className="mc-alert-warning">
          {error}
        </div>
      )}

      {/* Filter bar */}
      <McFilterBar>
        <McSelect value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}>
          <option value="">All agents</option>
          <option value="__unassigned__">Unassigned</option>
          {agents.filter(isUserAgent).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </McSelect>

        <McSelect value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="">All priorities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </McSelect>

        <McSelect
          value={filterProjectId}
          onChange={(e) => {
            const pid = e.target.value;
            setFilterProjectId(pid);
            setFilterBoardId("");
            setProjectBoards([]);
            if (pid) {
              void getBoards(pid).then(setProjectBoards).catch(() => {});
            }
          }}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </McSelect>

        {filterProjectId && (
          <McSelect value={filterBoardId} onChange={(e) => setFilterBoardId(e.target.value)}>
            <option value="">All boards</option>
            {projectBoards.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </McSelect>
        )}

        <div style={{ display: "flex", gap: "4px" }}>
          {TIME_RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilterRange(item.key)}
              className={`mc-tab-pill-bordered ${filterRange === item.key ? "active" : ""}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <McButton size="sm" onClick={() => setShowCreateModal(true)}>
          + New Task
        </McButton>
      </McFilterBar>

      {/* Kanban + Detail */}
      <div style={{ display: "flex", gap: "16px", minHeight: "calc(100vh - 160px)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {loading ? (
            <div className="mc-bg-1 mc-border mc-rounded-card mc-shadow mc-text-muted" style={{ padding: "24px", fontSize: "13px" }}>
              Loading tasks...
            </div>
          ) : (
            <KanbanBoard tasks={filteredTasks} agents={agents} activeTaskId={activeTask?.id ?? null} onSelectTask={setActiveTask} />
          )}
        </div>
        <div style={{ width: "380px", flexShrink: 0 }}>
          <TaskDetailShell
            task={activeTask}
            comments={comments}
            taskActivities={taskActivities}
            attachments={attachments}
            agents={agents}
            onTaskUpdated={handleTaskUpdated}
            onSubmitComment={async (body) => {
              if (!activeTask?.id) return;
              await createTaskComment(activeTask.id, {
                author_type: "human",
                author_id: "user",
                body
              });
              await refreshTaskDetail(activeTask.id);
            }}
            onSubmitCommentWithFile={async (body, file) => {
              if (!activeTask?.id) return;
              await createCommentWithAttachment(activeTask.id, body, file);
              await refreshTaskDetail(activeTask.id);
            }}
            onAttachmentChange={() => {
              if (activeTask?.id) void refreshTaskDetail(activeTask.id).catch(() => {});
            }}
            onDelete={async () => {
              if (!activeTask?.id) return;
              await deleteTask(activeTask.id);
              setActiveTask(null);
              setTasks((prev) => prev.filter((t) => t.id !== activeTask.id));
            }}
          />
        </div>
      </div>

      <CreateTaskModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleTaskCreated}
        agents={agents}
      />
    </div>
  );
}

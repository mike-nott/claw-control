import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  createProjectCredential,
  deleteProject,
  deleteProjectCredential,
  getProject,
  getProjectCredentials,
  getProjects,
  getTeams,
  updateProject,
  updateProjectCredential,
} from "../api";
import CreateBoardModal from "../components/CreateBoardModal";
import CreateProjectModal from "../components/CreateProjectModal";
import EditProjectModal from "../components/EditProjectModal";
import { McButton, McInput, McPanel, McPill, McSelect } from "../components/mc";
import type { Board, Project, ProjectCredential, ProjectStatus, Team } from "../types";

const STATUS_LABELS: Record<string, string> = {
  inbox: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

function TaskSummaryLine({ summary }: { summary?: Record<string, number> }) {
  if (!summary || Object.keys(summary).length === 0) {
    return <span className="mc-text-ghost" style={{ fontSize: "11px" }}>No tasks</span>;
  }
  const parts = Object.entries(summary)
    .filter(([, count]) => count > 0)
    .map(([status, count]) => `${count} ${STATUS_LABELS[status] || status}`);
  return (
    <span className="mc-text-faint" style={{ fontSize: "11px" }}>
      {parts.join(" \u00b7 ")}
    </span>
  );
}

type PillVariant = "success" | "warning" | "info" | "ghost";

const STATUS_VARIANT: Record<ProjectStatus, PillVariant> = {
  active: "success",
  paused: "warning",
  completed: "info",
  archived: "ghost",
};

const controlLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  whiteSpace: "nowrap",
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [projectBoards, setProjectBoards] = useState<Record<string, Board[]>>({});
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [boardModalProjectId, setBoardModalProjectId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamFilter, setTeamFilter] = useState<string>("");

  // Edit project
  const [editProject, setEditProject] = useState<Project | null>(null);

  // Credentials
  const [projectCredentials, setProjectCredentials] = useState<Record<string, ProjectCredential[]>>({});
  const [revealedCreds, setRevealedCreds] = useState<Set<string>>(new Set());
  const [addingCredFor, setAddingCredFor] = useState<string | null>(null);
  const [newCredLabel, setNewCredLabel] = useState("");
  const [newCredValue, setNewCredValue] = useState("");
  const [editingCred, setEditingCred] = useState<string | null>(null);
  const [editCredLabel, setEditCredLabel] = useState("");
  const [editCredValue, setEditCredValue] = useState("");

  const fetchProjects = async (tid?: string) => {
    try {
      const data = await getProjects(tid || undefined);
      setProjects(data);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCredentials = async (projectId: string) => {
    try {
      const creds = await getProjectCredentials(projectId);
      setProjectCredentials((prev) => ({ ...prev, [projectId]: creds }));
    } catch {
      // Silently fail — credentials section will show empty
    }
  };

  useEffect(() => {
    void fetchProjects();
    void getTeams().then(setTeams).catch(() => {});
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (!projectBoards[id]) {
          void getProject(id).then((full) => {
            setProjectBoards((prev) => ({ ...prev, [id]: full.boards || [] }));
          }).catch(() => {});
        }
        if (!projectCredentials[id]) {
          void fetchCredentials(id);
        }
      }
      return next;
    });
  };

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    try {
      const updated = await updateProject(projectId, { status: newStatus as ProjectStatus });
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, ...updated } : p)));
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const handleDelete = async (projectId: string) => {
    try {
      await deleteProject(projectId);
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
      setProjectBoards((prev) => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      setConfirmDeleteId(null);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const handleProjectCreated = (project: Project) => {
    setProjects((prev) => [project, ...prev]);
    setShowCreateProject(false);
  };

  const handleProjectUpdated = (updated: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
  };

  const handleBoardCreated = (_board: Board) => {
    const pid = boardModalProjectId;
    setBoardModalProjectId(null);
    void fetchProjects();
    if (pid) {
      void getProject(pid).then((full) => {
        setProjectBoards((prev) => ({ ...prev, [pid]: full.boards || [] }));
      }).catch(() => {});
    }
  };

  // Credential handlers
  const handleAddCredential = async (projectId: string) => {
    if (!newCredLabel.trim() || !newCredValue.trim()) return;
    try {
      await createProjectCredential(projectId, {
        label: newCredLabel.trim(),
        value: newCredValue.trim(),
      });
      setAddingCredFor(null);
      setNewCredLabel("");
      setNewCredValue("");
      void fetchCredentials(projectId);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const handleDeleteCredential = async (projectId: string, credentialId: string) => {
    try {
      await deleteProjectCredential(projectId, credentialId);
      void fetchCredentials(projectId);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const handleUpdateCredential = async (projectId: string, credentialId: string) => {
    const patch: { label?: string; value?: string } = {};
    if (editCredLabel.trim()) patch.label = editCredLabel.trim();
    if (editCredValue.trim()) patch.value = editCredValue.trim();
    if (Object.keys(patch).length === 0) return;
    try {
      await updateProjectCredential(projectId, credentialId, patch);
      setEditingCred(null);
      setEditCredLabel("");
      setEditCredValue("");
      void fetchCredentials(projectId);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const toggleReveal = (credId: string) => {
    setRevealedCreds((prev) => {
      const next = new Set(prev);
      if (next.has(credId)) {
        next.delete(credId);
      } else {
        next.add(credId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <McPanel>
        <p className="mc-text-faint" style={{ fontSize: "13px" }}>Loading projects...</p>
      </McPanel>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* Error alert */}
      {error && (
        <div
          className="mc-alert-warning"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <span>{error}</span>
          <McButton variant="ghost" size="xs" onClick={() => setError(null)}>Dismiss</McButton>
        </div>
      )}


      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h2 className="mc-text-primary" style={{ fontSize: "18px", fontWeight: 600 }}>Projects</h2>
          {teams.length > 0 && (
            <McSelect
              value={teamFilter}
              onChange={(e) => {
                const val = e.target.value;
                setTeamFilter(val);
                setLoading(true);
                void fetchProjects(val);
              }}
            >
              <option value="">All Teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.icon ? `${t.icon} ` : ""}{t.name}
                </option>
              ))}
            </McSelect>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <McButton size="sm" onClick={() => setShowCreateProject(true)}>
            + New Project
          </McButton>
        </div>
      </div>

      {/* Project list */}
      {projects.length === 0 ? (
        <McPanel>
          <p className="mc-text-faint" style={{ textAlign: "center", fontSize: "13px" }}>
            No projects yet. Create one to get started.
          </p>
        </McPanel>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))", gap: "12px" }}>
          {projects.map((project) => {
            const isExpanded = expandedIds.has(project.id);
            const boards: Board[] = projectBoards[project.id] || [];
            const credentials: ProjectCredential[] = projectCredentials[project.id] || [];

            return (
              <McPanel key={project.id} padding="none">
                {/* Project header */}
                <div
                  onClick={() => toggleExpand(project.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "16px",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                >
                  <span className="mc-text-ghost" style={{ fontSize: "12px" }}>
                    {isExpanded ? "\u25BC" : "\u25B6"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        className="mc-text-primary"
                        style={{
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {project.name}
                      </span>
                      <McPill variant={STATUS_VARIANT[project.status]} size="xs">
                        {project.status}
                      </McPill>
                    </div>
                    {project.description && (
                      <p
                        className="mc-text-muted"
                        style={{
                          fontSize: "12px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginTop: "2px",
                        }}
                      >
                        {project.description}
                      </p>
                    )}
                  </div>
                  <span className="mc-text-faint" style={{ fontSize: "12px" }}>
                    {project.board_count ?? 0} boards
                  </span>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div
                    className="mc-border-top"
                    style={{
                      padding: "16px",
                      paddingTop: "12px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    }}
                  >
                    {/* Config fields */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "8rem 1fr",
                        gap: "8px 12px",
                        alignItems: "center",
                        fontSize: "13px",
                      }}
                    >
                      <span className="mc-text-faint" style={controlLabelStyle}>Status</span>
                      <McSelect
                        value={project.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => void handleStatusChange(project.id, e.target.value)}
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                        <option value="archived">Archived</option>
                      </McSelect>

                      <span className="mc-text-faint" style={controlLabelStyle}>Teams</span>
                      <span className="mc-text-muted">
                        {project.teams && project.teams.length > 0 ? (
                          <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                            {project.teams.map((t) => (
                              <McPill key={t.id} variant="ghost" size="xs">
                                {t.icon ? `${t.icon} ` : ""}{t.name}
                              </McPill>
                            ))}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="mc-ghost-btn mc-text-faint"
                            style={{ fontSize: "12px" }}
                            onClick={(e) => { e.stopPropagation(); setEditProject(project); }}
                          >
                            Not set — edit
                          </button>
                        )}
                      </span>

                      <span className="mc-text-faint" style={controlLabelStyle}>GitHub Repo</span>
                      {project.github_repo ? (
                        <a
                          href={`https://github.com/${project.github_repo}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mc-text-blue"
                          style={{ textDecoration: "none" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {project.github_repo}
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="mc-ghost-btn mc-text-faint"
                          style={{ fontSize: "12px", textAlign: "left" }}
                          onClick={(e) => { e.stopPropagation(); setEditProject(project); }}
                        >
                          Not set — edit
                        </button>
                      )}

                      <span className="mc-text-faint" style={controlLabelStyle}>Discord Server</span>
                      {project.discord_server ? (
                        <span className="mc-text-muted">{project.discord_server}</span>
                      ) : (
                        <button
                          type="button"
                          className="mc-ghost-btn mc-text-faint"
                          style={{ fontSize: "12px", textAlign: "left" }}
                          onClick={(e) => { e.stopPropagation(); setEditProject(project); }}
                        >
                          Not set — edit
                        </button>
                      )}

                      <span className="mc-text-faint" style={controlLabelStyle}>Discord Channel</span>
                      {project.discord_channel ? (
                        <span className="mc-text-muted">{project.discord_channel}</span>
                      ) : (
                        <button
                          type="button"
                          className="mc-ghost-btn mc-text-faint"
                          style={{ fontSize: "12px", textAlign: "left" }}
                          onClick={(e) => { e.stopPropagation(); setEditProject(project); }}
                        >
                          Not set — edit
                        </button>
                      )}
                    </div>

                    {/* Boards list */}
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "8px",
                        }}
                      >
                        <span className="mc-section-label">
                          Boards ({boards.length})
                        </span>
                        <McButton
                          variant="ghost"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setBoardModalProjectId(project.id);
                          }}
                        >
                          + Add Board
                        </McButton>
                      </div>

                      {boards.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {boards.map((board: Board) => (
                            <Link
                              key={board.id}
                              to={`/?board_id=${board.id}`}
                              className="mc-rounded-inner mc-border mc-bg-2 mc-hover-row"
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "12px",
                                padding: "8px 12px",
                                textDecoration: "none",
                                color: "inherit",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span
                                className="mc-text-body"
                                style={{
                                  fontSize: "13px",
                                  fontWeight: 500,
                                  minWidth: 0,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {board.name}
                              </span>
                              <div style={{ flex: 1 }} />
                              <TaskSummaryLine summary={board.task_summary} />
                              {board.mm_board_id && (
                                <span
                                  className="mc-text-green"
                                  style={{ fontSize: "11px" }}
                                  title={`Board: ${board.mm_board_id}`}
                                >
                                  Linked
                                </span>
                              )}
                              <span className="mc-text-ghost" style={{ fontSize: "11px" }}>
                                &rarr;
                              </span>
                            </Link>
                          ))}
                        </div>
                      ) : (
                        <p className="mc-text-ghost" style={{ fontSize: "12px" }}>No boards yet.</p>
                      )}
                    </div>

                    {/* Credentials */}
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "8px",
                        }}
                      >
                        <span className="mc-section-label">
                          Credentials ({credentials.length})
                        </span>
                        <McButton
                          variant="ghost"
                          size="xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddingCredFor(addingCredFor === project.id ? null : project.id);
                            setNewCredLabel("");
                            setNewCredValue("");
                          }}
                        >
                          + Add
                        </McButton>
                      </div>

                      {/* Add credential form */}
                      {addingCredFor === project.id && (
                        <div
                          className="mc-rounded-inner mc-border mc-bg-2"
                          style={{ padding: "10px 12px", marginBottom: "4px" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                            <div style={{ flex: 1 }}>
                              <label className="mc-text-faint" style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" }}>Label</label>
                              <McInput
                                value={newCredLabel}
                                onChange={(e) => setNewCredLabel(e.target.value)}
                                placeholder="e.g. Hosting login"
                              />
                            </div>
                            <div style={{ flex: 2 }}>
                              <label className="mc-text-faint" style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" }}>Value</label>
                              <McInput
                                value={newCredValue}
                                onChange={(e) => setNewCredValue(e.target.value)}
                                placeholder="e.g. username:password"
                              />
                            </div>
                            <McButton
                              size="xs"
                              disabled={!newCredLabel.trim() || !newCredValue.trim()}
                              onClick={() => void handleAddCredential(project.id)}
                            >
                              Save
                            </McButton>
                            <McButton
                              variant="ghost"
                              size="xs"
                              onClick={() => { setAddingCredFor(null); setNewCredLabel(""); setNewCredValue(""); }}
                            >
                              Cancel
                            </McButton>
                          </div>
                        </div>
                      )}

                      {credentials.length > 0 ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {credentials.map((cred) => (
                            <div
                              key={cred.id}
                              className="mc-rounded-inner mc-border mc-bg-2"
                              style={{
                                padding: "8px 12px",
                                fontSize: "13px",
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {editingCred === cred.id ? (
                                <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
                                  <div style={{ flex: 1 }}>
                                    <label className="mc-text-faint" style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" }}>Label</label>
                                    <McInput
                                      value={editCredLabel}
                                      onChange={(e) => setEditCredLabel(e.target.value)}
                                    />
                                  </div>
                                  <div style={{ flex: 2 }}>
                                    <label className="mc-text-faint" style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase" }}>Value</label>
                                    <McInput
                                      value={editCredValue}
                                      onChange={(e) => setEditCredValue(e.target.value)}
                                    />
                                  </div>
                                  <McButton
                                    size="xs"
                                    onClick={() => void handleUpdateCredential(project.id, cred.id)}
                                  >
                                    Save
                                  </McButton>
                                  <McButton
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => { setEditingCred(null); setEditCredLabel(""); setEditCredValue(""); }}
                                  >
                                    Cancel
                                  </McButton>
                                </div>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                  <span className="mc-text-body" style={{ fontWeight: 500, minWidth: "100px" }}>
                                    {cred.label}
                                  </span>
                                  <span
                                    className="mc-text-muted"
                                    style={{
                                      flex: 1,
                                      fontFamily: "monospace",
                                      fontSize: "12px",
                                      cursor: "pointer",
                                      userSelect: revealedCreds.has(cred.id) ? "text" : "none",
                                    }}
                                    onClick={() => toggleReveal(cred.id)}
                                    title="Click to toggle visibility"
                                  >
                                    {revealedCreds.has(cred.id) ? cred.value : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
                                  </span>
                                  <McButton
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => {
                                      setEditingCred(cred.id);
                                      setEditCredLabel(cred.label);
                                      setEditCredValue(cred.value);
                                    }}
                                  >
                                    Edit
                                  </McButton>
                                  <McButton
                                    variant="ghost"
                                    size="xs"
                                    className="mc-text-red"
                                    onClick={() => void handleDeleteCredential(project.id, cred.id)}
                                  >
                                    Delete
                                  </McButton>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        !addingCredFor && (
                          <p className="mc-text-ghost" style={{ fontSize: "12px" }}>No credentials.</p>
                        )
                      )}
                    </div>

                    {/* Actions */}
                    <div
                      className="mc-border-top"
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "8px",
                        paddingTop: "4px",
                      }}
                    >
                      <McButton
                        variant="ghost"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditProject(project);
                        }}
                      >
                        Edit Project
                      </McButton>
                      {confirmDeleteId === project.id ? (
                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                          <McButton
                            variant="error"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(project.id);
                            }}
                          >
                            Confirm Delete
                          </McButton>
                          <McButton
                            variant="ghost"
                            size="xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteId(null);
                            }}
                          >
                            Cancel
                          </McButton>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="mc-ghost-btn mc-text-red"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(project.id);
                          }}
                        >
                          Delete Project
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </McPanel>
            );
          })}
        </div>
      )}

      <CreateProjectModal
        open={showCreateProject}
        onClose={() => setShowCreateProject(false)}
        onCreated={handleProjectCreated}
      />

      <EditProjectModal
        open={!!editProject}
        project={editProject}
        teams={teams}
        onClose={() => setEditProject(null)}
        onUpdated={handleProjectUpdated}
      />

      {boardModalProjectId && (
        <CreateBoardModal
          open={!!boardModalProjectId}
          projectId={boardModalProjectId}
          onClose={() => setBoardModalProjectId(null)}
          onCreated={handleBoardCreated}
        />
      )}
    </div>
  );
}

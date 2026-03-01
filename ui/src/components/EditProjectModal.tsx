import { useEffect, useState } from "react";

import { updateProject } from "../api";
import type { Project, Team } from "../types";
import { McButton, McInput, McModal, McSelect, McTextarea } from "./mc";

type Props = {
  open: boolean;
  project: Project | null;
  teams: Team[];
  onClose: () => void;
  onUpdated: (project: Project) => void;
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  marginBottom: "6px",
};

export default function EditProjectModal({ open, project, teams, onClose, onUpdated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [githubRepo, setGithubRepo] = useState("");
  const [discordServer, setDiscordServer] = useState("");
  const [discordChannel, setDiscordChannel] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && project) {
      setName(project.name);
      setDescription(project.description || "");
      setStatus(project.status);
      setGithubRepo(project.github_repo || "");
      setDiscordServer(project.discord_server || "");
      setDiscordChannel(project.discord_channel || "");
      setSelectedTeamIds(new Set((project.teams || []).map((t) => t.id)));
      setSubmitting(false);
    }
  }, [open, project]);

  const toggleTeam = (teamId: string) => {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!project || !name.trim()) return;
    setSubmitting(true);
    try {
      const updated = await updateProject(project.id, {
        name: name.trim(),
        description: description.trim() || null,
        status: status as Project["status"],
        github_repo: githubRepo.trim() || null,
        discord_server: discordServer.trim() || null,
        discord_channel: discordChannel.trim() || null,
        team_ids: Array.from(selectedTeamIds),
      } as Partial<Project>);
      onUpdated(updated);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <McModal
      open={open}
      onClose={onClose}
      title="Edit Project"
      actions={
        <>
          <McButton variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </McButton>
          <McButton
            onClick={() => void handleSubmit()}
            disabled={submitting || !name.trim()}
          >
            {submitting ? "Saving..." : "Save"}
          </McButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label className="mc-text-muted" style={labelStyle}>Name</label>
          <McInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            required
          />
        </div>

        <div>
          <label className="mc-text-muted" style={labelStyle}>Description</label>
          <McTextarea
            className="h-20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        <div>
          <label className="mc-text-muted" style={labelStyle}>Status</label>
          <McSelect value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="archived">Archived</option>
          </McSelect>
        </div>

        <div>
          <label className="mc-text-muted" style={labelStyle}>GitHub Repo</label>
          <McInput
            value={githubRepo}
            onChange={(e) => setGithubRepo(e.target.value)}
            placeholder="e.g. owner/repo"
          />
        </div>

        <div>
          <label className="mc-text-muted" style={labelStyle}>Discord Server</label>
          <McInput
            value={discordServer}
            onChange={(e) => setDiscordServer(e.target.value)}
            placeholder="Server name or ID"
          />
        </div>

        <div>
          <label className="mc-text-muted" style={labelStyle}>Discord Channel</label>
          <McInput
            value={discordChannel}
            onChange={(e) => setDiscordChannel(e.target.value)}
            placeholder="#project-channel"
          />
        </div>

        {teams.length > 0 && (
          <div>
            <label className="mc-text-muted" style={labelStyle}>Teams</label>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {teams.map((t) => (
                <label
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "13px",
                    cursor: "pointer",
                    padding: "4px 0",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTeamIds.has(t.id)}
                    onChange={() => toggleTeam(t.id)}
                  />
                  <span className="mc-text-body">
                    {t.icon ? `${t.icon} ` : ""}{t.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </McModal>
  );
}

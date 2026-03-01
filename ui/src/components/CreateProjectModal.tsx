import { useEffect, useState } from "react";

import { createProject, getTeams } from "../api";
import type { Project, Team } from "../types";
import { McButton, McInput, McModal, McTextarea } from "./mc";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (project: Project) => void;
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  marginBottom: "6px",
};

export default function CreateProjectModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [discordServer, setDiscordServer] = useState("");
  const [discordChannel, setDiscordChannel] = useState("");
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [teams, setTeams] = useState<Team[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setGithubRepo("");
      setDiscordServer("");
      setDiscordChannel("");
      setSelectedTeamIds(new Set());
      setSubmitting(false);
      void getTeams().then(setTeams).catch(() => {});
    }
  }, [open]);

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
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() || null,
        github_repo: githubRepo.trim() || null,
        discord_server: discordServer.trim() || null,
        discord_channel: discordChannel.trim() || null,
        team_ids: selectedTeamIds.size > 0 ? Array.from(selectedTeamIds) : undefined,
      });
      onCreated(project);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <McModal
      open={open}
      onClose={onClose}
      title="Create Project"
      actions={
        <>
          <McButton variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </McButton>
          <McButton
            onClick={() => void handleSubmit()}
            disabled={submitting || !name.trim()}
          >
            {submitting ? "Creating..." : "Create Project"}
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

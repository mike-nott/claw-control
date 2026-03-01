import { useEffect, useMemo, useState } from "react";

import {
  createTeamMember,
  deleteMember,
  getAgents,
  getTeam,
  getTeams,
  updateMember,
} from "../api";
import {
  McButton,
  McInput,
  McModal,
  McPanel,
  McPill,
  McSectionTitle,
  McSelect,
  McTextarea,
} from "../components/mc";
import type { Agent, MemberStatus, MemberType, Team, TeamMember } from "../types";

/* ── Status indicator ─────────────────────────── */

function StatusDot({ status }: { status: MemberStatus }) {
  if (status === "active")
    return <span style={{ color: "var(--mc-green)" }} title="Active">●</span>;
  if (status === "away")
    return <span style={{ color: "var(--mc-orange)" }} title="Away">◐</span>;
  return <span style={{ color: "var(--mc-text-faint)" }} title="Inactive">○</span>;
}

/* ── Label style shared by modal forms ────────── */

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  marginBottom: "6px",
};

/* ── Add Member Modal ─────────────────────────── */

function AddMemberModal({
  open,
  onClose,
  teamId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  teamId: string;
  onCreated: (m: TeamMember) => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [type, setType] = useState<MemberType>("agent");
  const [category, setCategory] = useState("");
  const [mmUsername, setMmUsername] = useState("");
  const [modelTier, setModelTier] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState<MemberStatus>("active");
  const [agentId, setAgentId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setRole("");
      setType("agent");
      setCategory("");
      setMmUsername("");
      setModelTier("");
      setBio("");
      setStatus("active");
      setAgentId("");
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const member = await createTeamMember(teamId, {
        name: name.trim(),
        type,
        role: role.trim() || null,
        category: category.trim() || null,
        mm_username: mmUsername.trim() || null,
        model_tier: modelTier.trim() || null,
        bio: bio.trim() || null,
        status,
        agent_id: agentId.trim() || null,
      });
      onCreated(member);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <McModal
      open={open}
      onClose={onClose}
      title="Add Member"
      actions={
        <>
          <McButton variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </McButton>
          <McButton
            onClick={() => void handleSubmit()}
            disabled={submitting || !name.trim()}
          >
            {submitting ? "Adding..." : "Add Member"}
          </McButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label className="mc-text-muted" style={labelStyle}>Name</label>
          <McInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Display name" required />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label className="mc-text-muted" style={labelStyle}>Type</label>
            <McSelect value={type} onChange={(e) => setType(e.target.value as MemberType)}>
              <option value="agent">Agent</option>
              <option value="human">Human</option>
              <option value="external_agent">External Agent</option>
              <option value="external_human">External Human</option>
            </McSelect>
          </div>
          <div>
            <label className="mc-text-muted" style={labelStyle}>Status</label>
            <McSelect value={status} onChange={(e) => setStatus(e.target.value as MemberStatus)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="away">Away</option>
            </McSelect>
          </div>
        </div>
        <div>
          <label className="mc-text-muted" style={labelStyle}>Role</label>
          <McInput value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Productivity Director" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label className="mc-text-muted" style={labelStyle}>Category</label>
            <McInput value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Workers" />
          </div>
          <div>
            <label className="mc-text-muted" style={labelStyle}>Model Tier</label>
            <McInput value={modelTier} onChange={(e) => setModelTier(e.target.value)} placeholder="e.g. Opus 4.6" />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label className="mc-text-muted" style={labelStyle}>MM Username</label>
            <McInput value={mmUsername} onChange={(e) => setMmUsername(e.target.value)} placeholder="@username" />
          </div>
          <div>
            <label className="mc-text-muted" style={labelStyle}>Agent ID</label>
            <McInput value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="e.g. main, security" />
          </div>
        </div>
        <div>
          <label className="mc-text-muted" style={labelStyle}>Bio</label>
          <McTextarea className="h-16" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What do they do?" />
        </div>
      </div>
    </McModal>
  );
}

/* ── Edit Member Modal ────────────────────────── */

function EditMemberModal({
  open,
  onClose,
  member,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  member: TeamMember;
  onUpdated: (m: TeamMember) => void;
}) {
  const [role, setRole] = useState(member.role ?? "");
  const [category, setCategory] = useState(member.category ?? "");
  const [status, setStatus] = useState<MemberStatus>(member.status);
  const [bio, setBio] = useState(member.bio ?? "");
  const [modelTier, setModelTier] = useState(member.model_tier ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setRole(member.role ?? "");
      setCategory(member.category ?? "");
      setStatus(member.status);
      setBio(member.bio ?? "");
      setModelTier(member.model_tier ?? "");
      setSubmitting(false);
    }
  }, [open, member]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const updated = await updateMember(member.id, {
        role: role.trim() || null,
        category: category.trim() || null,
        status,
        bio: bio.trim() || null,
        model_tier: modelTier.trim() || null,
      });
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
      title={`Edit — ${member.name}`}
      actions={
        <>
          <McButton variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </McButton>
          <McButton onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Saving..." : "Save"}
          </McButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label className="mc-text-muted" style={labelStyle}>Role</label>
          <McInput value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role title" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <div>
            <label className="mc-text-muted" style={labelStyle}>Category</label>
            <McInput value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Workers" />
          </div>
          <div>
            <label className="mc-text-muted" style={labelStyle}>Model Tier</label>
            <McInput value={modelTier} onChange={(e) => setModelTier(e.target.value)} placeholder="e.g. Opus 4.6" />
          </div>
        </div>
        <div>
          <label className="mc-text-muted" style={labelStyle}>Status</label>
          <McSelect value={status} onChange={(e) => setStatus(e.target.value as MemberStatus)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="away">Away</option>
          </McSelect>
        </div>
        <div>
          <label className="mc-text-muted" style={labelStyle}>Bio</label>
          <McTextarea className="h-16" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="What do they do?" />
        </div>
      </div>
    </McModal>
  );
}

/* ── Member Row ───────────────────────────────── */

function MemberRow({
  member,
  emoji,
  onEdit,
  onDelete,
}: {
  member: TeamMember;
  emoji?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="mc-border-row">
      {/* Collapsed row */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 16px",
          cursor: "pointer",
          transition: "background 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--mc-hover-overlay)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
      >
        <StatusDot status={member.status} />
        <span
          className="mc-text-primary"
          style={{ fontWeight: 600, fontSize: "13px", minWidth: 0, flex: "0 0 auto" }}
        >
          {emoji && <span style={{ marginRight: "4px" }}>{emoji}</span>}{member.name}
        </span>
        <span
          className="mc-text-muted"
          style={{ fontSize: "12px", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {member.role || ""}
        </span>
        {member.mm_username && (
          <span className="mc-text-faint" style={{ fontSize: "11px", fontFamily: "monospace" }}>
            @{member.mm_username}
          </span>
        )}
        {member.model_tier && (
          <McPill variant="info" size="xs">{member.model_tier}</McPill>
        )}
        <span className="mc-text-ghost" style={{ fontSize: "11px" }}>
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div
          className="mc-bg-2"
          style={{
            padding: "12px 16px 12px 40px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            fontSize: "12px",
          }}
        >
          {member.bio && (
            <p className="mc-text-muted" style={{ lineHeight: 1.5, margin: 0 }}>{member.bio}</p>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "7rem 1fr",
              gap: "4px 12px",
              alignItems: "center",
            }}
          >
            <span className="mc-text-faint" style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "10px", letterSpacing: "0.5px" }}>Type</span>
            <span className="mc-text-muted">{member.type}</span>

            {member.agent_id && (
              <>
                <span className="mc-text-faint" style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "10px", letterSpacing: "0.5px" }}>Agent ID</span>
                <span className="mc-text-muted" style={{ fontFamily: "monospace" }}>{member.agent_id}</span>
              </>
            )}

            {member.mm_user_id && (
              <>
                <span className="mc-text-faint" style={{ fontWeight: 600, textTransform: "uppercase", fontSize: "10px", letterSpacing: "0.5px" }}>MM User ID</span>
                <span className="mc-text-muted" style={{ fontFamily: "monospace" }}>{member.mm_user_id}</span>
              </>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
            <button
              type="button"
              className="mc-ghost-btn mc-text-indigo"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
            >
              Edit
            </button>
            {confirmDelete ? (
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <McButton
                  variant="error"
                  size="xs"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                >
                  Confirm
                </McButton>
                <McButton
                  variant="ghost"
                  size="xs"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                >
                  Cancel
                </McButton>
              </span>
            ) : (
              <button
                type="button"
                className="mc-ghost-btn mc-text-red"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Page ──────────────────────────────────────── */

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);

  const agentEmojiMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) {
      if (a.emoji) map.set(a.id, a.emoji);
    }
    return map;
  }, [agents]);

  useEffect(() => {
    void getAgents().then(setAgents).catch(() => {});
    getTeams()
      .then((data) => {
        data.sort((a, b) => { if (a.is_local !== b.is_local) return a.is_local ? -1 : 1; return a.name.localeCompare(b.name); }); setTeams(data);
        // Auto-expand all teams and load their members
        const ids = new Set(data.map((t) => t.id));
        setExpandedTeams(ids);
        data.forEach((team) => {
          void getTeam(team.id).then((full) => {
            setTeamMembers((prev) => ({ ...prev, [team.id]: full.members }));
          });
        });
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
        if (!teamMembers[teamId]) {
          void getTeam(teamId).then((full) => {
            setTeamMembers((prev) => ({ ...prev, [teamId]: full.members }));
          });
        }
      }
      return next;
    });
  };

  const handleMemberCreated = (member: TeamMember) => {
    setTeamMembers((prev) => ({
      ...prev,
      [member.team_id]: [...(prev[member.team_id] || []), member],
    }));
    setTeams((prev) =>
      prev.map((t) => (t.id === member.team_id ? { ...t, member_count: t.member_count + 1 } : t))
    );
    setAddMemberTeamId(null);
  };

  const handleMemberUpdated = (updated: TeamMember) => {
    setTeamMembers((prev) => ({
      ...prev,
      [updated.team_id]: (prev[updated.team_id] || []).map((m) =>
        m.id === updated.id ? updated : m
      ),
    }));
    setEditMember(null);
  };

  const handleMemberDelete = async (member: TeamMember) => {
    try {
      await deleteMember(member.id);
      setTeamMembers((prev) => ({
        ...prev,
        [member.team_id]: (prev[member.team_id] || []).filter((m) => m.id !== member.id),
      }));
      setTeams((prev) =>
        prev.map((t) =>
          t.id === member.team_id ? { ...t, member_count: Math.max(0, t.member_count - 1) } : t
        )
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // Group members by category
  const groupByCategory = (members: TeamMember[]): Record<string, TeamMember[]> => {
    const groups: Record<string, TeamMember[]> = {};
    for (const m of members) {
      const cat = m.category || "Uncategorised";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(m);
    }
    return groups;
  };

  if (loading) {
    return (
      <McPanel>
        <p className="mc-text-faint" style={{ fontSize: "13px" }}>Loading teams...</p>
      </McPanel>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {error && (
        <div
          className="mc-alert-warning"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}
        >
          <span>{error}</span>
          <McButton variant="ghost" size="xs" onClick={() => setError(null)}>Dismiss</McButton>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 className="mc-text-primary" style={{ fontSize: "18px", fontWeight: 600 }}>Teams</h2>
      </div>

      {teams.length === 0 ? (
        <McPanel>
          <p className="mc-text-faint" style={{ textAlign: "center", fontSize: "13px" }}>
            No teams yet.
          </p>
        </McPanel>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))", gap: "12px", alignItems: "start" }}>
          {teams.map((team) => {
            const isExpanded = expandedTeams.has(team.id);
            const members = teamMembers[team.id] || [];
            const grouped = groupByCategory(members);
            const CATEGORY_ORDER = ["Humans", "Assistants", "Workers"]; const categoryOrder = Object.keys(grouped).sort((a, b) => { const ai = CATEGORY_ORDER.indexOf(a); const bi = CATEGORY_ORDER.indexOf(b); if (ai === -1 && bi === -1) return a.localeCompare(b); if (ai === -1) return 1; if (bi === -1) return 1; return ai - bi; });

            return (
              <McPanel key={team.id} padding="none">
                {/* Team header */}
                <div
                  onClick={() => toggleTeam(team.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "16px",
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--mc-hover-overlay)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                >
                  <span className="mc-text-ghost" style={{ fontSize: "12px" }}>
                    {isExpanded ? "\u25BC" : "\u25B6"}
                  </span>
                  <span style={{ fontSize: "22px", lineHeight: 1 }}>{team.icon || "\uD83D\uDC65"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span
                        className="mc-text-primary"
                        style={{ fontWeight: 700, fontSize: "15px" }}
                      >
                        {team.name}
                      </span>
                      <McPill
                        variant={team.is_local ? "primary" : "ghost"}
                        size="xs"
                      >
                        {team.is_local ? "local" : "external"}
                      </McPill>
                    </div>
                    {team.description && (
                      <p
                        className="mc-text-muted"
                        style={{
                          fontSize: "12px",
                          marginTop: "2px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {team.description}
                      </p>
                    )}
                  </div>
                  <span className="mc-text-faint" style={{ fontSize: "12px" }}>
                    {team.member_count} {team.member_count === 1 ? "member" : "members"}
                  </span>
                </div>

                {/* Expanded content — members grouped by category */}
                {isExpanded && (
                  <div className="mc-border-top">
                    {members.length === 0 ? (
                      <p
                        className="mc-text-ghost"
                        style={{ fontSize: "12px", padding: "16px", textAlign: "center" }}
                      >
                        Loading members...
                      </p>
                    ) : (
                      categoryOrder.map((cat) => (
                        <div key={cat}>
                          <div style={{ padding: "12px 16px 4px 16px" }}>
                            <McSectionTitle>{cat}</McSectionTitle>
                          </div>
                          {grouped[cat].map((member) => (
                            <MemberRow
                              key={member.id}
                              member={member}
                              emoji={member.agent_id ? agentEmojiMap.get(member.agent_id) : undefined}
                              onEdit={() => setEditMember(member)}
                              onDelete={() => void handleMemberDelete(member)}
                            />
                          ))}
                        </div>
                      ))
                    )}

                    {/* Add member button */}
                    <div style={{ padding: "8px 16px 12px 16px" }}>
                      <McButton
                        variant="ghost"
                        size="xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAddMemberTeamId(team.id);
                        }}
                      >
                        + Add Member
                      </McButton>
                    </div>
                  </div>
                )}
              </McPanel>
            );
          })}
        </div>
      )}

      {/* Add Member Modal */}
      {addMemberTeamId && (
        <AddMemberModal
          open={!!addMemberTeamId}
          onClose={() => setAddMemberTeamId(null)}
          teamId={addMemberTeamId}
          onCreated={handleMemberCreated}
        />
      )}

      {/* Edit Member Modal */}
      {editMember && (
        <EditMemberModal
          open={!!editMember}
          onClose={() => setEditMember(null)}
          member={editMember}
          onUpdated={handleMemberUpdated}
        />
      )}
    </div>
  );
}

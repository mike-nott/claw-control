import { useCallback, useEffect, useState } from "react";

import {
  clearFederationQueue,
  deleteFederationConnection,
  getFederationConnections,
  getFederationQueue,
  patchFederationConnection,
  processFederationQueue,
  sendFederationInvite,
} from "../api";
import type { FederationConnection, FederationQueueEvent, SyncQueueResult } from "../types";
import { McButton, McInput, McModal, McPanel, McPill, McSectionTitle } from "../components/mc";

type PillVariant = "success" | "warning" | "error" | "ghost";

const STATUS_VARIANT: Record<string, PillVariant> = {
  active: "success",
  paused: "warning",
  broken: "error",
};

type MappingEntry = [string, string];

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function mapToEntries(map: Record<string, string>): MappingEntry[] {
  const entries = Object.entries(map);
  return entries.length > 0 ? entries : [];
}

function entriesToMap(entries: MappingEntry[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (k.trim()) result[k.trim()] = v.trim();
  }
  return result;
}

export default function FederationPage() {
  // Connections
  const [connections, setConnections] = useState<FederationConnection[]>([]);
  const [loadingConns, setLoadingConns] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [agentMaps, setAgentMaps] = useState<Record<string, MappingEntry[]>>({});
  const [statusMaps, setStatusMaps] = useState<Record<string, MappingEntry[]>>({});
  const [savingMaps, setSavingMaps] = useState<string | null>(null);

  // Disconnect modal
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Connect form
  const [inviteUrl, setInviteUrl] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [connectMsg, setConnectMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Sync queue
  const [queue, setQueue] = useState<FederationQueueEvent[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<SyncQueueResult | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchConnections = useCallback(() => {
    getFederationConnections()
      .then(setConnections)
      .catch(() => {})
      .finally(() => setLoadingConns(false));
  }, []);

  const fetchQueue = useCallback(() => {
    getFederationQueue()
      .then(setQueue)
      .catch(() => {})
      .finally(() => setLoadingQueue(false));
  }, []);

  useEffect(() => {
    fetchConnections();
    fetchQueue();
  }, [fetchConnections, fetchQueue]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Initialize mapping entries for editing
        const conn = connections.find((c) => c.id === id);
        if (conn) {
          setAgentMaps((m) => ({ ...m, [id]: mapToEntries(conn.agent_map) }));
          setStatusMaps((m) => ({ ...m, [id]: mapToEntries(conn.status_map) }));
        }
      }
      return next;
    });
  };

  const updateMapEntry = (
    setter: React.Dispatch<React.SetStateAction<Record<string, MappingEntry[]>>>,
    connId: string,
    index: number,
    field: 0 | 1,
    value: string,
  ) => {
    setter((prev) => {
      const entries = [...(prev[connId] || [])];
      const entry = [...entries[index]] as MappingEntry;
      entry[field] = value;
      entries[index] = entry;
      return { ...prev, [connId]: entries };
    });
  };

  const addMapEntry = (
    setter: React.Dispatch<React.SetStateAction<Record<string, MappingEntry[]>>>,
    connId: string,
  ) => {
    setter((prev) => ({
      ...prev,
      [connId]: [...(prev[connId] || []), ["", ""]],
    }));
  };

  const removeMapEntry = (
    setter: React.Dispatch<React.SetStateAction<Record<string, MappingEntry[]>>>,
    connId: string,
    index: number,
  ) => {
    setter((prev) => ({
      ...prev,
      [connId]: (prev[connId] || []).filter((_, i) => i !== index),
    }));
  };

  const saveMappings = async (connId: string) => {
    setSavingMaps(connId);
    try {
      const updated = await patchFederationConnection(connId, {
        agent_map: entriesToMap(agentMaps[connId] || []),
        status_map: entriesToMap(statusMaps[connId] || []),
      });
      setConnections((prev) => prev.map((c) => (c.id === connId ? updated : c)));
    } catch {
      // Error is visible via unchanged data
    } finally {
      setSavingMaps(null);
    }
  };

  const handleConnect = async () => {
    if (!inviteUrl.trim()) return;
    setConnecting(true);
    setConnectMsg(null);
    try {
      await sendFederationInvite(inviteUrl.trim());
      setConnectMsg({ type: "success", text: "Connected successfully" });
      setInviteUrl("");
      fetchConnections();
    } catch (err: unknown) {
      setConnectMsg({ type: "error", text: (err as Error).message });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectId) return;
    setDisconnecting(true);
    try {
      await deleteFederationConnection(disconnectId);
      setConnections((prev) => prev.filter((c) => c.id !== disconnectId));
      setDisconnectId(null);
    } catch {
      // Keep modal open on error
    } finally {
      setDisconnecting(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    setProcessResult(null);
    try {
      const result = await processFederationQueue();
      setProcessResult(result);
      fetchQueue();
    } catch {
      // Ignore
    } finally {
      setProcessing(false);
    }
  };

  const handleClear = async () => {
    setClearing(true);
    try {
      await clearFederationQueue();
      fetchQueue();
    } catch {
      // Ignore
    } finally {
      setClearing(false);
    }
  };

  const pendingCount = queue.filter((e) => e.status === "pending").length;
  const failedCount = queue.filter((e) => e.status === "failed").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <McSectionTitle>Collaborate</McSectionTitle>

      {/* ── Section B: Connect to Instance ── */}
      <McPanel padding="md">
        <span
          className="mc-section-label"
          style={{ display: "block", marginBottom: "10px" }}
        >
          Connect to Instance
        </span>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <div style={{ flex: 1 }}>
            <McInput
              mcSize="sm"
              placeholder="https://their-host:8088"
              value={inviteUrl}
              onChange={(e) => setInviteUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleConnect();
              }}
            />
          </div>
          <McButton size="sm" onClick={() => void handleConnect()} disabled={connecting || !inviteUrl.trim()}>
            {connecting ? "Connecting..." : "Connect"}
          </McButton>
        </div>
        {connectMsg && (
          <p
            className={connectMsg.type === "success" ? "mc-text-green" : "mc-text-red"}
            style={{ fontSize: "12px", marginTop: "8px" }}
          >
            {connectMsg.text}
          </p>
        )}
      </McPanel>

      {/* ── Section A: Connections ── */}
      <McSectionTitle>Connections</McSectionTitle>
      {loadingConns ? (
        <McPanel padding="md">
          <p className="mc-text-faint" style={{ fontSize: "13px" }}>Loading connections...</p>
        </McPanel>
      ) : connections.length === 0 ? (
        <McPanel padding="md">
          <p className="mc-text-faint" style={{ fontSize: "13px" }}>
            No connections. Use the form above to connect to another instance.
          </p>
        </McPanel>
      ) : (
        connections.map((conn) => {
          const isExpanded = expanded.has(conn.id);
          const agentCount = Object.keys(conn.agent_map).length;
          const statusCount = Object.keys(conn.status_map).length;

          return (
            <McPanel key={conn.id} padding="none">
              {/* Connection header */}
              <div
                style={{ padding: "14px 16px", cursor: "pointer" }}
                onClick={() => toggleExpand(conn.id)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span className="mc-text-primary" style={{ fontSize: "14px", fontWeight: 600 }}>
                    {conn.name}
                  </span>
                  <McPill variant={STATUS_VARIANT[conn.status] || "ghost"} size="sm">
                    {conn.status}
                  </McPill>
                </div>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                  <span className="mc-text-muted" style={{ fontSize: "11px" }}>
                    {conn.endpoint}
                  </span>
                  <span className="mc-text-faint" style={{ fontSize: "11px" }}>
                    Last sync: {timeAgo(conn.last_sync_at)}
                  </span>
                  <span className="mc-text-faint" style={{ fontSize: "11px" }}>
                    {agentCount} agent mapping{agentCount !== 1 ? "s" : ""}
                  </span>
                  <span className="mc-text-faint" style={{ fontSize: "11px" }}>
                    {statusCount} status mapping{statusCount !== 1 ? "s" : ""}
                  </span>
                  <span className="mc-text-ghost" style={{ fontSize: "11px" }}>
                    {isExpanded ? "\u25B2" : "\u25BC"}
                  </span>
                </div>
              </div>

              {/* Expanded mapping editor */}
              {isExpanded && (
                <div className="mc-border-top" style={{ padding: "14px 16px" }}>
                  {/* Agent Map */}
                  <MappingEditor
                    label="Agent Mappings"
                    entries={agentMaps[conn.id] || []}
                    onUpdate={(i, f, v) => updateMapEntry(setAgentMaps, conn.id, i, f, v)}
                    onAdd={() => addMapEntry(setAgentMaps, conn.id)}
                    onRemove={(i) => removeMapEntry(setAgentMaps, conn.id, i)}
                    keyLabel="Their agent"
                    valueLabel="Our agent"
                  />

                  {/* Status Map */}
                  <MappingEditor
                    label="Status Mappings"
                    entries={statusMaps[conn.id] || []}
                    onUpdate={(i, f, v) => updateMapEntry(setStatusMaps, conn.id, i, f, v)}
                    onAdd={() => addMapEntry(setStatusMaps, conn.id)}
                    onRemove={(i) => removeMapEntry(setStatusMaps, conn.id, i)}
                    keyLabel="Their status"
                    valueLabel="Our status"
                  />

                  {/* Actions */}
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px" }}>
                    <McButton
                      variant="error"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDisconnectId(conn.id);
                      }}
                    >
                      Disconnect
                    </McButton>
                    <McButton
                      size="xs"
                      disabled={savingMaps === conn.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void saveMappings(conn.id);
                      }}
                    >
                      {savingMaps === conn.id ? "Saving..." : "Save Mappings"}
                    </McButton>
                  </div>
                </div>
              )}
            </McPanel>
          );
        })
      )}

      {/* ── Section C: Sync Queue ── */}
      <McSectionTitle>Sync Queue</McSectionTitle>
      <McPanel padding="md">
        {loadingQueue ? (
          <p className="mc-text-faint" style={{ fontSize: "13px" }}>Loading queue...</p>
        ) : queue.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "16px" }}>{"\u2705"}</span>
            <span className="mc-text-muted" style={{ fontSize: "13px" }}>No pending sync events</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "12px" }}>
              <span className="mc-text-muted" style={{ fontSize: "12px" }}>
                Pending: <span className="mc-text-primary">{pendingCount}</span>
              </span>
              <span className="mc-text-muted" style={{ fontSize: "12px" }}>
                Failed: <span className={failedCount > 0 ? "mc-text-red" : "mc-text-primary"}>{failedCount}</span>
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {queue.map((evt) => (
                <div
                  key={evt.id}
                  className="mc-bg-2 mc-rounded-input"
                  style={{
                    padding: "8px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontSize: "12px",
                  }}
                >
                  <McPill variant={evt.status === "pending" ? "warning" : "error"} size="xs">
                    {evt.status}
                  </McPill>
                  <span className="mc-text-body">{evt.event_type}</span>
                  <span className="mc-text-faint">{evt.connection_name}</span>
                  <span className="mc-text-ghost" style={{ marginLeft: "auto" }}>
                    {evt.attempts} attempt{evt.attempts !== 1 ? "s" : ""} &middot; {timeAgo(evt.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
          <McButton variant="ghost" size="xs" onClick={() => void handleProcess()} disabled={processing}>
            {processing ? "Processing..." : "Process Now"}
          </McButton>
          <McButton variant="ghost" size="xs" onClick={() => void handleClear()} disabled={clearing}>
            {clearing ? "Clearing..." : "Clear Completed"}
          </McButton>
        </div>
        {processResult && (
          <p className="mc-text-muted" style={{ fontSize: "11px", marginTop: "8px" }}>
            Processed {processResult.processed}: {processResult.delivered} delivered, {processResult.failed} failed, {processResult.skipped} skipped
            {processResult.expired > 0 && `, ${processResult.expired} expired`}
          </p>
        )}
      </McPanel>

      {/* Disconnect confirmation modal */}
      <McModal
        open={disconnectId !== null}
        onClose={() => setDisconnectId(null)}
        title="Disconnect Instance"
        actions={
          <>
            <McButton variant="ghost" onClick={() => setDisconnectId(null)} disabled={disconnecting}>
              Cancel
            </McButton>
            <McButton variant="error" onClick={() => void handleDisconnect()} disabled={disconnecting}>
              {disconnecting ? "Disconnecting..." : "Disconnect"}
            </McButton>
          </>
        }
      >
        <p className="mc-text-body" style={{ fontSize: "13px" }}>
          This will disconnect from the remote instance and remove all task links. This action cannot be undone.
        </p>
      </McModal>
    </div>
  );
}

/* ── Mapping editor sub-component ── */

type MappingEditorProps = {
  label: string;
  entries: MappingEntry[];
  onUpdate: (index: number, field: 0 | 1, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  keyLabel: string;
  valueLabel: string;
};

function MappingEditor({ label, entries, onUpdate, onAdd, onRemove, keyLabel, valueLabel }: MappingEditorProps) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <span className="mc-section-label" style={{ display: "block", marginBottom: "6px" }}>
        {label}
      </span>
      {entries.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {entries.map(([k, v], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ flex: 1 }}>
                <McInput
                  mcSize="sm"
                  placeholder={keyLabel}
                  value={k}
                  onChange={(e) => onUpdate(i, 0, e.target.value)}
                />
              </div>
              <span className="mc-text-ghost" style={{ fontSize: "12px" }}>{"\u2192"}</span>
              <div style={{ flex: 1 }}>
                <McInput
                  mcSize="sm"
                  placeholder={valueLabel}
                  value={v}
                  onChange={(e) => onUpdate(i, 1, e.target.value)}
                />
              </div>
              <button
                type="button"
                className="mc-text-ghost mc-hover-text-red"
                onClick={() => onRemove(i)}
                style={{ fontSize: "12px", cursor: "pointer", background: "none", border: "none" }}
              >
                {"\u2715"}
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: "4px" }}>
        <McButton variant="ghost" size="xs" onClick={onAdd}>
          + Add
        </McButton>
      </div>
    </div>
  );
}

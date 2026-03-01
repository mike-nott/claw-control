import { useEffect, useState } from "react";

import { getAgentConfigs, getAgentFile } from "../api";
import AgentDetailPane from "../components/AgentDetailPane";
import AgentList from "../components/AgentList";
import AgentSettingsPanel from "../components/AgentSettingsPanel";
import { McPanel } from "../components/mc";
import type { AgentConfig } from "../types";

interface SelectedBox {
  section: string;
  key: string;
}

const panelClasses = "mc-bg-1 mc-border mc-rounded-card mc-shadow";

export default function AgentsPage() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedBox, setSelectedBox] = useState<SelectedBox | null>(null);
  const [fileCache, setFileCache] = useState<Record<string, { content: string | null; exists: boolean }>>({});
  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getAgentConfigs()
      .then((data) => {
        if (!mounted) return;
        setAgents(data);
        if (data.length > 0) {
          setSelectedAgentId(data[0].id);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const handleSelectBox = async (box: SelectedBox) => {
    setSelectedBox(box);

    // Fetch workspace file if needed
    if (box.section === "workspace" && selectedAgentId) {
      const cacheKey = selectedAgentId + "/" + box.key;
      if (fileCache[cacheKey]) return; // already cached

      setFileLoading(true);
      try {
        const result = await getAgentFile(selectedAgentId, box.key);
        setFileCache((prev) => ({ ...prev, [cacheKey]: result }));
      } catch {
        setFileCache((prev) => ({ ...prev, [cacheKey]: { content: null, exists: false } }));
      } finally {
        setFileLoading(false);
      }
    }
  };

  const handleSelectAgent = (id: string) => {
    setSelectedAgentId(id);
    setSelectedBox(null);
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  return (
    <>
      {loading ? (
        <McPanel>
          <p className="mc-text-faint" style={{ fontSize: "13px" }}>Loading agents\u2026</p>
        </McPanel>
      ) : (
        <div style={{ display: "flex", gap: "16px", height: "calc(100vh - 8rem)" }}>
          {/* Left + Centre wrapper \u2014 fills the non-right half */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", gap: "16px" }}>
            {/* Left pane \u2014 agent list */}
            <div style={{ width: "14rem", flexShrink: 0, overflow: "auto" }}>
              <AgentList
                agents={agents}
                selectedId={selectedAgentId}
                onSelect={handleSelectAgent}
              />
            </div>

            {/* Centre pane \u2014 settings panel */}
            <div className={panelClasses} style={{ padding: "16px", overflow: "auto", flex: 1, minWidth: 0 }}>
              {selectedAgent ? (
                <AgentSettingsPanel
                  agent={selectedAgent}
                  selectedBox={selectedBox}
                  fileCache={fileCache}
                  onSelectBox={(box) => { void handleSelectBox(box); }}
                />
              ) : (
                <div className="mc-text-faint" style={{ fontSize: "13px" }}>No agent selected.</div>
              )}
            </div>
          </div>

          {/* Right pane \u2014 detail */}
          <div className={panelClasses} style={{ padding: "16px", overflow: "auto", width: "50%", flexShrink: 0 }}>
            <AgentDetailPane
              agent={selectedAgent}
              selectedBox={selectedBox}
              fileCache={fileCache}
              fileLoading={fileLoading}
            />
          </div>
        </div>
      )}
    </>
  );
}

import { useMemo, useState } from "react";

import { McPanel } from "./mc";
import type { Activity } from "../types";

type Props = {
  activities: Activity[];
};

type FeedTab = "all" | "tasks" | "comments" | "status";

function matchesTab(item: Activity, tab: FeedTab): boolean {
  if (tab === "all") return true;
  if (tab === "tasks") return item.activity_type.startsWith("task.");
  if (tab === "comments") return item.activity_type.startsWith("comment.") || item.activity_type.startsWith("document.");
  if (tab === "status") return item.activity_type === "agent.liveness" || item.activity_type === "task.status_changed";
  return true;
}

export default function LiveFeed({ activities }: Props) {
  const [tab, setTab] = useState<FeedTab>("all");

  const filtered = useMemo(() => activities.filter((item) => matchesTab(item, tab)).slice(0, 60), [activities, tab]);

  const tabs: Array<{ key: FeedTab; label: string }> = [
    { key: "all", label: "All" },
    { key: "tasks", label: "Tasks" },
    { key: "comments", label: "Comments" },
    { key: "status", label: "Status" },
  ];

  return (
    <McPanel>
      <div className="mc-section-label" style={{ marginBottom: "12px" }}>
        Live Feed
      </div>
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`mc-tab-pill ${tab === item.key ? "active" : ""}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        style={{
          maxHeight: "65vh",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          overflowY: "auto",
          paddingRight: "4px",
        }}
      >
        {filtered.map((activity) => (
          <article
            key={activity.id}
            className="mc-rounded-input mc-border mc-bg-2"
            style={{ padding: "8px" }}
          >
            <p
              className="mc-text-faint"
              style={{
                fontSize: "10px",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                margin: 0,
              }}
            >
              {activity.activity_type}
            </p>
            <p className="mc-text-body" style={{ fontSize: "13px", margin: "2px 0 0" }}>
              {activity.summary}
            </p>
            <p className="mc-text-faint" style={{ fontSize: "11px", margin: "2px 0 0" }}>
              {new Date(activity.created_at).toLocaleString()}
            </p>
          </article>
        ))}
        {!filtered.length && (
          <p className="mc-text-faint" style={{ fontSize: "13px" }}>No activity yet.</p>
        )}
      </div>
    </McPanel>
  );
}

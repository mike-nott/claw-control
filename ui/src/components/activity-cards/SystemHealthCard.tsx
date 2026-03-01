import { McPill } from "../mc";
import type { ActivityCardProps } from "./index";

const STATUS_ICON: Record<string, string> = { ok: "\u2705", warning: "\u26A0\uFE0F", critical: "\u{1F6A8}" };

export default function SystemHealthCard({ detail }: ActivityCardProps) {
  const p = detail.payload || {};
  const servers = p.servers || {};
  const services = p.services || {};
  const issues = p.issues || [];

  return (
    <div className="space-y-3">
      {/* Issues banner */}
      {issues.length > 0 && (
        <div className="p-2.5 mc-alert-warning mc-rounded-inner">
          <p
            className="text-xs font-bold uppercase tracking-wide mb-1.5 mc-text-orange"
          >
            Issues
          </p>
          {issues.map((issue: Record<string, string>, i: number) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span>{issue.status === "critical" ? "\u{1F6A8}" : "\u26A0\uFE0F"}</span>
              <span className="font-medium">{issue.display_name}:</span>
              <span className="mc-text-muted">{issue.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Server cards */}
      {Object.keys(servers).length > 0 && (
        <div>
          <p
            className="text-xs font-bold uppercase tracking-wide mb-2 mc-text-faint"
          >
            {"\u{1F5A5}\uFE0F"} Infrastructure
          </p>
          <div className="grid gap-2 grid-cols-3">
            {Object.entries(servers).map(([name, _info]) => {
              const info = _info as Record<string, unknown>;
              return (
                <div
                  key={name}
                  className="p-2.5 mc-rounded-inner mc-bg-1 mc-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">{name}</span>
                    <span className="text-xs mc-text-ghost">{info.ip as string}</span>
                  </div>
                  {info.reachable ? (
                    <>
                      <div className="flex flex-wrap gap-2 text-xs mb-2">
                        <McPill variant="ghost" size="xs">CPU {(info.cpu_percent as number)?.toFixed(0)}%</McPill>
                        <McPill variant="ghost" size="xs">RAM {(info.ram_percent as number)?.toFixed(0)}%</McPill>
                        {info.disk ? (
                          <McPill
                            variant={Number((info.disk as Record<string, number>).percent) > 85 ? "warning" : "ghost"}
                            size="xs"
                          >
                            {`Disk ${(info.disk as Record<string, number>).percent}% (${(info.disk as Record<string, number>).free_gb?.toFixed(0)}GB free)`}
                          </McPill>
                        ) : null}
                      </div>
                      {(info.gpus as Array<Record<string, unknown>>)?.map((gpu: Record<string, unknown>) => (
                        <div key={gpu.id as string} className="flex items-center gap-2 text-xs mt-1 mc-text-muted">
                          <span className="font-medium">{(gpu.name as string)?.replace("NVIDIA GeForce ", "")}</span>
                          <McPill variant={(gpu.proc_percent as number) > 95 ? "error" : "success"} size="xs">
                            proc {(gpu.proc_percent as number)?.toFixed(0)}%
                          </McPill>
                          <McPill variant="ghost" size="xs">vram {(gpu.vram_percent as number)?.toFixed(0)}%</McPill>
                          <McPill variant={(gpu.temperature as number) > 80 ? "warning" : "ghost"} size="xs">
                            {String(gpu.temperature)}{"\u00B0"}C
                          </McPill>
                        </div>
                      ))}
                    </>
                  ) : (
                    <span className="text-xs mc-text-red">{"\u274C"} Unreachable</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Services grid */}
      {Object.keys(services).length > 0 && (
        <div>
          <p
            className="text-xs font-bold uppercase tracking-wide mb-2 mc-text-faint"
          >
            {"\u{1F527}"} Services
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(services).map(([, _svc]) => {
              const svc = _svc as Record<string, string>;
              return (
                <McPill
                  key={svc.display_name}
                  variant={svc.status === "ok" ? "ghost" : svc.status === "warning" ? "warning" : "error"}
                  size="xs"
                >
                  {STATUS_ICON[svc.status] || "\u2753"} {svc.display_name}
                </McPill>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

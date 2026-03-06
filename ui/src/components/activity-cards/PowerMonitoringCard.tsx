import { McPill } from "../mc";

/* ── Thresholds ─────────────────────────────────────────── */
const VOLTAGE_CRITICAL_LOW = 228;
const VOLTAGE_WARNING_LOW = 232;
const VOLTAGE_WARNING_HIGH = 245;
const UPS_LOAD_WARNING = 50;
const UPS_LOAD_CRITICAL = 75;
const TEMP_WARNING = 40;

/* ── Helpers ────────────────────────────────────────────── */
type Variant = "success" | "warning" | "error" | "ghost";

function voltageVariant(v: number): Variant {
  if (v < VOLTAGE_CRITICAL_LOW) return "error";
  if (v < VOLTAGE_WARNING_LOW) return "warning";
  if (v > VOLTAGE_WARNING_HIGH) return "warning";
  return "success";
}

function parseNum(v: string | number | undefined): number {
  return typeof v === "number" ? v : parseFloat(String(v ?? "0"));
}

function parseTemp(v: string | undefined): number {
  if (!v) return 0;
  return parseFloat(v.replace(/[^\d.]/g, ""));
}

/* ── Types ──────────────────────────────────────────────── */
type CircuitVoltages = {
  overall_min: number;
  overall_max: number;
  overall_avg: number;
  critical_count: number;
  warning_count: number;
};

type UpsEntry = {
  status: string;
  load: string;
  battery: string;
  input_voltage: string;
};

type ServerEntry = {
  voltage?: string;
  power?: string;
  uptime?: string;
  cpu?: string;
  memory?: string;
  gpu0_temp?: string;
  gpu1_temp?: string;
  gpu_temp?: string;
};

type MacStudioVoltage = {
  min: number;
  max: number;
  avg: number;
  unavailable_periods: number;
};

type PowerDetails = {
  circuit_voltages?: CircuitVoltages;
  ups_fleet?: Record<string, UpsEntry>;
  power_cuts_24h?: number;
  servers?: Record<string, ServerEntry>;
  mac_studio_voltage?: MacStudioVoltage;
  power_now?: Record<string, string>;
  rack_temps?: Record<string, string>;
};

type Props = {
  details: PowerDetails;
  status?: string;
  message?: string;
};

/* ── Section label ──────────────────────────────────────── */
function SectionLabel({ icon, label }: { icon: string; label: string }) {
  return (
    <p className="text-xs font-bold uppercase tracking-wide mb-2 mc-text-faint">
      {icon} {label}
    </p>
  );
}

/* ── Voltage Summary ────────────────────────────────────── */
function VoltageSummary({ cv }: { cv: CircuitVoltages }) {
  return (
    <div>
      <SectionLabel icon={"\u26A1"} label="Voltage (24h)" />
      <div className="flex flex-wrap gap-1.5">
        <McPill variant={voltageVariant(cv.overall_min)} size="xs">
          Min {cv.overall_min.toFixed(1)}V
        </McPill>
        <McPill variant={voltageVariant(cv.overall_avg)} size="xs">
          Avg {cv.overall_avg.toFixed(1)}V
        </McPill>
        <McPill variant={voltageVariant(cv.overall_max)} size="xs">
          Max {cv.overall_max.toFixed(1)}V
        </McPill>
        {cv.critical_count > 0 && (
          <McPill variant="error" size="xs">
            {cv.critical_count} critical
          </McPill>
        )}
        {cv.warning_count > 0 && (
          <McPill variant="warning" size="xs">
            {cv.warning_count} warning
          </McPill>
        )}
      </div>
    </div>
  );
}

/* ── UPS Fleet ──────────────────────────────────────────── */
function UpsFleet({ fleet }: { fleet: Record<string, UpsEntry> }) {
  return (
    <div>
      <SectionLabel icon={"\u{1F50B}"} label="UPS Fleet" />
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        {Object.entries(fleet).map(([name, ups]) => {
          const load = parseNum(ups.load);
          const battery = parseNum(ups.battery);
          const online = ups.status === "Online";
          const loadVariant: Variant =
            load > UPS_LOAD_CRITICAL ? "error" : load > UPS_LOAD_WARNING ? "warning" : "ghost";
          const batteryVariant: Variant = battery < 50 ? "error" : "ghost";

          return (
            <div key={name} className="p-2 mc-rounded-inner mc-bg-1 mc-border">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold truncate" title={name}>
                  {name}
                </span>
                <McPill variant={online ? "success" : "error"} size="xs">
                  {ups.status}
                </McPill>
              </div>
              <div className="flex flex-wrap gap-1">
                <McPill variant={loadVariant} size="xs">
                  Load {load}%
                </McPill>
                <McPill variant={batteryVariant} size="xs">
                  Bat {battery}%
                </McPill>
                <McPill variant="ghost" size="xs">
                  {ups.input_voltage}V
                </McPill>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Power Now ──────────────────────────────────────────── */
function PowerNow({ power }: { power: Record<string, string> }) {
  return (
    <div>
      <SectionLabel icon={"\u{1F50C}"} label="Power Now" />
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(power).map(([label, value]) => (
          <McPill key={label} variant="ghost" size="xs">
            {label}: {value}
          </McPill>
        ))}
      </div>
    </div>
  );
}

/* ── Mac Studio ─────────────────────────────────────────── */
function MacStudioSection({
  server,
  voltageRange,
}: {
  server?: ServerEntry;
  voltageRange?: MacStudioVoltage;
}) {
  if (!server && !voltageRange) return null;
  const currentV = server?.voltage ? parseNum(server.voltage) : undefined;
  const power = server?.power ? parseNum(server.power) : undefined;

  return (
    <div>
      <SectionLabel icon={"\u{1F4BB}"} label="Mac Studio" />
      <div className="p-2.5 mc-rounded-inner mc-bg-1 mc-border">
        <div className="flex flex-wrap gap-1.5">
          {currentV !== undefined && (
            <McPill variant={voltageVariant(currentV)} size="xs">
              {currentV.toFixed(1)}V
            </McPill>
          )}
          {power !== undefined && (
            <McPill variant="ghost" size="xs">
              {power.toFixed(1)}W
            </McPill>
          )}
          {server?.cpu && (
            <McPill variant="ghost" size="xs">CPU {server.cpu}%</McPill>
          )}
          {server?.memory && (
            <McPill variant="ghost" size="xs">RAM {server.memory}%</McPill>
          )}
        </div>
        {voltageRange && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <McPill variant={voltageVariant(voltageRange.min)} size="xs">
              24h Min {voltageRange.min.toFixed(1)}V
            </McPill>
            <McPill variant={voltageVariant(voltageRange.avg)} size="xs">
              24h Avg {voltageRange.avg.toFixed(1)}V
            </McPill>
            <McPill variant={voltageVariant(voltageRange.max)} size="xs">
              24h Max {voltageRange.max.toFixed(1)}V
            </McPill>
            {voltageRange.unavailable_periods > 0 && (
              <McPill variant="warning" size="xs">
                {voltageRange.unavailable_periods} unavailable period{voltageRange.unavailable_periods > 1 ? "s" : ""}
              </McPill>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Rack Temps ─────────────────────────────────────────── */
function RackTemps({ temps }: { temps: Record<string, string> }) {
  return (
    <div>
      <SectionLabel icon={"\u{1F321}\uFE0F"} label="Rack Temps" />
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(temps).map(([label, value]) => {
          const t = parseTemp(value);
          return (
            <McPill key={label} variant={t > TEMP_WARNING ? "warning" : "ghost"} size="xs">
              {label}: {value}
            </McPill>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main Card ──────────────────────────────────────────── */
export default function PowerMonitoringCard({ details, status, message }: Props) {
  const {
    circuit_voltages,
    ups_fleet,
    power_cuts_24h,
    servers,
    mac_studio_voltage,
    power_now,
    rack_temps,
  } = details;

  return (
    <div className="space-y-3">
      {/* Status banner */}
      {status && status !== "ok" && message && (
        <div
          className={`p-2.5 mc-rounded-inner ${
            status === "critical" ? "mc-alert-error" : "mc-alert-warning"
          }`}
        >
          <span className="text-sm">
            {status === "critical" ? "\u{1F6A8}" : "\u26A0\uFE0F"} {message}
          </span>
        </div>
      )}

      {/* Power Cuts banner — only if > 0 */}
      {(power_cuts_24h ?? 0) > 0 && (
        <div className="p-2.5 mc-rounded-inner mc-alert-error">
          <span className="text-sm font-bold">
            {"\u{1F6A8}"} {power_cuts_24h} power cut{power_cuts_24h! > 1 ? "s" : ""} in last 24h
          </span>
        </div>
      )}

      {circuit_voltages && <VoltageSummary cv={circuit_voltages} />}

      {ups_fleet && Object.keys(ups_fleet).length > 0 && <UpsFleet fleet={ups_fleet} />}

      {power_now && Object.keys(power_now).length > 0 && <PowerNow power={power_now} />}

      <MacStudioSection
        server={servers?.["Mac Studio"]}
        voltageRange={mac_studio_voltage}
      />

      {rack_temps && Object.keys(rack_temps).length > 0 && <RackTemps temps={rack_temps} />}
    </div>
  );
}

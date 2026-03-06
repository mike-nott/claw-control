import { useCallback, useSyncExternalStore } from "react";
import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Status" },
  { to: "/tasks", label: "Tasks" },
  { to: "/schedule", label: "Schedule" },
  { to: "/activity", label: "Activity" },
  { to: "/tokens", label: "Tokens" },
  { to: "/org", label: "Org Chart" },
  { to: "/agents", label: "Agents" },
  { to: "/teams", label: "Teams" },
  { to: "/projects", label: "Projects" },
  { to: "/federation", label: "Collaborate" },
];

/* ── Theme toggle hook ──────────────────────────── */

type Theme = "dark" | "light";

const THEME_KEY = "mc-theme";
const listeners = new Set<() => void>();

function getTheme(): Theme {
  return (document.documentElement.getAttribute("data-theme") as Theme) ?? "dark";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function applyTheme(next: Theme) {
  if (next === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem(THEME_KEY, next);
  listeners.forEach((cb) => cb());
}

function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme);
  const toggle = useCallback(() => {
    applyTheme(theme === "dark" ? "light" : "dark");
  }, [theme]);
  return { theme, toggle } as const;
}

/* ── SVG icons ──────────────────────────────────── */

function SunIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/* ── NavBar ─────────────────────────────────────── */

export default function NavBar() {
  const { theme, toggle } = useTheme();

  return (
    <header
      className="mb-4 flex items-center mc-bg-1 mc-border mc-rounded-card mc-shadow"
      style={{ padding: "14px 20px", position: "relative", overflow: "hidden" }}
    >
      {/* Gradient top bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "3px",
          background: "var(--mc-gradient-indigo)",
        }}
      />

      <div className="flex items-center gap-6">
        <h1
          className="mc-text-primary"
          style={{ fontSize: "18px", fontWeight: 700, margin: 0 }}
        >
          ClawControl
        </h1>
        <nav className="flex" style={{ gap: "4px" }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className="mc-nav-link"
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div style={{ flex: 1 }} />

      <button
        type="button"
        onClick={toggle}
        className="mc-btn mc-btn-ghost mc-text-muted"
        style={{ padding: "6px 8px", display: "flex", alignItems: "center" }}
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <MoonIcon /> : <SunIcon />}
      </button>
    </header>
  );
}

import type { ReactNode } from "react";

type Variant =
  | "success"
  | "warning"
  | "error"
  | "info"
  | "ghost"
  | "primary"
  | "purple"
  | "cyan"
  | "orange";

type Size = "xs" | "sm" | "md";

const SIZE_STYLES: Record<Size, { fontSize: string; padding: string }> = {
  xs: { fontSize: "8px", padding: "1px 6px" },
  sm: { fontSize: "9px", padding: "2px 8px" },
  md: { fontSize: "10px", padding: "3px 10px" },
};

type Props = {
  children: ReactNode;
  variant: Variant;
  size?: Size;
  className?: string;
};

export default function McPill({ children, variant, size = "sm", className = "" }: Props) {
  const s = SIZE_STYLES[size];

  return (
    <span
      className={`mc-pill-base mc-pill-${variant} ${className}`}
      style={{ fontSize: s.fontSize, padding: s.padding }}
    >
      {children}
    </span>
  );
}

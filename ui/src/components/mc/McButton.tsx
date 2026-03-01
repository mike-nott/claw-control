import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "outline" | "error";
type Size = "xs" | "sm" | "md";

const SIZE_STYLES: Record<Size, React.CSSProperties> = {
  xs: { fontSize: "11px", padding: "2px 8px" },
  sm: { fontSize: "12px", padding: "4px 12px" },
  md: { fontSize: "13px", padding: "6px 16px" },
};

type Props = {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "style">;

export default function McButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  ...rest
}: Props) {
  return (
    <button
      className={`mc-btn mc-btn-${variant} ${className}`}
      disabled={disabled}
      style={SIZE_STYLES[size]}
      {...rest}
    >
      {children}
    </button>
  );
}

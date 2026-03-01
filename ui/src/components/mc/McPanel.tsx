import type { ReactNode } from "react";

const PADDING = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
} as const;

type Props = {
  children: ReactNode;
  className?: string;
  padding?: keyof typeof PADDING;
  hover?: boolean;
};

export default function McPanel({ children, className = "", padding = "md", hover }: Props) {
  return (
    <div
      className={`mc-bg-1 mc-border mc-rounded-card mc-shadow ${hover ? "mc-hover-lift" : ""} ${PADDING[padding]} ${className}`}
    >
      {children}
    </div>
  );
}

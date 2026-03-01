import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
};

export default function McSectionTitle({ children, className = "" }: Props) {
  return (
    <div
      className={`mc-section-label ${className}`}
      style={{ marginBottom: "8px" }}
    >
      {children}
    </div>
  );
}

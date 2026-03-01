import type { ReactNode } from "react";
import McPanel from "./McPanel";

type Props = {
  children: ReactNode;
  className?: string;
};

export default function McFilterBar({ children, className = "" }: Props) {
  return (
    <McPanel padding="none" className={className}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "12px",
          padding: "12px 16px",
        }}
      >
        <span
          className="mc-text-faint"
          style={{
            fontSize: "12px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          Filter
        </span>
        {children}
      </div>
    </McPanel>
  );
}

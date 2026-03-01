import { forwardRef } from "react";
import type { SelectHTMLAttributes } from "react";

type Size = "sm" | "md";

const SIZE_STYLES: Record<Size, React.CSSProperties> = {
  sm: { fontSize: "12px", padding: "6px 12px" },
  md: { fontSize: "13px", padding: "8px 14px" },
};

type Props = {
  size?: Size;
  className?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "style" | "size">;

const McSelect = forwardRef<HTMLSelectElement, Props>(
  ({ size = "sm", className = "", ...rest }, ref) => {
    return (
      <select
        ref={ref}
        className={`mc-input-base ${className}`}
        style={{
          ...SIZE_STYLES[size],
          cursor: "pointer",
          WebkitAppearance: "none",
          appearance: "none" as const,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 10px center",
          paddingRight: "30px",
        }}
        {...rest}
      />
    );
  }
);

McSelect.displayName = "McSelect";

export default McSelect;

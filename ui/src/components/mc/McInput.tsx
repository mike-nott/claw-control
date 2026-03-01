import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

type Size = "sm" | "md";

const SIZE_STYLES: Record<Size, React.CSSProperties> = {
  sm: { fontSize: "13px", padding: "6px 12px" },
  md: { fontSize: "14px", padding: "8px 14px" },
};

type Props = {
  mcSize?: Size;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "style" | "size">;

const McInput = forwardRef<HTMLInputElement, Props>(
  ({ mcSize = "md", className = "", ...rest }, ref) => {
    return (
      <input
        ref={ref}
        className={`mc-input-base ${className}`}
        style={{ ...SIZE_STYLES[mcSize], width: "100%" }}
        {...rest}
      />
    );
  }
);

McInput.displayName = "McInput";

export default McInput;

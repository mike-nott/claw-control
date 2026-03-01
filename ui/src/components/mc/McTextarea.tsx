import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";

type Size = "sm" | "md";

const SIZE_STYLES: Record<Size, React.CSSProperties> = {
  sm: { fontSize: "13px", padding: "6px 12px" },
  md: { fontSize: "14px", padding: "8px 14px" },
};

type Props = {
  mcSize?: Size;
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "style">;

const McTextarea = forwardRef<HTMLTextAreaElement, Props>(
  ({ mcSize = "md", className = "", ...rest }, ref) => {
    return (
      <textarea
        ref={ref}
        className={`mc-input-base ${className}`}
        style={{
          ...SIZE_STYLES[mcSize],
          width: "100%",
          resize: "vertical",
          lineHeight: 1.5,
        }}
        {...rest}
      />
    );
  }
);

McTextarea.displayName = "McTextarea";

export default McTextarea;

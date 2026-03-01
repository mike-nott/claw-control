import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
};

export default function McModal({ open, onClose, title, children, actions }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        maxWidth: "min(32rem, 90vw)",
        width: "100%",
      }}
    >
      <div
        className="mc-bg-3 mc-border-strong mc-rounded-card mc-text-body"
        style={{ boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)" }}
      >
        {/* Header */}
        <div className="mc-border-bottom" style={{ padding: "16px 20px" }}>
          <h3
            className="mc-text-primary"
            style={{ fontSize: "16px", fontWeight: 700, margin: 0 }}
          >
            {title}
          </h3>
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px" }}>{children}</div>

        {/* Actions */}
        {actions && (
          <div
            className="mc-border-top"
            style={{
              padding: "12px 20px",
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
            }}
          >
            {actions}
          </div>
        )}
      </div>

      {/* Backdrop — closes on click */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: -1 }}
        onClick={onClose}
      />
    </dialog>
  );
}

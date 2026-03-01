import { useEffect, useState } from "react";

import { createBoard } from "../api";
import type { Board } from "../types";
import { McButton, McInput, McModal, McTextarea } from "./mc";

type Props = {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: (board: Board) => void;
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 600,
  marginBottom: "6px",
};

export default function CreateBoardModal({ open, projectId, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [position, setPosition] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setPosition(0);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const board = await createBoard(projectId, {
        name: name.trim(),
        description: description.trim() || null,
        position,
      });
      onCreated(board);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <McModal
      open={open}
      onClose={onClose}
      title="Create Board"
      actions={
        <>
          <McButton variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </McButton>
          <McButton
            onClick={() => void handleSubmit()}
            disabled={submitting || !name.trim()}
          >
            {submitting ? "Creating..." : "Create Board"}
          </McButton>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div>
          <label className="mc-text-muted" style={labelStyle}>Name</label>
          <McInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Board name"
            required
          />
        </div>

        <div>
          <label className="mc-text-muted" style={labelStyle}>Description</label>
          <McTextarea
            className="h-20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        <div>
          <label className="mc-text-muted" style={labelStyle}>Position</label>
          <McInput
            type="number"
            value={String(position)}
            onChange={(e) => setPosition(parseInt(e.target.value) || 0)}
            min={0}
          />
        </div>
      </div>
    </McModal>
  );
}

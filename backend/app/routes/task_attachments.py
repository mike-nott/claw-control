from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.utils.attachments import ATTACHMENT_ROOT, save_upload


router = APIRouter(prefix="/api/tasks/{task_id}/attachments", tags=["task_attachments"])


@router.get("", summary="List task attachments")
async def list_task_attachments(task_id: str, db: Session = Depends(get_db)) -> list[dict]:
    """List all file attachments for a task."""
    task_exists = db.execute(text("SELECT 1 FROM tasks WHERE id = :task_id"), {"task_id": task_id}).first()
    if not task_exists:
        raise HTTPException(status_code=404, detail="Task not found")

    rows = db.execute(
        text(
            """
            SELECT *
            FROM task_attachments
            WHERE task_id = :task_id
            ORDER BY created_at ASC
            """
        ),
        {"task_id": task_id},
    ).mappings().all()
    return [dict(row) for row in rows]


@router.post("", summary="Upload attachment")
async def upload_task_attachment(
    task_id: str,
    file: UploadFile = File(...),
    uploaded_by: str = Form(default="user"),
    db: Session = Depends(get_db),
) -> dict:
    """Upload a file attachment to a task. Max 20MB, restricted to common file types."""
    task_exists = db.execute(text("SELECT 1 FROM tasks WHERE id = :task_id"), {"task_id": task_id}).first()
    if not task_exists:
        raise HTTPException(status_code=404, detail="Task not found")

    meta = await save_upload(task_id, file)

    row = db.execute(
        text(
            """
            INSERT INTO task_attachments (id, task_id, filename, stored_filename, content_type, size_bytes, uploaded_by)
            VALUES (:id, :task_id, :filename, :stored_filename, :content_type, :size_bytes, :uploaded_by)
            RETURNING *
            """
        ),
        {
            "id": str(uuid4()),
            "task_id": task_id,
            "filename": meta["filename"],
            "stored_filename": meta["stored_filename"],
            "content_type": meta["content_type"],
            "size_bytes": meta["size_bytes"],
            "uploaded_by": uploaded_by,
        },
    ).mappings().one()

    db.commit()
    return dict(row)


@router.delete("/{attachment_id}", summary="Delete attachment")
async def delete_task_attachment(task_id: str, attachment_id: str, db: Session = Depends(get_db)) -> dict:
    """Delete a task attachment from both database and disk."""
    row = db.execute(
        text("SELECT * FROM task_attachments WHERE id = :id AND task_id = :task_id"),
        {"id": attachment_id, "task_id": task_id},
    ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Delete file from disk (with traversal check)
    file_path = ATTACHMENT_ROOT / task_id / row["stored_filename"]
    try:
        file_path.resolve().relative_to(ATTACHMENT_ROOT.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if file_path.is_file():
        file_path.unlink()

    db.execute(text("DELETE FROM task_attachments WHERE id = :id"), {"id": attachment_id})
    db.commit()

    return {"deleted": True}

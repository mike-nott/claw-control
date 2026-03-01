from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db, json_param
from app.events import broker
from app.federation_sync import push_comment
from app.schemas import CommentCreateIn
from app.utils.attachments import save_upload
from app.utils.sanitise import sanitise_text


router = APIRouter(prefix="/api/tasks/{task_id}/comments", tags=["comments"])


@router.get("", summary="List task comments")
async def list_comments(task_id: str, db: Session = Depends(get_db)) -> list[dict]:
    """Return all comments for a task, ordered by creation time ascending."""
    task_exists = db.execute(text("SELECT 1 FROM tasks WHERE id = :task_id"), {"task_id": task_id}).first()
    if not task_exists:
        raise HTTPException(status_code=404, detail="Task not found")

    rows = db.execute(
        text(
            """
            SELECT *
            FROM comments
            WHERE task_id = :task_id
            ORDER BY created_at ASC
            """
        ),
        {"task_id": task_id},
    ).mappings().all()
    return [dict(row) for row in rows]


@router.post("", summary="Add a comment")
async def create_comment(task_id: str, payload: CommentCreateIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)) -> dict:
    """Add a text comment to a task."""
    task_exists = db.execute(text("SELECT 1 FROM tasks WHERE id = :task_id"), {"task_id": task_id}).first()
    if not task_exists:
        raise HTTPException(status_code=404, detail="Task not found")

    comment = db.execute(
        text(
            """
            INSERT INTO comments (id, task_id, author_type, author_id, body)
            VALUES (:id, :task_id, :author_type, :author_id, :body)
            RETURNING *
            """
        ),
        {
            "id": str(uuid4()),
            "task_id": task_id,
            "author_type": payload.author_type,
            "author_id": payload.author_id,
            "body": sanitise_text(payload.body),
        },
    ).mappings().one()

    db.commit()

    result = dict(comment)
    await broker.publish("comment.created", result)

    # Push comment to federated instances (non-blocking)
    background_tasks.add_task(push_comment, task_id, str(result["id"]), db)

    return result


@router.post("/upload", summary="Add comment with attachment")
async def create_comment_with_attachment(
    task_id: str,
    file: UploadFile = File(...),
    body: str = Form(default=""),
    author_type: str = Form(default="human"),
    author_id: str = Form(default="user"),
    db: Session = Depends(get_db),
) -> dict:
    """Add a comment with a file attachment. The file is saved to disk and metadata stored in the comment."""
    task_exists = db.execute(text("SELECT 1 FROM tasks WHERE id = :task_id"), {"task_id": task_id}).first()
    if not task_exists:
        raise HTTPException(status_code=404, detail="Task not found")

    meta = await save_upload(task_id, file)

    attachment_meta = {
        "filename": meta["filename"],
        "path": meta["path"],
        "content_type": meta["content_type"],
        "size_bytes": meta["size_bytes"],
    }

    comment = db.execute(
        text(
            """
            INSERT INTO comments (id, task_id, author_type, author_id, body, attachment_json)
            VALUES (:id, :task_id, :author_type, :author_id, :body, :attachment_json)
            RETURNING *
            """
        ),
        {
            "id": str(uuid4()),
            "task_id": task_id,
            "author_type": author_type,
            "author_id": author_id,
            "body": sanitise_text(body),
            "attachment_json": json_param(attachment_meta),
        },
    ).mappings().one()

    db.commit()

    result = dict(comment)
    await broker.publish("comment.created", result)
    return result

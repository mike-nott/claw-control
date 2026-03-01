from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.settings import ATTACHMENT_ROOT
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".pdf", ".txt", ".md", ".csv", ".json",
    ".yaml", ".yml", ".zip",
}


async def save_upload(task_id: str, file: UploadFile) -> dict:
    """Validate and save an uploaded file. Returns attachment metadata dict."""
    filename = Path(file.filename or "unknown").name  # strip directory components
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=422, detail=f"File type {ext} not allowed")

    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=422, detail="File exceeds 20MB limit")

    file_id = str(uuid4())
    safe_filename = f"{file_id}_{filename}"
    dest_dir = ATTACHMENT_ROOT / task_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = dest_dir / safe_filename
    dest_path.write_bytes(data)

    return {
        "filename": filename,
        "stored_filename": safe_filename,
        "path": str(dest_path),
        "content_type": file.content_type or "application/octet-stream",
        "size_bytes": len(data),
    }

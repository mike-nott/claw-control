from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.utils.attachments import ATTACHMENT_ROOT


router = APIRouter(prefix="/api/attachments", tags=["attachments"])


@router.get("/{task_id}/{filename}", summary="Download attachment")
async def serve_attachment(task_id: str, filename: str) -> FileResponse:
    """Serve an attachment file for download. Prevents path traversal."""
    file_path = ATTACHMENT_ROOT / task_id / filename
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Prevent path traversal
    try:
        file_path.resolve().relative_to(ATTACHMENT_ROOT.resolve())
    except ValueError:
        raise HTTPException(status_code=404, detail="Attachment not found")

    return FileResponse(file_path, filename=filename)

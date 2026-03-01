"""Webhook management — register, list, update, and delete webhook subscriptions."""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.schemas import WebhookCreateIn, WebhookPatchIn

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


@router.get("", summary="List webhooks")
async def list_webhooks(db: Session = Depends(get_db)) -> list[dict]:
    """List all registered webhooks."""
    rows = db.execute(text("SELECT * FROM webhooks ORDER BY created_at")).mappings().all()
    return [dict(r) for r in rows]


@router.post("", summary="Register a webhook", status_code=201)
async def create_webhook(payload: WebhookCreateIn, db: Session = Depends(get_db)) -> dict:
    """Register a new webhook. Events is a comma-separated list like task.created,task.updated."""
    webhook_id = str(uuid4())
    row = db.execute(
        text(
            """
            INSERT INTO webhooks (id, url, events, secret)
            VALUES (:id, :url, :events, :secret)
            RETURNING *
            """
        ),
        {
            "id": webhook_id,
            "url": payload.url,
            "events": payload.events,
            "secret": payload.secret,
        },
    ).mappings().one()
    db.commit()
    return dict(row)


@router.patch("/{webhook_id}", summary="Update a webhook")
async def patch_webhook(webhook_id: str, payload: WebhookPatchIn, db: Session = Depends(get_db)) -> dict:
    """Update webhook URL, events, secret, or active status."""
    existing = db.execute(
        text("SELECT * FROM webhooks WHERE id = :id"),
        {"id": webhook_id},
    ).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Webhook not found")

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return dict(existing)

    # Convert bool active to int for SQLite
    if "active" in updates:
        updates["active"] = 1 if updates["active"] else 0

    set_clauses = []
    params = {"webhook_id": webhook_id}
    for key, value in updates.items():
        set_clauses.append(f"{key} = :{key}")
        params[key] = value

    row = db.execute(
        text(
            f"""
            UPDATE webhooks
            SET {', '.join(set_clauses)}
            WHERE id = :webhook_id
            RETURNING *
            """
        ),
        params,
    ).mappings().one()
    db.commit()
    return dict(row)


@router.delete("/{webhook_id}", summary="Delete a webhook")
async def delete_webhook(webhook_id: str, db: Session = Depends(get_db)) -> dict:
    """Delete a webhook registration."""
    existing = db.execute(
        text("SELECT * FROM webhooks WHERE id = :id"),
        {"id": webhook_id},
    ).mappings().first()
    if not existing:
        raise HTTPException(status_code=404, detail="Webhook not found")

    db.execute(text("DELETE FROM webhooks WHERE id = :id"), {"id": webhook_id})
    db.commit()
    return {"deleted": True, "id": webhook_id}

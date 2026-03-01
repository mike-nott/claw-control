"""Seed ClawControl with demo data so new users can see the UI in action.

Usage: cd backend && python seed.py
"""

from __future__ import annotations

import os
import sys
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv()

# Ensure app modules are importable
sys.path.insert(0, os.path.dirname(__file__))

from sqlalchemy import create_engine, text
from app.settings import DATABASE_URL


def main() -> None:
    connect_args = {}
    if DATABASE_URL.startswith("sqlite"):
        connect_args["check_same_thread"] = False
    engine = create_engine(DATABASE_URL, future=True, connect_args=connect_args)

    with engine.begin() as conn:
        # Check if data already exists
        count = conn.execute(text("SELECT COUNT(*) FROM tasks")).scalar()
        if count and count > 0:
            print(f"Database already has {count} task(s). Skipping seed.")
            print("To re-seed, clear existing data first.")
            return

        # --- Demo project with a board ---
        project_id = str(uuid4())
        board_id = str(uuid4())

        conn.execute(
            text(
                """
                INSERT INTO projects (id, name, description, status)
                VALUES (:id, :name, :description, 'active')
                """
            ),
            {
                "id": project_id,
                "name": "Home Automation",
                "description": "Smart home monitoring and automation tasks.",
            },
        )
        print("  Created project: Home Automation")

        conn.execute(
            text(
                """
                INSERT INTO boards (id, project_id, name, description, position)
                VALUES (:id, :project_id, :name, :description, 0)
                """
            ),
            {
                "id": board_id,
                "project_id": project_id,
                "name": "Sprint 1",
                "description": "Initial setup and configuration tasks.",
            },
        )
        print("  Created board: Sprint 1")

        # --- Demo tasks ---
        tasks = [
            {
                "id": str(uuid4()),
                "title": "Review front door camera alerts",
                "summary": "Check the last 24 hours of motion alerts and verify no false positives.",
                "domain": "security",
                "type": "review",
                "status": "inbox",
                "priority": "medium",
                "worker_kind": "openclaw_agent",
                "created_by": "system",
            },
            {
                "id": str(uuid4()),
                "title": "Optimise lighting schedule",
                "summary": "Adjust automated lighting times based on sunset data and usage patterns.",
                "domain": "home",
                "type": "task",
                "status": "in_progress",
                "priority": "low",
                "worker_kind": "openclaw_agent",
                "created_by": "system",
            },
            {
                "id": str(uuid4()),
                "title": "Update server health check thresholds",
                "summary": "CPU alert threshold is too sensitive. Raise from 70% to 85% to reduce noise.",
                "domain": "system",
                "type": "task",
                "status": "done",
                "priority": "high",
                "worker_kind": "openclaw_agent",
                "created_by": "system",
            },
        ]

        for task in tasks:
            conn.execute(
                text(
                    """
                    INSERT INTO tasks (id, title, summary, domain, type, status, priority,
                                       worker_kind, payload_json, created_by, project_id, board_id)
                    VALUES (:id, :title, :summary, :domain, :type, :status, :priority,
                            :worker_kind, '{}', :created_by, :project_id, :board_id)
                    """
                ),
                {**task, "project_id": project_id, "board_id": board_id},
            )
            print(f"  Created task: {task['title']} [{task['status']}]")

        # --- Demo activity log entries ---
        activity_entries = [
            {
                "id": str(uuid4()),
                "type": "security",
                "priority": "low",
                "source": "security-agent",
                "title": "Motion detected: front entrance",
                "summary": "Routine motion event. Identified as delivery driver.",
            },
            {
                "id": str(uuid4()),
                "type": "home",
                "priority": "low",
                "source": "home-agent",
                "title": "Climate report generated",
                "summary": "All rooms within target temperature range. No action needed.",
            },
            {
                "id": str(uuid4()),
                "type": "system",
                "priority": "medium",
                "source": "system-agent",
                "title": "Disk usage warning cleared",
                "summary": "Log rotation freed 2.3 GB. Disk usage back to 61%.",
            },
        ]

        for entry in activity_entries:
            conn.execute(
                text(
                    """
                    INSERT INTO activity_log (id, type, priority, source, title, summary, payload)
                    VALUES (:id, :type, :priority, :source, :title, :summary, '{}')
                    """
                ),
                entry,
            )
            print(f"  Created activity: {entry['title']}")

    print("")
    print("✅ Demo data seeded successfully!")
    print("   Start ClawControl with ./start.sh to see it in action.")


if __name__ == "__main__":
    print("🦞 Seeding ClawControl demo data...")
    print("")
    main()

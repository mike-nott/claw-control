from app.routes.activities import router as activities_router
from app.routes.activity_log import router as activity_log_router
from app.routes.agents import router as agents_router
from app.routes.attachments import router as attachments_router
from app.routes.comments import router as comments_router
from app.routes.escalations import router as escalations_router
from app.routes.federation import router as federation_router
from app.routes.health import router as health_router
from app.routes.projects import router as projects_router
from app.routes.schedules import router as schedules_router
from app.routes.stream import router as stream_router
from app.routes.task_attachments import router as task_attachments_router
from app.routes.tasks import router as tasks_router
from app.routes.teams import router as teams_router
from app.routes.tokens import router as tokens_router
from app.routes.webhooks import router as webhooks_router

__all__ = [
    "activities_router",
    "activity_log_router",
    "agents_router",
    "attachments_router",
    "comments_router",
    "escalations_router",
    "federation_router",
    "health_router",
    "projects_router",
    "schedules_router",
    "stream_router",
    "task_attachments_router",
    "tasks_router",
    "teams_router",
    "tokens_router",
    "webhooks_router",
]

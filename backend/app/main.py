"""FastAPI application entry point — Klaser Meetings backend.

No SessionMiddleware here, unlike a typical FastAPI app with local auth —
this service never decodes a session itself. It only ever forwards the
`klaser_session` cookie it receives to klaser-identity's `/api/introspect`
(see app/services/identity.py). See docs referenced in README.md for the
full architecture.
"""
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import (
    action_items,
    dashboard,
    decisions,
    health,
    meetings,
    members,
    participants,
    rsvp,
    saved_dates,
    topic_pool,
)
from app.routes import settings as settings_routes

log = structlog.get_logger()

app = FastAPI(
    title="Klaser Meetings",
    description="Klaser Meetings — backend",
    version="0.1.0",
)

# CORS — allow_credentials is required so the shared klaser_session cookie
# is actually sent on cross-subdomain requests from the product frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])
app.include_router(topic_pool.router, prefix="/api/topic-pool", tags=["topic-pool"])
app.include_router(members.router, prefix="/api/members", tags=["members"])
app.include_router(participants.router, prefix="/api/participants", tags=["participants"])
app.include_router(saved_dates.router, prefix="/api/saved-dates", tags=["saved-dates"])
app.include_router(decisions.router, prefix="/api/decisions", tags=["decisions"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(action_items.router, prefix="/api/action-items", tags=["action-items"])
app.include_router(rsvp.router, prefix="/api/public/rsvp", tags=["rsvp"])
app.include_router(settings_routes.router, prefix="/api/tenant-settings", tags=["tenant-settings"])


@app.on_event("startup")
async def startup() -> None:
    log.info(
        "meetings.startup",
        env=settings.app_env,
        identity_url=settings.identity_url,
    )

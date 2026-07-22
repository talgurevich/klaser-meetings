"""Home-page dashboard — one aggregated read rather than five separate
round-trips from the frontend. Every piece here is derived from data that
already exists elsewhere (meetings, topics, saved dates); this route adds
no new write paths.
"""
import datetime as dt
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Meeting, SavedDate, Topic
from app.schemas import DashboardMeetingItem, DashboardOut, MeetingListItem, SavedDateOut
from app.services.identity import IdentityUser, require_entitlement
from app.services.meeting_utils import generate_meeting_number

router = APIRouter()

# A meeting still in this set hasn't been published/archived yet — "still
# being worked on," the candidate for the "continue to meeting" banner.
_UNFINISHED_STATUSES = (
    "draft",
    "invited_internal",
    "invited_public",
    "active",
    "pending_approval",
    "approved",
)
# The "continue to meeting" banner prefers a meeting that has moved past
# the draft stage (invited/active/approval) over a bare draft. Within each
# group it prefers the nearest upcoming meeting (date >= today), and if
# there's none upcoming it falls back to the most recent past one that's
# still unfinished — so a meeting you're mid-way through doesn't drop off
# the banner just because its date has passed.
_PAST_DRAFT_STATUSES = tuple(s for s in _UNFINISHED_STATUSES if s != "draft")
# Only these count as "officially on the calendar" for the upcoming-
# meeting card — a bare draft hasn't been invited to anyone yet, so it
# isn't really "coming up" in the sense a member would expect.
_SCHEDULED_STATUSES = ("invited_internal", "invited_public", "active")
_PROTOCOL_STATUSES = ("published", "archived")

_RECENT_PROTOCOLS_LIMIT = 5
_SAVED_DATES_LIMIT = 5


@router.get("", response_model=DashboardOut)
def get_dashboard(
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> DashboardOut:
    tenant_id = UUID(user.tenant_id)
    today = dt.date.today()

    def _pick(statuses: tuple[str, ...]) -> Meeting | None:
        base = select(Meeting).where(
            Meeting.tenant_id == tenant_id, Meeting.status.in_(statuses)
        )
        # Nearest upcoming (incl. today) first...
        upcoming = db.execute(
            base.where(Meeting.date >= today).order_by(Meeting.date).limit(1)
        ).scalar_one_or_none()
        if upcoming is not None:
            return upcoming
        # ...otherwise the most recent still-unfinished past meeting.
        return db.execute(
            base.where(Meeting.date < today).order_by(Meeting.date.desc()).limit(1)
        ).scalar_one_or_none()

    # Prefer a meeting past the draft stage; fall back to a draft only if
    # there's no unfinished non-draft meeting at all.
    continuing = _pick(_PAST_DRAFT_STATUSES) or _pick(("draft",))
    continuing_out = None
    if continuing is not None:
        display_number = continuing.number or generate_meeting_number(
            db, tenant_id=tenant_id, kind=continuing.kind, on=continuing.date
        )
        continuing_out = DashboardMeetingItem(
            id=continuing.id,
            kind=continuing.kind,
            number=continuing.number,
            display_number=display_number,
            title=continuing.title,
            date=continuing.date,
            time_start=continuing.time_start,
            location=continuing.location,
            status=continuing.status,
            created_at=continuing.created_at,
        )

    upcoming = db.execute(
        select(Meeting)
        .where(
            Meeting.tenant_id == tenant_id,
            Meeting.status.in_(_SCHEDULED_STATUSES),
            Meeting.date >= today,
        )
        .order_by(Meeting.date)
        .limit(1)
    ).scalar_one_or_none()

    saved_dates = list(
        db.execute(
            select(SavedDate)
            .where(SavedDate.tenant_id == tenant_id, SavedDate.date >= today)
            .order_by(SavedDate.date)
            .limit(_SAVED_DATES_LIMIT)
        )
        .scalars()
        .all()
    )

    protocols_count = db.execute(
        select(func.count())
        .select_from(Meeting)
        .where(Meeting.tenant_id == tenant_id, Meeting.status.in_(_PROTOCOL_STATUSES))
    ).scalar_one()

    # "Open" action items: any topic with a follow-up task that hasn't been
    # marked done (see Topic.action_item_done, app/routes/action_items.py's
    # tenant-wide list), on a meeting that hasn't been archived yet.
    open_action_items_count = db.execute(
        select(func.count())
        .select_from(Topic)
        .join(Meeting, Topic.meeting_id == Meeting.id)
        .where(
            Topic.tenant_id == tenant_id,
            Topic.action_item.isnot(None),
            Topic.action_item != "",
            Topic.action_item_done.is_(False),
            Meeting.status != "archived",
        )
    ).scalar_one()

    recent_protocols = list(
        db.execute(
            select(Meeting)
            .where(Meeting.tenant_id == tenant_id, Meeting.status.in_(_PROTOCOL_STATUSES))
            .order_by(Meeting.date.desc())
            .limit(_RECENT_PROTOCOLS_LIMIT)
        )
        .scalars()
        .all()
    )

    return DashboardOut(
        continuing_meeting=continuing_out,
        upcoming_meeting=MeetingListItem.model_validate(upcoming) if upcoming else None,
        saved_dates=[SavedDateOut.model_validate(sd) for sd in saved_dates],
        protocols_count=protocols_count,
        open_action_items_count=open_action_items_count,
        recent_protocols=[MeetingListItem.model_validate(m) for m in recent_protocols],
    )

"""Search across recorded decisions (Topic.decision_text) within this
tenant's own meetings — a local search feature, distinct from Takanon's
bylaws/decisions search (a different product, different data entirely).

Same private-topic visibility rule as everywhere else in this codebase
(see app/routes/meetings.py's _visible_topics docstring): non-editors
never see is_private topics, enforced at the query boundary here rather
than filtered client-side.
"""
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Meeting, Topic
from app.schemas import DecisionSearchResult
from app.services.identity import IdentityUser, require_entitlement
from app.services.permissions import is_editor

router = APIRouter()

_MAX_RESULTS = 50


@router.get("/search", response_model=list[DecisionSearchResult])
def search_decisions(
    q: str = "",
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[DecisionSearchResult]:
    query = q.strip()
    if not query:
        return []

    stmt = (
        select(Topic, Meeting)
        .join(Meeting, Topic.meeting_id == Meeting.id)
        .where(
            Topic.tenant_id == UUID(user.tenant_id),
            Topic.decision_text.isnot(None),
            Topic.decision_text.ilike(f"%{query}%"),
        )
    )
    if not is_editor(user):
        stmt = stmt.where(Topic.is_private.is_(False))
    stmt = stmt.order_by(Meeting.date.desc()).limit(_MAX_RESULTS)

    rows = db.execute(stmt).all()
    return [
        DecisionSearchResult(
            meeting_id=meeting.id,
            meeting_kind=meeting.kind,
            meeting_number=meeting.number,
            meeting_date=meeting.date,
            topic_id=topic.id,
            topic_title=topic.title,
            decision_text=topic.decision_text or "",
        )
        for topic, meeting in rows
    ]

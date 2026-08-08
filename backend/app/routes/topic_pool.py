"""Topic pool — the backlog of candidate agenda topics (manual or publicly
suggested) that feed meeting agendas.

Creation is open to any authenticated + entitled user, and topics are
available immediately — there's no approval step (they land as
status="approved"). Non-editors still can't delete or reprioritise. A
topic may carry אלפון contacts (Participant ids in invited_guests) that
get invited to the meeting when the topic is added to one (see
meetings.py add_topic).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Meeting, Topic, TopicPool
from app.schemas import (
    ScheduledMeetingRef,
    TopicPoolCreate,
    TopicPoolOut,
    TopicPoolUpdate,
)
from app.services.identity import IdentityUser, require_entitlement
from app.services.permissions import is_editor, require_editor

router = APIRouter()

_PUBLICLY_VISIBLE_STATUSES = ("approved", "in_meeting")


@router.get("", response_model=list[TopicPoolOut])
def list_topic_pool(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[TopicPoolOut]:
    stmt = select(TopicPool).where(TopicPool.tenant_id == UUID(user.tenant_id))
    if not is_editor(user):
        stmt = stmt.where(TopicPool.status.in_(_PUBLICLY_VISIBLE_STATUSES))
    elif status:
        stmt = stmt.where(TopicPool.status == status)
    stmt = stmt.order_by(TopicPool.priority.desc().nulls_last(), TopicPool.created_at.desc())
    items = list(db.execute(stmt).scalars().all())

    # Enrich each pool topic with the meeting it was scheduled into (the linked
    # Topic's meeting) and any outcome recorded there — decision / follow-up /
    # notes. A topic scheduled more than once keeps its most recent placement.
    pool_ids = [i.id for i in items]
    latest_by_pool: dict[UUID, tuple[Topic, Meeting]] = {}
    if pool_ids:
        rows = db.execute(
            select(Topic, Meeting)
            .join(Meeting, Topic.meeting_id == Meeting.id)
            .where(Topic.source_pool_id.in_(pool_ids))
            .order_by(Topic.created_at.asc())
        ).all()
        for topic, meeting in rows:
            latest_by_pool[topic.source_pool_id] = (topic, meeting)  # last wins = most recent

    out: list[TopicPoolOut] = []
    for item in items:
        o = TopicPoolOut.model_validate(item)
        pair = latest_by_pool.get(item.id)
        if pair is not None:
            topic, meeting = pair
            o.scheduled_meeting = ScheduledMeetingRef(
                id=meeting.id,
                kind=meeting.kind,
                number=meeting.number,
                title=meeting.title,
                date=meeting.date,
                status=meeting.status,
            )
            o.scheduled_decision = topic.decision_text
            o.scheduled_action_item = topic.action_item
            o.scheduled_notes = topic.topic_notes
        out.append(o)
    return out


@router.post("", response_model=TopicPoolOut, status_code=201)
def suggest_topic(
    body: TopicPoolCreate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> TopicPool:
    topic = TopicPool(
        tenant_id=UUID(user.tenant_id),
        title=body.title,
        description=body.description,
        duration_minutes=body.duration_minutes,
        invited_guests=body.invited_guests,
        priority=body.priority,
        source="manual",
        # No approval workflow — topics are available in the pool
        # immediately (was "pending_review").
        status="approved",
        suggested_by=UUID(user.user_id),
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


@router.patch("/{topic_id}", response_model=TopicPoolOut)
def update_topic_pool_item(
    topic_id: UUID,
    body: TopicPoolUpdate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> TopicPool:
    topic = db.execute(
        select(TopicPool).where(TopicPool.id == topic_id, TopicPool.tenant_id == UUID(user.tenant_id))
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="הנושא לא נמצא")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(topic, field, value)

    db.commit()
    db.refresh(topic)
    return topic


@router.delete("/{topic_id}", status_code=204)
def delete_topic_pool_item(
    topic_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> None:
    topic = db.execute(
        select(TopicPool).where(TopicPool.id == topic_id, TopicPool.tenant_id == UUID(user.tenant_id))
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="הנושא לא נמצא")
    db.delete(topic)
    db.commit()

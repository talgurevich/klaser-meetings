"""Topic pool — the backlog of candidate agenda topics (manual or publicly
suggested) that feed meeting agendas.

Read visibility mirrors the original spec's RLS rule: editors see every
status; everyone else only sees topics already approved/in_meeting.
Creation is open to any authenticated + entitled user so members can
suggest topics — but a non-editor's submission is always forced to
source="public_suggestion" / status="pending_review", never able to
self-approve.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import TopicPool
from app.schemas import TopicPoolCreate, TopicPoolOut, TopicPoolUpdate
from app.services.identity import IdentityUser, require_entitlement
from app.services.permissions import is_editor, require_editor

router = APIRouter()

_PUBLICLY_VISIBLE_STATUSES = ("approved", "in_meeting")


@router.get("", response_model=list[TopicPoolOut])
def list_topic_pool(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[TopicPool]:
    stmt = select(TopicPool).where(TopicPool.tenant_id == UUID(user.tenant_id))
    if not is_editor(user):
        stmt = stmt.where(TopicPool.status.in_(_PUBLICLY_VISIBLE_STATUSES))
    elif status:
        stmt = stmt.where(TopicPool.status == status)
    stmt = stmt.order_by(TopicPool.priority.desc().nulls_last(), TopicPool.created_at.desc())
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=TopicPoolOut, status_code=201)
def suggest_topic(
    body: TopicPoolCreate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> TopicPool:
    editor = is_editor(user)
    topic = TopicPool(
        tenant_id=UUID(user.tenant_id),
        title=body.title,
        description=body.description,
        duration_minutes=body.duration_minutes,
        invited_guests=body.invited_guests,
        priority=body.priority if editor else None,
        # Non-editors can never self-approve or set source — always land
        # as a pending public suggestion regardless of what they send.
        source="manual" if editor else "public_suggestion",
        status="pending_review",
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

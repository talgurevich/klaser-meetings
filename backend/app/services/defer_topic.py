"""Defer to next meeting — a topic that didn't get discussed is queued and
carried onto the *next meeting created* of the same kind (not a pre-existing
one). Deferring just marks the source topic as waiting; when a new meeting
is created, pull_deferred_topics appends a fresh copy of every queued topic
to it (see routes/meetings.py create_meeting). A deferred topic's אלפון
guests are re-invited to that meeting by the caller.

Also home to undo_defer_topic — the reverse operation: restore the source
and delete the pulled copy if one was already created and is still
untouched (see its docstring).
"""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Meeting, Topic


def defer_topic_to_next_meeting(db: Session, *, topic: Topic) -> None:
    """Queue `topic` for the next meeting created after this one. Marks it
    deferred with no target yet; pull_deferred_topics places it when a new
    same-kind meeting is created. No copy is made here."""
    topic.status = "deferred"
    topic.deferred_to_meeting_id = None


def pull_deferred_topics(db: Session, *, new_meeting: Meeting, start_order: int) -> list[Topic]:
    """Append a fresh copy of every queued deferred topic (status
    'deferred', no target yet) of the same kind onto a just-created meeting,
    and point each source topic at it. Returns the created copies so the
    caller can re-invite their guests."""
    pending = (
        db.execute(
            select(Topic)
            .join(Meeting, Topic.meeting_id == Meeting.id)
            .where(
                Topic.tenant_id == new_meeting.tenant_id,
                Topic.status == "deferred",
                Topic.deferred_to_meeting_id.is_(None),
                Meeting.kind == new_meeting.kind,
                Meeting.id != new_meeting.id,
            )
        )
        .scalars()
        .all()
    )
    created: list[Topic] = []
    order = start_order
    for src in pending:
        copy = Topic(
            tenant_id=new_meeting.tenant_id,
            meeting_id=new_meeting.id,
            order=order,
            title=src.title,
            description=src.description,
            duration_minutes=src.duration_minutes,
            is_private=src.is_private,
            source_pool_id=src.source_pool_id,
            suggested_by=src.suggested_by,
            invited_guests=src.invited_guests,
            deferred_from_topic_id=src.id,
            # Discussion state (decision_text, action_item, timer_elapsed,
            # topic_notes) belongs to the meeting that didn't happen yet —
            # not carried onto the fresh copy.
        )
        db.add(copy)
        order += 1
        src.deferred_to_meeting_id = new_meeting.id
        created.append(copy)
    db.flush()
    return created


class UndoDeferBlockedError(Exception):
    """Raised when the pulled copy has already been acted on — reverting
    would silently discard real discussion, so the caller should turn this
    into a 409 instead."""


def undo_defer_topic(db: Session, *, tenant_id: UUID, topic: Topic) -> Topic:
    """Reverse a defer: restore the source topic to 'pending'. If it had
    already been pulled onto a later meeting, delete that copy too — but
    only if the copy is still untouched (status still 'pending'); otherwise
    block. A topic still queued (never pulled) has no copy to remove."""
    if topic.status != "deferred":
        raise ValueError("topic was not deferred")

    copy = db.execute(
        select(Topic).where(
            Topic.tenant_id == tenant_id,
            Topic.deferred_from_topic_id == topic.id,
        )
    ).scalar_one_or_none()

    if copy is not None:
        if copy.status != "pending":
            raise UndoDeferBlockedError("the deferred copy has already been acted on")
        db.delete(copy)

    topic.status = "pending"
    topic.deferred_to_meeting_id = None
    return topic

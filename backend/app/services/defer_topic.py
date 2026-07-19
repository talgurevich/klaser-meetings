"""Defer to next meeting — move a topic that didn't get discussed onto
the next upcoming, still-open meeting of the same kind. Mirrors the
original app's moveTopicToNextMeeting.js (findNextOpenMeeting +
appendTopicToMeeting), reimplemented as a single DB transaction here
instead of two separate client-driven writes — avoids a window where the
source topic is marked deferred but the target append fails (or vice
versa).

Also home to undo_defer_topic — the reverse operation, deleting the copy
and restoring the source, gated on the copy still being untouched (see
its own docstring for the exact safety check).
"""
import datetime as dt
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Meeting, Topic

# A meeting only counts as a valid defer target while its agenda is still
# being assembled/invited — once it goes active there's no more room to
# silently append topics without whoever's running it noticing.
_OPEN_STATUSES = ("draft", "invited_internal", "invited_public")


def find_next_open_meeting(
    db: Session, *, tenant_id: UUID, kind: str, on_or_after: dt.date, exclude_meeting_id: UUID
) -> Meeting | None:
    return db.execute(
        select(Meeting)
        .where(
            Meeting.tenant_id == tenant_id,
            Meeting.kind == kind,
            Meeting.status.in_(_OPEN_STATUSES),
            Meeting.date >= on_or_after,
            Meeting.id != exclude_meeting_id,
        )
        .order_by(Meeting.date.asc(), Meeting.time_start.asc().nulls_last())
        .limit(1)
    ).scalar_one_or_none()


def defer_topic_to_next_meeting(db: Session, *, source_meeting: Meeting, topic: Topic) -> Topic:
    """Find the next open meeting and append a fresh copy of `topic` to it,
    then mark the source topic as deferred pointing at the target. Returns
    the newly created topic on the target meeting.

    Raises LookupError if there's no open meeting to defer into — the
    caller is responsible for turning that into a 409.
    """
    target = find_next_open_meeting(
        db,
        tenant_id=source_meeting.tenant_id,
        kind=source_meeting.kind,
        on_or_after=source_meeting.date,
        exclude_meeting_id=source_meeting.id,
    )
    if target is None:
        raise LookupError("no open meeting to defer into")

    new_topic = Topic(
        tenant_id=target.tenant_id,
        meeting_id=target.id,
        order=len(target.topics),
        title=topic.title,
        description=topic.description,
        duration_minutes=topic.duration_minutes,
        is_private=topic.is_private,
        source_pool_id=topic.source_pool_id,
        suggested_by=topic.suggested_by,
        invited_guests=topic.invited_guests,
        deferred_from_topic_id=topic.id,
        # Deliberately NOT carried over: status, decision_text,
        # action_item, timer_elapsed, topic_notes — those belong to the
        # discussion that didn't happen yet, not to the fresh copy.
    )
    db.add(new_topic)
    db.flush()  # assign new_topic.id before the source topic points at it

    topic.status = "deferred"
    topic.deferred_to_meeting_id = target.id

    return new_topic


class UndoDeferBlockedError(Exception):
    """Raised when the copy on the target meeting has already been acted
    on — reverting would silently discard real discussion, so the caller
    should turn this into a 409 instead."""


def undo_defer_topic(db: Session, *, tenant_id: UUID, topic: Topic) -> Topic:
    """Reverse a defer: delete the copy it created (only if that copy is
    still untouched — status still "pending", nothing recorded on it yet)
    and restore the source topic to "pending". If the copy was already
    deleted some other way (or never found — e.g. hand-edited data),
    the source is still restored; there's nothing left to clean up."""
    if topic.status != "deferred" or topic.deferred_to_meeting_id is None:
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

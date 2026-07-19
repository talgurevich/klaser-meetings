"""Tenant-wide משימות לביצוע list — every non-empty Topic.action_item
across all of this tenant's meetings, in one place, with a completion
flag and delete.

Deliberately NOT routed through the generic topic-update endpoint
(app/routes/meetings.py's update_topic): that endpoint is used for lots
of other partial edits during a live meeting (timer_elapsed, decision
text, etc.) and firing an email on every one of those would be noise.

Notifying the meeting's invitees when a task is marked done or deleted is
opt-in per action (see ActionItemUpdate.notify / the `notify` query param
on delete) — the caller explicitly asks for it, nothing is emailed
silently. When asked for, it reuses the same MeetingInvite rows and mail
service the invite/RSVP flow already built (see app/services/mail.py).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Meeting, Topic
from app.schemas import ActionItemOut, ActionItemUpdate
from app.services import mail
from app.services.identity import IdentityUser, require_entitlement
from app.services.permissions import require_editor

router = APIRouter()


def _get_task_or_404(db: Session, topic_id: UUID, tenant_id: UUID) -> tuple[Topic, Meeting]:
    row = db.execute(
        select(Topic, Meeting)
        .join(Meeting, Topic.meeting_id == Meeting.id)
        .where(Topic.id == topic_id, Topic.tenant_id == tenant_id)
    ).first()
    if row is None or not row[0].action_item:
        raise HTTPException(status_code=404, detail="המשימה לא נמצאה.")
    return row


def _to_out(topic: Topic, meeting: Meeting) -> ActionItemOut:
    return ActionItemOut(
        topic_id=topic.id,
        meeting_id=meeting.id,
        meeting_kind=meeting.kind,
        meeting_number=meeting.number,
        meeting_date=meeting.date,
        topic_title=topic.title,
        action_item=topic.action_item or "",
        action_item_done=topic.action_item_done,
    )


def _notify_invitees(
    meeting: Meeting, user: IdentityUser, topic_title: str, action_item: str, event: str
) -> None:
    for invite in meeting.invites:
        mail.send_action_item_update(
            to_email=invite.email,
            recipient_name=invite.display_name or invite.email,
            tenant_name=user.tenant_name or "",
            meeting_kind=meeting.kind,
            meeting_number=meeting.number,
            meeting_date=meeting.date.isoformat(),
            topic_title=topic_title,
            action_item_text=action_item,
            event=event,
        )


@router.get("", response_model=list[ActionItemOut])
def list_action_items(
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[ActionItemOut]:
    tenant_id = UUID(user.tenant_id)
    rows = db.execute(
        select(Topic, Meeting)
        .join(Meeting, Topic.meeting_id == Meeting.id)
        .where(
            Topic.tenant_id == tenant_id,
            Topic.action_item.isnot(None),
            Topic.action_item != "",
        )
        .order_by(Topic.action_item_done, Meeting.date.desc())
    ).all()
    return [_to_out(topic, meeting) for topic, meeting in rows]


@router.patch("/{topic_id}", response_model=ActionItemOut)
def update_action_item(
    topic_id: UUID,
    body: ActionItemUpdate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> ActionItemOut:
    topic, meeting = _get_task_or_404(db, topic_id, UUID(user.tenant_id))
    topic.action_item_done = body.done
    db.commit()
    db.refresh(topic)
    if body.notify:
        event = "done" if body.done else "reopened"
        _notify_invitees(meeting, user, topic.title, topic.action_item or "", event)
    return _to_out(topic, meeting)


@router.delete("/{topic_id}", status_code=204)
def delete_action_item(
    topic_id: UUID,
    notify: bool = False,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> None:
    topic, meeting = _get_task_or_404(db, topic_id, UUID(user.tenant_id))
    action_item = topic.action_item or ""
    topic.action_item = None
    topic.action_item_done = False
    db.commit()
    if notify:
        _notify_invitees(meeting, user, topic.title, action_item, "deleted")

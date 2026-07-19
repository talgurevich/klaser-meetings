"""Public RSVP endpoints — no identity session at all, deliberately.

Possession of the unguessable `token` (see app/models.py's MeetingInvite)
is the entire auth model here, same category as klaser-identity's
registration/password-reset tokens but self-contained in this service:
Meetings owns invite/RSVP data end to end, no cross-service session needed
just to let someone click "I'll attend" from an email.

Mounted at /api/public/rsvp — never behind require_entitlement/current_user,
and never returns anything beyond what an anonymous recipient should see
(no tenant_id, no other invitees, no private topics).
"""
import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
from app.models import Meeting, MeetingInvite
from app.schemas import InvitePreviewTopic, RsvpMeetingOut, RsvpSubmitRequest
from app.services.identity import identity_service

router = APIRouter()

_VALID_RESPONSES = ("confirmed_attend", "confirmed_absent")


def _get_invite_or_404(db: Session, token: str) -> MeetingInvite:
    invite = db.execute(
        select(MeetingInvite)
        .where(MeetingInvite.token == token)
        .options(selectinload(MeetingInvite.meeting).selectinload(Meeting.topics))
    ).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="ההזמנה לא נמצאה או שפג תוקפה")
    return invite


def _tenant_name(tenant_id: str) -> str:
    try:
        return identity_service.get_tenant(tenant_id).get("name", "")
    except Exception:  # noqa: BLE001 — identity being unreachable shouldn't break the RSVP page
        return ""


def _to_out(invite: MeetingInvite) -> RsvpMeetingOut:
    meeting = invite.meeting
    topics = [
        InvitePreviewTopic(title=t.title, duration_minutes=t.duration_minutes)
        for t in sorted(meeting.topics, key=lambda t: t.order)
        if not t.is_private
    ]
    return RsvpMeetingOut(
        recipient_name=invite.display_name or invite.email,
        status=invite.status,
        tenant_name=_tenant_name(str(meeting.tenant_id)),
        meeting_kind=meeting.kind,
        meeting_number=meeting.number,
        meeting_date=meeting.date,
        time_start=meeting.time_start,
        time_end=meeting.time_end,
        location=meeting.location,
        topics=topics,
    )


@router.get("/{token}", response_model=RsvpMeetingOut)
def get_rsvp(token: str, db: Session = Depends(get_db)) -> RsvpMeetingOut:
    invite = _get_invite_or_404(db, token)
    return _to_out(invite)


@router.post("/{token}", response_model=RsvpMeetingOut)
def submit_rsvp(token: str, body: RsvpSubmitRequest, db: Session = Depends(get_db)) -> RsvpMeetingOut:
    if body.response not in _VALID_RESPONSES:
        raise HTTPException(status_code=400, detail="תגובה לא תקינה")
    invite = _get_invite_or_404(db, token)

    invite.status = body.response
    invite.responded_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    db.refresh(invite)
    return _to_out(invite)

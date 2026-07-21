"""Meeting + topic CRUD.

Every route is entitlement-gated (`require_entitlement("meetings")` /
`require_editor()`) and every query is scoped by `user.tenant_id` — see
app/services/identity.py and app/services/permissions.py. This module owns
no auth state of its own; `user.tenant_id` / `user.user_id` are plain UUIDs
sourced from klaser-identity on every request (see identity-cutover.md).
"""
import datetime as dt
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.db import get_db
from app.models import Meeting, MeetingInvite, Participant, TenantSettings, Topic, TopicPool
from app.schemas import (
    InviteeRef,
    InvitePreviewOut,
    InvitePreviewTopic,
    MeetingCreate,
    MeetingInviteOut,
    MeetingListItem,
    MeetingOut,
    MeetingUpdate,
    TopicCreate,
    TopicOut,
    TopicReorderItem,
    TopicUpdate,
)
from app.services import mail
from app.services.defer_topic import (
    UndoDeferBlockedError,
    defer_topic_to_next_meeting,
    undo_defer_topic,
)
from app.services.identity import IdentityUser, identity_service, require_entitlement
from app.services.meeting_utils import generate_meeting_number
from app.services.permissions import is_editor, require_admin, require_editor

router = APIRouter()

# Sentinel order for the pinned "last" recurring topic (see
# _seed_recurring_topics) — high enough that any number of ordinarily
# added topics (which get order=len(meeting.topics), see add_topic) will
# always sort before it, without needing to renumber anything on insert.
_DEFAULT_LAST_TOPIC_ORDER = 1_000_000


def _seed_recurring_topics(db: Session, meeting: Meeting, tenant_id: UUID) -> bool:
    """Auto-adds the tenant's two pinned recurring topics (see
    TenantSettings.recurring_topic_first_*/last_* and app/routes/
    settings.py) to a brand-new meeting — is_default_first at order=0,
    is_default_last at the sentinel order above. Either half is skipped
    if that template's title was left unset. No-op if the tenant has no
    settings row yet. Returns whether a first-topic was seeded, so the
    caller can offset any topics passed in the same create request past
    order=0 (see create_meeting)."""
    tenant_settings = db.execute(
        select(TenantSettings).where(TenantSettings.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if tenant_settings is None:
        return False
    first_added = bool(tenant_settings.recurring_topic_first_title)
    if first_added:
        db.add(
            Topic(
                tenant_id=tenant_id,
                meeting_id=meeting.id,
                order=0,
                title=tenant_settings.recurring_topic_first_title,
                duration_minutes=tenant_settings.recurring_topic_first_duration,
                is_default_first=True,
            )
        )
    if tenant_settings.recurring_topic_last_title:
        db.add(
            Topic(
                tenant_id=tenant_id,
                meeting_id=meeting.id,
                order=_DEFAULT_LAST_TOPIC_ORDER,
                title=tenant_settings.recurring_topic_last_title,
                duration_minutes=tenant_settings.recurring_topic_last_duration,
                is_default_last=True,
            )
        )
    return first_added


def _get_meeting_or_404(db: Session, meeting_id: UUID, tenant_id: UUID) -> Meeting:
    meeting = db.execute(
        select(Meeting)
        .where(Meeting.id == meeting_id, Meeting.tenant_id == tenant_id)
        .options(selectinload(Meeting.topics))
    ).scalar_one_or_none()
    if meeting is None:
        raise HTTPException(status_code=404, detail="הישיבה לא נמצאה")
    return meeting


def _visible_topics(meeting: Meeting, user: IdentityUser) -> list[Topic]:
    """Private topics (is_private=True) are only visible to editors+.

    The original Base44 spec flagged this as a gap — `is_private` was only
    a client-side visual flag, not actually enforced. Enforce it here, at
    the read boundary, instead.
    """
    if is_editor(user):
        return meeting.topics
    return [t for t in meeting.topics if not t.is_private]


def _claim_pool_topic(db: Session, tenant_id: UUID, source_pool_id: UUID | None) -> None:
    """When a Topic is created referencing a topic-pool item, advance that
    item out of the "available to pick" state — mirrors TopicPool's
    documented lifecycle (pending_review -> approved -> in_meeting -> used,
    see app/routes/topic_pool.py). Only flips approved -> in_meeting;
    leaves any other status alone rather than erroring, since a client
    racing this (two editors picking the same item at once) shouldn't
    blow up meeting/topic creation over a pool bookkeeping nuance.
    """
    if source_pool_id is None:
        return
    pool_item = db.execute(
        select(TopicPool).where(TopicPool.id == source_pool_id, TopicPool.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if pool_item is None:
        raise HTTPException(status_code=400, detail="הנושא במאגר לא נמצא")
    if pool_item.status == "approved":
        pool_item.status = "in_meeting"


def _release_pool_topic(db: Session, tenant_id: UUID, source_pool_id: UUID | None) -> None:
    """Inverse of _claim_pool_topic — called when a topic that referenced a
    pool item is removed from a meeting, so the item becomes pickable
    again elsewhere. Only reverts in_meeting -> approved; if it already
    moved on to "used" or something else, leave it be."""
    if source_pool_id is None:
        return
    pool_item = db.execute(
        select(TopicPool).where(TopicPool.id == source_pool_id, TopicPool.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if pool_item is not None and pool_item.status == "in_meeting":
        pool_item.status = "approved"


@router.post("", response_model=MeetingOut, status_code=201)
def create_meeting(
    body: MeetingCreate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Meeting:
    tenant_id = UUID(user.tenant_id)
    meeting = Meeting(
        tenant_id=tenant_id,
        created_by_user_id=UUID(user.user_id),
        kind=body.kind,
        title=body.title,
        date=body.date,
        time_start=body.time_start,
        time_end=body.time_end,
        location=body.location,
        online_meeting_url=body.online_meeting_url,
        attendees_invited=body.attendees_invited,
        quorum_required=body.quorum_required,
        notes=body.notes,
        status="draft",
    )
    db.add(meeting)
    db.flush()  # assign meeting.id before attaching topics

    first_seeded = _seed_recurring_topics(db, meeting, tenant_id)
    order_offset = 1 if first_seeded else 0

    for i, t in enumerate(body.topics):
        _claim_pool_topic(db, tenant_id, t.source_pool_id)
        db.add(
            Topic(
                tenant_id=meeting.tenant_id,
                meeting_id=meeting.id,
                order=t.order if t.order is not None else i + order_offset,
                title=t.title,
                description=t.description,
                duration_minutes=t.duration_minutes,
                is_private=t.is_private,
                source_pool_id=t.source_pool_id,
                invited_guests=t.invited_guests,
            )
        )

    db.commit()
    db.refresh(meeting)
    return meeting


@router.get("", response_model=list[MeetingListItem])
def list_meetings(
    kind: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[Meeting]:
    stmt = select(Meeting).where(Meeting.tenant_id == UUID(user.tenant_id))
    if kind:
        stmt = stmt.where(Meeting.kind == kind)
    if status:
        stmt = stmt.where(Meeting.status == status)
    stmt = stmt.order_by(Meeting.date.desc())
    return list(db.execute(stmt).scalars().all())


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> MeetingOut:
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    # Build the response explicitly rather than assigning to
    # `meeting.topics` — that relationship has cascade="all, delete-orphan",
    # so overwriting it in-place on the live ORM object would mark the
    # filtered-out (private) topics as orphaned and liable to be deleted
    # on the next flush. Filtering belongs in the response, not the entity.
    out = MeetingOut.model_validate(meeting)
    out.topics = [TopicOut.model_validate(t) for t in _visible_topics(meeting, user)]
    return out


def _check_status_transition(meeting: Meeting, new_status: str) -> None:
    """Governance guard, enforced server-side (never trust the client to
    have honestly disabled a button) — see app/services/permissions.py for
    the analogous reasoning on editor-vs-viewer:

      - pending_approval -> approved requires at least one internal
        approval recorded (internal_approvals).
      - approved -> published requires at least one protocol approval
        recorded (protocol_approvals).

    No configurable quorum yet (e.g. "majority of the committee") — that
    needs a per-tenant settings concept Meetings doesn't have. One
    recorded approval is the floor, not a real quorum check. Tighten this
    once that exists.
    """
    if meeting.status == "pending_approval" and new_status == "approved":
        if not meeting.internal_approvals:
            raise HTTPException(
                status_code=409,
                detail="נדרש לפחות אישור פנימי אחד לפני מעבר לסטטוס 'אושר'",
            )
    if meeting.status == "approved" and new_status == "published":
        if not meeting.protocol_approvals:
            raise HTTPException(
                status_code=409,
                detail="נדרש לפחות אישור פרוטוקול אחד לפני פרסום",
            )


@router.patch("/{meeting_id}", response_model=MeetingOut)
def update_meeting(
    meeting_id: UUID,
    body: MeetingUpdate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Meeting:
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))

    updates = body.model_dump(exclude_unset=True)
    new_status = updates.get("status")
    is_transition = bool(new_status) and new_status != meeting.status

    if is_transition:
        _check_status_transition(meeting, new_status)

    # Apply plain field updates (including a manually-set `number`, see
    # MeetingUpdate's docstring) before the status-transition side effects
    # below, so an explicit number in this same request always wins over
    # the publish-time auto-generate fallback.
    for field, value in updates.items():
        setattr(meeting, field, value)

    if is_transition:
        # Timestamps stamped exactly once, at the moment each status is
        # first entered — mirrors the original app's convention (e.g.
        # generateMeetingNumber() at publish-time, not at draft creation).
        now = dt.datetime.now(dt.timezone.utc)
        if new_status == "pending_approval" and meeting.protocol_generated_at is None:
            meeting.protocol_generated_at = now
        if new_status == "published":
            if meeting.number is None:
                meeting.number = generate_meeting_number(
                    db, tenant_id=meeting.tenant_id, kind=meeting.kind, on=meeting.date
                )
            if meeting.published_at is None:
                meeting.published_at = now

    db.commit()
    db.refresh(meeting)
    return meeting


@router.post("/{meeting_id}/internal-approval", response_model=MeetingOut)
def add_internal_approval(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> MeetingOut:
    """Self-recording — any entitled tenant member can approve (not
    editor-only: sign-off is a committee-member action, not an editing
    action). Idempotent: approving twice doesn't duplicate the entry or
    bump its timestamp."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    approvals = list(meeting.internal_approvals or [])
    if not any(a.get("member_id") == user.user_id for a in approvals):
        approvals.append({"member_id": user.user_id, "approved_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        meeting.internal_approvals = approvals
        db.commit()
        db.refresh(meeting)
    # Same reasoning as get_meeting: this route is viewer-reachable
    # (require_entitlement, not require_editor), so private topics must
    # be filtered out of the response rather than relying on response_model
    # to auto-serialize the ORM object's full topics list.
    out = MeetingOut.model_validate(meeting)
    out.topics = [TopicOut.model_validate(t) for t in _visible_topics(meeting, user)]
    return out


@router.post("/{meeting_id}/protocol-approval", response_model=MeetingOut)
def add_protocol_approval(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> MeetingOut:
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    approvals = list(meeting.protocol_approvals or [])
    if not any(a.get("member_id") == user.user_id for a in approvals):
        approvals.append({"member_id": user.user_id, "approved_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        meeting.protocol_approvals = approvals
        db.commit()
        db.refresh(meeting)
    out = MeetingOut.model_validate(meeting)
    out.topics = [TopicOut.model_validate(t) for t in _visible_topics(meeting, user)]
    return out


@router.delete("/{meeting_id}", status_code=204)
def delete_meeting(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_admin()),
) -> None:
    """Admin-only, deliberately not restricted to draft status (unlike
    every other write in this file, which is merely require_editor) —
    this permanently destroys the meeting and everything under it
    (topics, invites, approvals: all FK ondelete=CASCADE). Tightened to
    admin specifically, not just editor, because a secretary running day-
    to-day agenda work should not be able to erase a published protocol
    by mistake; see app/services/permissions.py's require_admin."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    db.delete(meeting)
    db.commit()


# ─────────────────────────────────────────────────────────────────────────
# Attendance
# ─────────────────────────────────────────────────────────────────────────
#
# Editor-only (a designated secretary/chair marks attendance during a live
# meeting, not a self-service RSVP — that's attendees_responses, a
# separate field for a later phase). attendees_present is a plain JSON
# array of identity user-id strings; read-modify-write here is accepted
# as low-risk in practice (one person runs the room at a time), unlike
# topics which genuinely get edited concurrently during agenda prep.


@router.post("/{meeting_id}/attendees/{member_id}/present", response_model=list[str])
def mark_attendee_present(
    meeting_id: UUID,
    member_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> list[str]:
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    present = set(meeting.attendees_present or [])
    present.add(str(member_id))
    meeting.attendees_present = sorted(present)
    db.commit()
    return meeting.attendees_present


@router.delete("/{meeting_id}/attendees/{member_id}/present", response_model=list[str])
def mark_attendee_absent(
    meeting_id: UUID,
    member_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> list[str]:
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    present = set(meeting.attendees_present or [])
    present.discard(str(member_id))
    meeting.attendees_present = sorted(present)
    db.commit()
    return meeting.attendees_present


# ─────────────────────────────────────────────────────────────────────────
# Participants (non-login contacts, see app/models.py's Participant
# docstring) — attaching one to a specific meeting.
#
# Deliberately open to any entitled tenant member, NOT editor-only like
# the identity-user attendance endpoints above: per the explicit product
# requirement, regular system users (not just editors/admins) can add a
# participant to a meeting for tracking. The Participant directory row
# itself may already exist (created earlier by anyone) or the frontend
# may create it just before attaching it here.


@router.post("/{meeting_id}/participants/{participant_id}", response_model=list[str])
def add_participant_to_meeting(
    meeting_id: UUID,
    participant_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[str]:
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    participant = db.execute(
        select(Participant).where(
            Participant.id == participant_id, Participant.tenant_id == UUID(user.tenant_id)
        )
    ).scalar_one_or_none()
    if participant is None:
        raise HTTPException(status_code=404, detail="המשתתף/ת לא נמצא/ה")

    ids = set(meeting.participant_ids or [])
    ids.add(str(participant_id))
    meeting.participant_ids = sorted(ids)
    db.commit()
    return meeting.participant_ids


@router.delete("/{meeting_id}/participants/{participant_id}", response_model=list[str])
def remove_participant_from_meeting(
    meeting_id: UUID,
    participant_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[str]:
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    ids = set(meeting.participant_ids or [])
    ids.discard(str(participant_id))
    meeting.participant_ids = sorted(ids)
    db.commit()
    return meeting.participant_ids


# ─────────────────────────────────────────────────────────────────────────
# Invites — who's invited to this meeting + their RSVP, plus the actions
# that actually send the invitation email. See app/models.py's
# MeetingInvite docstring for why this is separate from attendees_invited/
# attendees_present.
#
# Adding/removing invitees and sending the emails are editor-only (this is
# the meeting organizer's job, not a member action) — contrast with the
# Participant-attach endpoints above, which are deliberately broader.
# ─────────────────────────────────────────────────────────────────────────


def _resolve_invitee(db: Session, tenant_id: UUID, ref: InviteeRef) -> tuple[str, str | None]:
    """Returns (email, display_name) for a member or participant, scoped
    to this tenant — raises 400 rather than silently skipping a bad
    reference, same defensive posture as _claim_pool_topic above."""
    if ref.kind == "member":
        try:
            u = identity_service.get_user(str(ref.id))
        except Exception as e:  # noqa: BLE001 — identity unreachable/unknown id, both are a bad request here
            raise HTTPException(status_code=400, detail="המשתמש לא נמצא") from e
        if u.get("tenant_id") != str(tenant_id):
            raise HTTPException(status_code=400, detail="המשתמש לא נמצא")
        return u["email"], u.get("display_name")
    if ref.kind == "participant":
        participant = db.execute(
            select(Participant).where(Participant.id == ref.id, Participant.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if participant is None or not participant.email:
            raise HTTPException(status_code=400, detail="למשתתף/ת אין כתובת אימייל")
        return participant.email, participant.full_name
    raise HTTPException(status_code=400, detail="סוג מוזמן לא תקין")


def _invite_topics(meeting: Meeting) -> list[tuple[str, int | None]]:
    """Non-private topics only — an invite email goes to people who may
    not even be editors, so this never leaks is_private topics regardless
    of who triggered the send."""
    return [(t.title, t.duration_minutes) for t in sorted(meeting.topics, key=lambda t: t.order) if not t.is_private]


def _send_pending_invites(db: Session, meeting: Meeting, user: IdentityUser) -> None:
    frontend = settings.primary_frontend_url.rstrip("/")
    topics = _invite_topics(meeting)
    for invite in meeting.invites:
        if invite.status != "pending":
            continue
        mail.send_meeting_invite(
            to_email=invite.email,
            recipient_name=invite.display_name or invite.email,
            tenant_name=user.tenant_name or "",
            meeting_kind=meeting.kind,
            meeting_number=meeting.number,
            meeting_date=meeting.date.isoformat(),
            time_start=meeting.time_start.strftime("%H:%M") if meeting.time_start else None,
            time_end=meeting.time_end.strftime("%H:%M") if meeting.time_end else None,
            location=meeting.location,
            topics=topics,
            rsvp_url_attend=f"{frontend}/rsvp/{invite.token}?response=confirmed_attend",
            rsvp_url_decline=f"{frontend}/rsvp/{invite.token}?response=confirmed_absent",
        )
    db.commit()


@router.post("/{meeting_id}/invites", response_model=list[MeetingInviteOut], status_code=201)
def add_invites(
    meeting_id: UUID,
    body: list[InviteeRef],
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> list[MeetingInvite]:
    tenant_id = UUID(user.tenant_id)
    meeting = _get_meeting_or_404(db, meeting_id, tenant_id)
    existing = {(i.invitee_kind, i.invitee_id) for i in meeting.invites}

    for ref in body:
        if (ref.kind, ref.id) in existing:
            continue  # already invited — adding again is a no-op, not an error
        email, display_name = _resolve_invitee(db, tenant_id, ref)
        db.add(
            MeetingInvite(
                tenant_id=tenant_id,
                meeting_id=meeting.id,
                invitee_kind=ref.kind,
                invitee_id=ref.id,
                email=email,
                display_name=display_name,
            )
        )
        existing.add((ref.kind, ref.id))

    db.commit()
    db.refresh(meeting)
    return meeting.invites


@router.delete("/{meeting_id}/invites/{invite_id}", status_code=204)
def remove_invite(
    meeting_id: UUID,
    invite_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> None:
    invite = db.execute(
        select(MeetingInvite).where(
            MeetingInvite.id == invite_id,
            MeetingInvite.meeting_id == meeting_id,
            MeetingInvite.tenant_id == UUID(user.tenant_id),
        )
    ).scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=404, detail="ההזמנה לא נמצאה")
    db.delete(invite)
    db.commit()


@router.post("/{meeting_id}/invites/send-internal", response_model=MeetingOut)
def send_internal_invites(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> MeetingOut:
    """First call (status still draft) advances draft -> invited_internal
    and stamps invite_sent_internal_at. Any later call is a pure resend —
    same endpoint, no status change — matching the mockup's "שלח לחברי
    ועד" / "שלח שוב לחברי ועד" being the same underlying action. Only
    still-pending invitees get (re-)emailed; anyone who already responded
    isn't bothered again."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    if not meeting.invites:
        raise HTTPException(status_code=400, detail="יש להוסיף מוזמנים לפני שליחת הזמנה")

    if meeting.status == "draft":
        meeting.status = "invited_internal"
        meeting.invite_sent_internal_at = dt.datetime.now(dt.timezone.utc)
        db.commit()
        db.refresh(meeting)

    _send_pending_invites(db, meeting, user)
    db.refresh(meeting)
    out = MeetingOut.model_validate(meeting)
    out.topics = [TopicOut.model_validate(t) for t in _visible_topics(meeting, user)]
    return out


@router.post("/{meeting_id}/invites/send-public", response_model=MeetingOut)
def send_public_invites(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> MeetingOut:
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    if meeting.status not in ("invited_internal", "invited_public"):
        raise HTTPException(status_code=409, detail="יש לשלוח הזמנה פנימית תחילה")
    if not meeting.invites:
        raise HTTPException(status_code=400, detail="יש להוסיף מוזמנים לפני שליחת הזמנה")

    if meeting.status == "invited_internal":
        meeting.status = "invited_public"
        meeting.invite_sent_public_at = dt.datetime.now(dt.timezone.utc)
        db.commit()
        db.refresh(meeting)

    _send_pending_invites(db, meeting, user)
    db.refresh(meeting)
    out = MeetingOut.model_validate(meeting)
    out.topics = [TopicOut.model_validate(t) for t in _visible_topics(meeting, user)]
    return out


@router.get("/{meeting_id}/invites/preview", response_model=InvitePreviewOut)
def preview_invite(
    meeting_id: UUID,
    invitee_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> InvitePreviewOut:
    """Structured preview of the invitation content for one invitee
    (defaults to the first one added) — powers the "תצוגה מקדימה" modal.
    Doesn't send anything or require the invite to exist yet in edge
    cases... it does require at least one invitee to preview against."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    if not meeting.invites:
        raise HTTPException(status_code=400, detail="אין עדיין מוזמנים לתצוגה מקדימה")

    invite = meeting.invites[0]
    if invitee_id is not None:
        invite = next((i for i in meeting.invites if i.id == invitee_id), invite)

    return InvitePreviewOut(
        recipient_name=invite.display_name or invite.email,
        recipient_email=invite.email,
        tenant_name=user.tenant_name or "",
        meeting_kind=meeting.kind,
        meeting_number=meeting.number,
        meeting_date=meeting.date,
        time_start=meeting.time_start,
        time_end=meeting.time_end,
        location=meeting.location,
        topics=[InvitePreviewTopic(title=t, duration_minutes=d) for t, d in _invite_topics(meeting)],
    )


# ─────────────────────────────────────────────────────────────────────────
# Topics (nested under a meeting)
# ─────────────────────────────────────────────────────────────────────────


@router.post("/{meeting_id}/topics", response_model=TopicOut, status_code=201)
def add_topic(
    meeting_id: UUID,
    body: TopicCreate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Topic:
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    tenant_id = UUID(user.tenant_id)
    _claim_pool_topic(db, tenant_id, body.source_pool_id)
    next_order = body.order if body.order is not None else len(meeting.topics)
    topic = Topic(
        tenant_id=meeting.tenant_id,
        meeting_id=meeting.id,
        order=next_order,
        title=body.title,
        description=body.description,
        duration_minutes=body.duration_minutes,
        is_private=body.is_private,
        source_pool_id=body.source_pool_id,
        invited_guests=body.invited_guests,
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic


@router.patch("/{meeting_id}/topics/{topic_id}", response_model=TopicOut)
def update_topic(
    meeting_id: UUID,
    topic_id: UUID,
    body: TopicUpdate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Topic:
    topic = db.execute(
        select(Topic).where(
            Topic.id == topic_id, Topic.meeting_id == meeting_id, Topic.tenant_id == UUID(user.tenant_id)
        )
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="הנושא לא נמצא")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(topic, field, value)

    db.commit()
    db.refresh(topic)
    return topic


@router.delete("/{meeting_id}/topics/{topic_id}", status_code=204)
def delete_topic(
    meeting_id: UUID,
    topic_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> None:
    tenant_id = UUID(user.tenant_id)
    topic = db.execute(
        select(Topic).where(Topic.id == topic_id, Topic.meeting_id == meeting_id, Topic.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if topic is None:
        raise HTTPException(status_code=404, detail="הנושא לא נמצא")
    _release_pool_topic(db, tenant_id, topic.source_pool_id)
    db.delete(topic)
    db.commit()


@router.post("/{meeting_id}/topics/reorder", response_model=list[TopicOut])
def reorder_topics(
    meeting_id: UUID,
    body: list[TopicReorderItem],
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> list[Topic]:
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    by_id = {t.id: t for t in meeting.topics}

    missing = [str(item.id) for item in body if item.id not in by_id]
    if missing:
        raise HTTPException(status_code=400, detail=f"נושאים לא שייכים לישיבה זו: {', '.join(missing)}")

    for item in body:
        by_id[item.id].order = item.order

    db.commit()
    return sorted(by_id.values(), key=lambda t: t.order)


@router.post("/{meeting_id}/topics/{topic_id}/defer", response_model=TopicOut, status_code=201)
def defer_topic(
    meeting_id: UUID,
    topic_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Topic:
    """Move a topic that didn't get discussed onto the next open meeting
    of the same kind. Returns the new copy created on the target meeting;
    the source topic is left in place with status="deferred"."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    topic = next((t for t in meeting.topics if t.id == topic_id), None)
    if topic is None:
        raise HTTPException(status_code=404, detail="הנושא לא נמצא")

    try:
        new_topic = defer_topic_to_next_meeting(db, source_meeting=meeting, topic=topic)
    except LookupError as e:
        raise HTTPException(
            status_code=409,
            detail="אין ישיבה עתידית פתוחה (בטיוטה או בהזמנה) שאליה ניתן לדחות את הנושא",
        ) from e

    db.commit()
    db.refresh(new_topic)
    return new_topic


@router.post("/{meeting_id}/topics/{topic_id}/undo-defer", response_model=TopicOut)
def undo_defer(
    meeting_id: UUID,
    topic_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Topic:
    """Reverse a defer — deletes the copy on the target meeting (as long
    as it hasn't been touched there yet) and restores the source topic to
    "pending". See app/services/defer_topic.py's undo_defer_topic."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    topic = next((t for t in meeting.topics if t.id == topic_id), None)
    if topic is None:
        raise HTTPException(status_code=404, detail="הנושא לא נמצא")

    try:
        undo_defer_topic(db, tenant_id=UUID(user.tenant_id), topic=topic)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="הנושא לא נדחה") from e
    except UndoDeferBlockedError as e:
        raise HTTPException(
            status_code=409,
            detail="אי אפשר לבטל את הדחייה — הנושא כבר נדון בישיבה שאליה נדחה",
        ) from e

    db.commit()
    db.refresh(topic)
    return topic

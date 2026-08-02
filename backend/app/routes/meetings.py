"""Meeting + topic CRUD.

Every route is entitlement-gated (`require_entitlement("meetings")` /
`require_editor()`) and every query is scoped by `user.tenant_id` — see
app/services/identity.py and app/services/permissions.py. This module owns
no auth state of its own; `user.tenant_id` / `user.user_id` are plain UUIDs
sourced from klaser-identity on every request (see identity-cutover.md).
"""
import datetime as dt
import html
from urllib.parse import quote
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import settings
from app.db import get_db
from app.models import (
    Meeting,
    MeetingInvite,
    MeetingRecording,
    Participant,
    TenantSettings,
    Topic,
    TopicPool,
)
from app.schemas import (
    InviteeRef,
    InvitePreviewOut,
    InvitePreviewTopic,
    MeetingCreate,
    MeetingInviteOut,
    MeetingListItem,
    MeetingOut,
    MeetingRecordingOut,
    MeetingUpdate,
    PreviousMeetingOut,
    ProtocolReceiptStatus,
    PublishPreviewOut,
    PublishRecipient,
    TopicCreate,
    TopicOut,
    TopicReorderItem,
    TopicUpdate,
)
from app.services import mail
from app.services.defer_topic import (
    UndoDeferBlockedError,
    defer_topic_to_next_meeting,
    pull_deferred_topics,
    undo_defer_topic,
)
from app.services.identity import IdentityUser, identity_service, require_entitlement
from app.services.invite_pdf import build_invite_pdf
from app.services.meeting_summary import (
    attendance_names,
    build_publish_summary,
    notify_action_owners,
)
from app.services.meeting_utils import generate_meeting_number
from app.services.permissions import is_editor, require_admin, require_editor
from app.services.protocol_pdf import build_protocol_pdf

router = APIRouter()

# Sentinel order for the pinned "last" recurring topic (see
# _seed_recurring_topics) — high enough that any number of ordinarily
# added topics (which get order=len(meeting.topics), see add_topic) will
# always sort before it, without needing to renumber anything on insert.
_DEFAULT_LAST_TOPIC_ORDER = 1_000_000

def _seed_recurring_topics(db: Session, meeting: Meeting, tenant_id: UUID) -> int:
    """Seeds the tenant's configured recurring topics on a new meeting and
    returns how many *leading* topics (order 0, …) were added, so
    create_meeting can offset any user-supplied topics past them.

    A configured 'נושא ראשון' (TenantSettings.recurring_topic_first) is
    pinned at order 0; a configured 'נושא אחרון' is pinned last at the
    sentinel order. Nothing is seeded when neither is set."""
    tenant_settings = db.execute(
        select(TenantSettings).where(TenantSettings.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if tenant_settings is None:
        return 0

    # Assemblies (kind='assembly') use their own recurring-topic config;
    # everything else falls back to the ישיבה set.
    if meeting.kind == "assembly":
        first_title = tenant_settings.assembly_recurring_topic_first_title
        first_duration = tenant_settings.assembly_recurring_topic_first_duration
        last_title = tenant_settings.assembly_recurring_topic_last_title
        last_duration = tenant_settings.assembly_recurring_topic_last_duration
    else:
        first_title = tenant_settings.recurring_topic_first_title
        first_duration = tenant_settings.recurring_topic_first_duration
        last_title = tenant_settings.recurring_topic_last_title
        last_duration = tenant_settings.recurring_topic_last_duration

    leading = 0
    if first_title:
        db.add(
            Topic(
                tenant_id=tenant_id,
                meeting_id=meeting.id,
                order=leading,
                title=first_title,
                duration_minutes=first_duration,
                is_default_first=True,
            )
        )
        leading += 1
    if last_title:
        db.add(
            Topic(
                tenant_id=tenant_id,
                meeting_id=meeting.id,
                order=_DEFAULT_LAST_TOPIC_ORDER,
                title=last_title,
                duration_minutes=last_duration,
                is_default_last=True,
            )
        )
    return leading


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


def _next_default_weekday(target_sunday_based: int) -> dt.date:
    """Nearest upcoming date (incl. today) whose weekday matches
    ``target_sunday_based`` — 0=Sunday .. 6=Saturday, matching
    TenantSettings.meeting_weekday's convention (Python's weekday() is
    Monday=0, so shift by one)."""
    today = dt.date.today()
    current = (today.weekday() + 1) % 7  # Python Mon=0 → Sunday-based Sun=0
    return today + dt.timedelta(days=(target_sunday_based - current) % 7)


def _apply_tenant_meeting_defaults(
    db: Session,
    tenant_id: UUID,
    kind: str,
    *,
    date: dt.date | None,
    time_start: dt.time | None,
    time_end: dt.time | None,
    location: str | None,
) -> tuple[dt.date, dt.time | None, dt.time | None, str | None]:
    """Fill a new meeting's date/time/location from the tenant's per-kind
    defaults (TenantSettings, set on the settings page) for any field the
    caller left blank. Date falls back to the next occurrence of the
    default weekday, or today if no weekday default is configured."""
    ts = db.execute(
        select(TenantSettings).where(TenantSettings.tenant_id == tenant_id)
    ).scalar_one_or_none()
    is_assembly = kind == "assembly"
    if ts is not None:
        weekday = ts.assembly_weekday if is_assembly else ts.meeting_weekday
        def_start = ts.assembly_start_time if is_assembly else ts.meeting_start_time
        def_end = ts.assembly_end_time if is_assembly else ts.meeting_end_time
        def_location = ts.assembly_location if is_assembly else ts.meeting_location
    else:
        weekday = def_start = def_end = def_location = None

    if date is None:
        date = _next_default_weekday(weekday) if weekday is not None else dt.date.today()
    if time_start is None:
        time_start = def_start
    if time_end is None:
        time_end = def_end
    if location is None:
        location = def_location
    return date, time_start, time_end, location


@router.post("", response_model=MeetingOut, status_code=201)
def create_meeting(
    body: MeetingCreate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Meeting:
    tenant_id = UUID(user.tenant_id)
    m_date, m_start, m_end, m_location = _apply_tenant_meeting_defaults(
        db,
        tenant_id,
        body.kind,
        date=body.date,
        time_start=body.time_start,
        time_end=body.time_end,
        location=body.location,
    )
    meeting = Meeting(
        tenant_id=tenant_id,
        created_by_user_id=UUID(user.user_id),
        kind=body.kind,
        title=body.title,
        number=generate_meeting_number(db, tenant_id=tenant_id, kind=body.kind, on=m_date),
        date=m_date,
        time_start=m_start,
        time_end=m_end,
        location=m_location,
        online_meeting_url=body.online_meeting_url,
        attendees_invited=body.attendees_invited,
        quorum_required=body.quorum_required,
        notes=body.notes,
        status="draft",
    )
    db.add(meeting)
    db.flush()  # assign meeting.id before attaching topics

    leading_topics = _seed_recurring_topics(db, meeting, tenant_id)

    for i, t in enumerate(body.topics):
        _claim_pool_topic(db, tenant_id, t.source_pool_id)
        db.add(
            Topic(
                tenant_id=meeting.tenant_id,
                meeting_id=meeting.id,
                order=t.order if t.order is not None else i + leading_topics,
                title=t.title,
                description=t.description,
                duration_minutes=t.duration_minutes,
                is_private=t.is_private,
                source_pool_id=t.source_pool_id,
                invited_guests=t.invited_guests,
            )
        )

    # Carry over topics deferred from earlier meetings of this kind, and
    # re-invite each carried topic's אלפון guests.
    deferred = pull_deferred_topics(
        db, new_meeting=meeting, start_order=leading_topics + len(body.topics)
    )
    for copy in deferred:
        _invite_topic_guests(db, meeting, tenant_id, copy.invited_guests)

    _invite_committee(db, meeting, tenant_id)

    db.commit()
    db.refresh(meeting)
    return meeting


@router.get("", response_model=list[MeetingListItem])
def list_meetings(
    kind: str | None = None,
    status: str | None = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[Meeting]:
    stmt = select(Meeting).where(Meeting.tenant_id == UUID(user.tenant_id))
    if kind:
        stmt = stmt.where(Meeting.kind == kind)
    if status:
        stmt = stmt.where(Meeting.status == status)
    if date_from:
        stmt = stmt.where(Meeting.date >= date_from)
    if date_to:
        stmt = stmt.where(Meeting.date <= date_to)
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


def _check_status_transition(db: Session, meeting: Meeting, new_status: str) -> None:
    """Governance guard, enforced server-side. Moving a locked meeting to
    'אושר' (pending_approval -> approved) requires that a majority of the
    committee members invited to the meeting have approved the distributed
    protocol. Nothing gates approved -> published beyond that."""
    if meeting.status == "pending_approval" and new_status == "approved":
        if not _receipt_threshold_met(db, meeting):
            total, confirmed = _protocol_receipt_counts(db, meeting)
            raise HTTPException(
                status_code=409,
                detail=(
                    f"נדרש שלפחות מחצית מחברי הועד יאשרו את הפרוטוקול לפני מעבר לסטטוס 'אושר' "
                    f"(אישרו {confirmed} מתוך {total})."
                ),
            )


def _revert_to_pending_on_protocol_edit(meeting: Meeting) -> None:
    """Editing the agenda/protocol after the meeting was already approved or
    published sends it back through the whole approval cycle: revert to
    pending_approval and clear every committee confirmation, so the *changed*
    protocol has to be re-distributed to the committee and re-approved (≥50%)
    before it can move to 'אושר' and be published to the public again.

    published_at is deliberately kept: it's how build_publish_summary /
    build_protocol_pdf know a re-publish is a revision, so the public email
    goes out titled 'חל שינוי בפרוטוקול הפגישה'. Editing during draft/active/
    pending_approval is untouched (nothing to revert yet)."""
    if meeting.status in ("approved", "published"):
        meeting.status = "pending_approval"
        for inv in meeting.invites:
            inv.protocol_receipt_confirmed_at = None


def _committee_invites(db: Session, meeting: Meeting) -> list[MeetingInvite]:
    """The meeting's invitees who are committee members — אלפון contacts
    flagged 'חבר ועד' (Participant.edit_permission). Used for the protocol
    receipt-approval distribution + gate (all invited committee members,
    regardless of whether they attended)."""
    pids = [i.invitee_id for i in meeting.invites if i.invitee_kind == "participant"]
    if not pids:
        return []
    committee = {
        p.id
        for p in db.execute(
            select(Participant).where(
                Participant.id.in_(pids),
                Participant.tenant_id == meeting.tenant_id,
                Participant.edit_permission.is_(True),
            )
        ).scalars()
    }
    return [
        i for i in meeting.invites if i.invitee_kind == "participant" and i.invitee_id in committee
    ]


def _protocol_receipt_counts(db: Session, meeting: Meeting) -> tuple[int, int]:
    """(committee_invitees_with_email, how_many_confirmed_receipt)."""
    invites = [i for i in _committee_invites(db, meeting) if (i.email or "").strip()]
    confirmed = sum(1 for i in invites if i.protocol_receipt_confirmed_at is not None)
    return len(invites), confirmed


def _receipt_threshold_met(db: Session, meeting: Meeting) -> bool:
    """True once ≥50% of committee invitees have confirmed receipt. None ⇒ met."""
    total, confirmed = _protocol_receipt_counts(db, meeting)
    return total == 0 or confirmed * 2 >= total


def _receipt_status_out(db: Session, meeting: Meeting) -> "ProtocolReceiptStatus":
    total, confirmed = _protocol_receipt_counts(db, meeting)
    return ProtocolReceiptStatus(
        sent=meeting.protocol_approval_sent_at is not None,
        sent_at=meeting.protocol_approval_sent_at,
        total=total,
        confirmed=confirmed,
        threshold_met=_receipt_threshold_met(db, meeting),
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
        _check_status_transition(db, meeting, new_status)

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

    # Email follow-up owners their task(s) as soon as the meeting is locked
    # (active -> pending_approval), and again on publish for any assigned
    # afterward. notify_action_owners is idempotent (per-topic flag), so no
    # one is double-emailed across the two transitions.
    if is_transition and new_status in ("pending_approval", "published"):
        notify_action_owners(db, meeting, user.tenant_name or "")
    return meeting


@router.get("/{meeting_id}/publish-preview", response_model=PublishPreviewOut)
def publish_preview(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> PublishPreviewOut:
    """The summary email + recipient list the publish action would send —
    rendered but not sent, so the user can review it before confirming (see
    the frontend PublishModal). Same builder backs the real send, so the
    preview is exactly what goes out."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    summary = build_publish_summary(db, meeting, user.tenant_name or "")
    return PublishPreviewOut(
        subject=summary.subject,
        html=summary.html,
        recipients=[PublishRecipient(name=r.name, email=r.email) for r in summary.recipients],
        recipients_without_email=summary.recipients_without_email,
    )


@router.post("/{meeting_id}/publish", response_model=MeetingOut)
def publish_meeting(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Meeting:
    """Publish to public: email the summary to every invitee + attached
    participant, then transition approved -> published. Guarded exactly
    like the plain stepper transition (must be 'approved' with at least one
    protocol approval). A mail failure never blocks publishing — _send is
    fire-and-forget per recipient."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    if meeting.status != "approved":
        raise HTTPException(status_code=409, detail="ניתן לפרסם רק ישיבה שאושרה.")
    _check_status_transition(db, meeting, "published")  # enforces protocol approval

    summary = build_publish_summary(db, meeting, user.tenant_name or "")
    # Attach the meeting protocol PDF to the summary email.
    try:
        protocol_pdf = build_protocol_pdf(db, meeting, user.tenant_name or "")
        attachments = (
            mail.Attachment(filename=f"פרוטוקול {meeting.number}.pdf", content=protocol_pdf),
        )
    except Exception:  # noqa: BLE001 — a PDF failure must not block publishing
        attachments = ()
    for r in summary.recipients:
        mail.send_prebuilt(
            to_email=r.email,
            subject=summary.subject,
            html_body=summary.html,
            text_body=summary.text,
            attachments=attachments,
        )

    now = dt.datetime.now(dt.timezone.utc)
    meeting.status = "published"
    if meeting.number is None:
        meeting.number = generate_meeting_number(meeting.date)
    if meeting.published_at is None:
        meeting.published_at = now
    db.commit()
    db.refresh(meeting)

    # Email each follow-up owner their task(s) once the meeting is locked.
    notify_action_owners(db, meeting, user.tenant_name or "")
    return meeting


@router.get("/{meeting_id}/previous", response_model=PreviousMeetingOut | None)
def previous_meeting(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> Meeting | None:
    """The most recent *published* meeting of the same kind before this one —
    so an active meeting can pull up the previous protocol for the recurring
    'אישור פרוטוקול ישיבה קודמת' topic. Returns null when there is none."""
    tenant_id = UUID(user.tenant_id)
    meeting = _get_meeting_or_404(db, meeting_id, tenant_id)
    return (
        db.execute(
            select(Meeting)
            .where(
                Meeting.tenant_id == tenant_id,
                Meeting.kind == meeting.kind,
                Meeting.id != meeting.id,
                Meeting.published_at.is_not(None),
                Meeting.date <= meeting.date,
            )
            .order_by(Meeting.date.desc(), Meeting.published_at.desc())
        )
        .scalars()
        .first()
    )


@router.get("/{meeting_id}/protocol-receipt-status", response_model=ProtocolReceiptStatus)
def protocol_receipt_status(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> ProtocolReceiptStatus:
    """Progress of the protocol-receipt gate — how many invitees confirmed
    receipt, and whether the ≥50% threshold is met."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    return _receipt_status_out(db, meeting)


@router.post("/{meeting_id}/distribute-protocol-approval", response_model=ProtocolReceiptStatus)
def distribute_protocol_approval(
    meeting_id: UUID,
    reset: bool = False,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> ProtocolReceiptStatus:
    """Email the protocol (PDF) + a receipt-confirm link to every committee
    member invited to the meeting (all of them, not only those who attended).
    Only after the meeting is locked (pending_approval/approved). Confirmations
    accrue toward the ≥50%-of-committee gate that unlocks public publish.

    `reset=True` (used when re-sending an *edited* protocol) clears every prior
    receipt confirmation first — the confirmations were for the old version, so
    the edited one needs a fresh majority. A plain reminder send keeps them."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    if meeting.status not in ("pending_approval", "approved"):
        raise HTTPException(
            status_code=409,
            detail="ניתן להפיץ את הפרוטוקול לאישור רק לאחר נעילת הישיבה.",
        )

    committee_invites = _committee_invites(db, meeting)
    if reset:
        for inv in committee_invites:
            inv.protocol_receipt_confirmed_at = None

    frontend = settings.primary_frontend_url.rstrip("/")
    try:
        pdf = build_protocol_pdf(db, meeting, user.tenant_name or "")
        attachments = (
            mail.Attachment(
                filename=f"פרוטוקול {meeting.number}.pdf" if meeting.number else "פרוטוקול.pdf",
                content=pdf,
            ),
        )
    except Exception:  # noqa: BLE001 — a PDF failure must not block the send
        attachments = ()

    kind_he = mail._KIND_LABELS.get(meeting.kind, meeting.kind)
    num = f" מס׳ {meeting.number}" if meeting.number else ""
    org = user.tenant_name or ""
    for inv in committee_invites:
        email = (inv.email or "").strip()
        if not email:
            continue
        link = f"{frontend}/protocol-receipt/{inv.token}"
        body_html = mail._wrap_html(
            f"<h1>אישור קבלת פרוטוקול — {kind_he}{num}</h1>"
            f"<p>שלום {inv.display_name or ''},</p>"
            f"<p>מצורף פרוטוקול {kind_he}{num} מתאריך {meeting.date.strftime('%d/%m/%Y')}. "
            f"נא לאשר את קבלתו:</p>"
            f'<p><a href="{link}" class="btn btn-attend">אישור קבלת הפרוטוקול</a></p>',
            f"{org} · Klaser",
        )
        body_text = (
            f"אישור קבלת פרוטוקול — {kind_he}{num}\n\n"
            f"שלום {inv.display_name or ''},\n"
            f"מצורף פרוטוקול {kind_he}{num}. לאישור קבלה: {link}\n\n— {org}"
        )
        mail.send_prebuilt(
            to_email=email,
            subject=f"אישור קבלת פרוטוקול — {kind_he}{num}",
            html_body=body_html,
            text_body=body_text,
            attachments=attachments,
        )

    meeting.protocol_approval_sent_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
    db.refresh(meeting)

    # Also email any follow-up owners not yet notified (e.g. tasks assigned
    # while editing the protocol post-lock). Idempotent per task.
    notify_action_owners(db, meeting, user.tenant_name or "")
    return _receipt_status_out(db, meeting)


@router.get("/{meeting_id}/attendance", response_model=list[str])
def meeting_attendance(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[str]:
    """Resolved names of who was present — members marked present (named via
    invites, best-effort roster) plus attached participants. Backs the
    printable protocol page's attendance section."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    return attendance_names(db, meeting)


@router.get("/{meeting_id}/protocol.pdf")
def meeting_protocol_pdf(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> Response:
    """The meeting protocol as a server-generated PDF (Hebrew RTL), for
    download after the meeting. Same look as the invitation PDF."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    pdf = build_protocol_pdf(db, meeting, user.tenant_name or "")
    filename = f"protocol-{meeting.number or meeting_id}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


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


def _invite_committee(db: Session, meeting: Meeting, tenant_id: UUID) -> None:
    """Committee members — אלפון contacts explicitly flagged 'חבר ועד'
    (Participant.edit_permission) — are auto-invited to every meeting. This
    is a pure אלפון flag: being an identity/system user is unrelated. Skips
    contacts without an email and anyone already invited."""
    contacts = (
        db.execute(select(Participant).where(Participant.tenant_id == tenant_id)).scalars().all()
    )
    if not contacts:
        return
    existing = {
        (i.invitee_kind, str(i.invitee_id))
        for i in db.execute(
            select(MeetingInvite).where(MeetingInvite.meeting_id == meeting.id)
        ).scalars()
    }
    for p in contacts:
        if not p.email:
            continue
        if not p.edit_permission or ("participant", str(p.id)) in existing:
            continue
        db.add(
            MeetingInvite(
                tenant_id=tenant_id,
                meeting_id=meeting.id,
                invitee_kind="participant",
                invitee_id=p.id,
                email=p.email,
                display_name=p.full_name,
            )
        )
        existing.add(("participant", str(p.id)))


def _invite_topic_guests(db: Session, meeting: Meeting, tenant_id: UUID, guest_ids: list | None) -> None:
    """A topic can carry אלפון contacts (Participant ids in invited_guests).
    When the topic lands on a meeting, invite those contacts as participant
    invitees — skipping anyone already invited or without an email (a
    MeetingInvite needs an address). Emails aren't sent here; they go out
    with the normal invite-send action."""
    if not guest_ids:
        return
    existing = {
        (i.invitee_kind, str(i.invitee_id))
        for i in db.execute(
            select(MeetingInvite).where(MeetingInvite.meeting_id == meeting.id)
        ).scalars()
    }
    for gid in guest_ids:
        try:
            pid = UUID(str(gid))
        except (ValueError, TypeError):
            continue
        if ("participant", str(pid)) in existing:
            continue
        p = db.execute(
            select(Participant).where(Participant.id == pid, Participant.tenant_id == tenant_id)
        ).scalar_one_or_none()
        if p is None or not p.email:
            continue
        db.add(
            MeetingInvite(
                tenant_id=tenant_id,
                meeting_id=meeting.id,
                invitee_kind="participant",
                invitee_id=pid,
                email=p.email,
                display_name=p.full_name,
            )
        )
        existing.add(("participant", str(pid)))


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
    # Build the invitation PDF once and attach it to every invite email.
    try:
        pdf = build_invite_pdf(db, meeting, user.tenant_name or "")
    except Exception:  # noqa: BLE001 — a PDF failure must not block invites
        pdf = None
    pdf_name = f"הזמנה {meeting.number}.pdf" if meeting.number else "הזמנה.pdf"
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
            invite_pdf=pdf,
            invite_pdf_filename=pdf_name,
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


@router.post("/{meeting_id}/distribute-alfon-invite", response_model=MeetingOut)
def distribute_alfon_invite(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> MeetingOut:
    """Email a simplified invitation — informational only, no RSVP and no
    receipt confirmation — to every אלפון contact with an email address.
    Available once the committee invitation has been sent (no need to wait for
    the committee to confirm)."""
    tenant_id = UUID(user.tenant_id)
    meeting = _get_meeting_or_404(db, meeting_id, tenant_id)

    if meeting.status not in ("invited_internal", "invited_public"):
        raise HTTPException(
            status_code=409,
            detail="יש לשלוח תחילה הזמנה לחברי הועד לפני הפצה לאלפון.",
        )

    parts = (
        db.execute(select(Participant).where(Participant.tenant_id == tenant_id)).scalars().all()
    )
    seen: set[str] = set()
    recipients: list[tuple[str, str]] = []
    for p in parts:
        email = (p.email or "").strip()
        if email and email.lower() not in seen:
            seen.add(email.lower())
            recipients.append((p.full_name, email))
    if not recipients:
        raise HTTPException(status_code=400, detail="אין באלפון אנשי קשר עם כתובת אימייל.")

    try:
        pdf = build_invite_pdf(db, meeting, user.tenant_name or "")
        attachments = (
            mail.Attachment(
                filename=f"הזמנה {meeting.number}.pdf" if meeting.number else "הזמנה.pdf",
                content=pdf,
            ),
        )
    except Exception:  # noqa: BLE001 — a PDF failure must not block the send
        attachments = ()

    kind_he = mail._KIND_LABELS.get(meeting.kind, meeting.kind)
    num = f" מס׳ {meeting.number}" if meeting.number else ""
    org = user.tenant_name or ""
    date_s = meeting.date.strftime("%d/%m/%Y")
    time_s = meeting.time_start.strftime("%H:%M") if meeting.time_start else ""
    if meeting.time_end:
        end = meeting.time_end.strftime("%H:%M")
        time_s = f"{time_s}–{end}" if time_s else end
    topics = [t for t in sorted(meeting.topics, key=lambda t: t.order) if not t.is_private]
    where = " · ".join(x for x in [date_s, time_s, meeting.location or ""] if x)
    agenda_html = "".join(f"<li>{html.escape(t.title)}</li>" for t in topics)

    def esc(s: str | None) -> str:
        return html.escape(s or "")

    for name, email in recipients:
        body_html = mail._wrap_html(
            f"<h1>הזמנה ל{esc(kind_he)}{esc(num)}</h1>"
            f"<p>שלום {esc(name)},</p>"
            f"<p>מוזמנים להשתתף ב{esc(kind_he)}{esc(num)}"
            + (f" שתתקיים ב-{esc(where)}." if where else ".")
            + "</p>"
            + (f"<p><strong>סדר יום:</strong></p><ol>{agenda_html}</ol>" if agenda_html else "")
            + "<p>מצורפת הזמנה מפורטת. נשמח לראותכם.</p>",
            f"{org} · Klaser",
        )
        body_text = (
            f"הזמנה ל{kind_he}{num}\n\n"
            f"שלום {name},\n"
            f"מוזמנים להשתתף ב{kind_he}{num}" + (f" ({where})" if where else "") + ".\n"
            + ("\nסדר יום:\n" + "\n".join(f"- {t.title}" for t in topics) if topics else "")
            + f"\n\n— {org}"
        )
        mail.send_prebuilt(
            to_email=email,
            subject=f"הזמנה ל{kind_he}{num}",
            html_body=body_html,
            text_body=body_text,
            attachments=attachments,
        )

    meeting.invite_sent_public_at = dt.datetime.now(dt.timezone.utc)
    db.commit()
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
    _invite_topic_guests(db, meeting, tenant_id, body.invited_guests)
    _revert_to_pending_on_protocol_edit(meeting)
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

    updates = body.model_dump(exclude_unset=True)
    # If the follow-up owner changes, clear the notified flag so the new owner
    # gets emailed on the next lock/distribute/publish (the old owner keeps
    # whatever they already received).
    if "action_item_owner" in updates and updates["action_item_owner"] != topic.action_item_owner:
        topic.action_item_notified_at = None
    for field, value in updates.items():
        setattr(topic, field, value)

    _revert_to_pending_on_protocol_edit(topic.meeting)
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
    meeting = topic.meeting
    db.delete(topic)
    _revert_to_pending_on_protocol_edit(meeting)
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

    _revert_to_pending_on_protocol_edit(meeting)
    db.commit()
    return sorted(by_id.values(), key=lambda t: t.order)


@router.post("/{meeting_id}/topics/{topic_id}/defer", response_model=TopicOut, status_code=201)
def defer_topic(
    meeting_id: UUID,
    topic_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Topic:
    """Queue a topic that didn't get discussed for the next meeting created
    of the same kind (see create_meeting's pull_deferred_topics). The topic
    is marked status="deferred"; no future meeting is required."""
    meeting = _get_meeting_or_404(db, meeting_id, UUID(user.tenant_id))
    topic = next((t for t in meeting.topics if t.id == topic_id), None)
    if topic is None:
        raise HTTPException(status_code=404, detail="הנושא לא נמצא")

    defer_topic_to_next_meeting(db, topic=topic)
    _revert_to_pending_on_protocol_edit(meeting)
    db.commit()
    db.refresh(topic)
    return topic


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

    _revert_to_pending_on_protocol_edit(meeting)
    db.commit()
    db.refresh(topic)
    return topic


# ─────────────────────────────────────────────────────────────────────────
# Meeting recordings — capture the meeting audio (browser mic or uploaded
# file) so it can later be transcribed + summarised per topic. Audio bytes
# are stored on the MeetingRecording row; metadata is listed separately and
# the bytes stream from the /audio endpoint so the meeting payload stays light.
# ─────────────────────────────────────────────────────────────────────────

# Guard against a single upload exhausting memory / the DB row limit. ~2h of
# opus-encoded audio is well under this; raise once we move to object storage.
_MAX_RECORDING_BYTES = 100 * 1024 * 1024  # 100 MB


@router.get("/{meeting_id}/recordings", response_model=list[MeetingRecordingOut])
def list_recordings(
    meeting_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[MeetingRecording]:
    """Recording metadata for a meeting, newest first (no audio bytes)."""
    tenant_id = UUID(user.tenant_id)
    _get_meeting_or_404(db, meeting_id, tenant_id)
    return list(
        db.execute(
            select(MeetingRecording)
            .where(
                MeetingRecording.meeting_id == meeting_id,
                MeetingRecording.tenant_id == tenant_id,
            )
            .order_by(MeetingRecording.created_at.desc())
        )
        .scalars()
        .all()
    )


@router.post("/{meeting_id}/recordings", response_model=MeetingRecordingOut)
def upload_recording(
    meeting_id: UUID,
    file: UploadFile = File(...),
    duration_seconds: int | None = None,
    source: str = "upload",
    topic_id: UUID | None = None,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> MeetingRecording:
    """Store an audio recording for a meeting — either a live mic capture
    (source='mic') or an uploaded audio file (source='upload'), optionally
    tied to a specific agenda topic (topic_id)."""
    tenant_id = UUID(user.tenant_id)
    _get_meeting_or_404(db, meeting_id, tenant_id)

    if topic_id is not None:
        topic = db.execute(
            select(Topic).where(
                Topic.id == topic_id, Topic.meeting_id == meeting_id, Topic.tenant_id == tenant_id
            )
        ).scalar_one_or_none()
        if topic is None:
            raise HTTPException(status_code=404, detail="הנושא לא נמצא")

    data = file.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="קובץ האודיו ריק.")
    if len(data) > _MAX_RECORDING_BYTES:
        raise HTTPException(status_code=413, detail="קובץ האודיו גדול מדי (מעל 100MB).")

    rec = MeetingRecording(
        tenant_id=tenant_id,
        meeting_id=meeting_id,
        topic_id=topic_id,
        created_by_user_id=UUID(user.user_id),
        filename=file.filename or "recording.webm",
        content_type=file.content_type or "audio/webm",
        size_bytes=len(data),
        duration_seconds=duration_seconds,
        source="mic" if source == "mic" else "upload",
        audio=data,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.get("/{meeting_id}/recordings/{recording_id}/audio")
def recording_audio(
    meeting_id: UUID,
    recording_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> Response:
    """Stream the raw audio bytes for playback / download."""
    tenant_id = UUID(user.tenant_id)
    rec = db.execute(
        select(MeetingRecording).where(
            MeetingRecording.id == recording_id,
            MeetingRecording.meeting_id == meeting_id,
            MeetingRecording.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if rec is None:
        raise HTTPException(status_code=404, detail="ההקלטה לא נמצאה")
    # Content-Disposition must be Latin-1 encodable; a Hebrew filename would
    # blow up header encoding (→ 500 / "Failed to fetch"). Use an ASCII
    # fallback plus RFC 5987 filename* for the real (UTF-8) name.
    disposition = f"inline; filename=\"recording\"; filename*=UTF-8''{quote(rec.filename)}"
    return Response(
        content=rec.audio,
        media_type=rec.content_type,
        headers={"Content-Disposition": disposition},
    )


@router.delete("/{meeting_id}/recordings/{recording_id}", status_code=204)
def delete_recording(
    meeting_id: UUID,
    recording_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Response:
    tenant_id = UUID(user.tenant_id)
    rec = db.execute(
        select(MeetingRecording).where(
            MeetingRecording.id == recording_id,
            MeetingRecording.meeting_id == meeting_id,
            MeetingRecording.tenant_id == tenant_id,
        )
    ).scalar_one_or_none()
    if rec is None:
        raise HTTPException(status_code=404, detail="ההקלטה לא נמצאה")
    db.delete(rec)
    db.commit()
    return Response(status_code=204)

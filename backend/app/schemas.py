"""Pydantic request/response schemas for the Meetings API.

Uses `import datetime as dt` + qualified references (`dt.date`, `dt.time`,
`dt.datetime`) rather than `from datetime import date, time, datetime`.
Several models below have fields literally named `date` — with a bare
import, `date: date | None = None` breaks at class-body execution time:
Python stores the default value into the class namespace under the name
`date` *before* evaluating the annotation expression, so the annotation's
own `date` reference resolves to `None` instead of the type
(`TypeError: unsupported operand type(s) for |: 'NoneType' and 'NoneType'`).
Qualifying the module sidesteps the collision entirely.
"""
import datetime as dt
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# ─────────────────────────────────────────────────────────────────────────
# Topic
# ─────────────────────────────────────────────────────────────────────────


class TopicCreate(BaseModel):
    title: str
    description: str | None = None
    duration_minutes: int | None = None
    is_private: bool = False
    order: int | None = None
    source_pool_id: UUID | None = None
    invited_guests: list[str] | None = None


class TopicUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    duration_minutes: int | None = None
    is_private: bool | None = None
    order: int | None = None
    status: str | None = None  # pending | in_progress | done | deferred | skipped
    decision_text: str | None = None
    action_item: str | None = None
    timer_elapsed: int | None = None
    topic_notes: str | None = None
    invited_guests: list[str] | None = None


class TopicReorderItem(BaseModel):
    id: UUID
    order: int


class TopicOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    meeting_id: UUID
    order: int
    title: str
    description: str | None
    duration_minutes: int | None
    is_private: bool
    status: str
    deferred_to_meeting_id: UUID | None
    deferred_from_topic_id: UUID | None
    decision_text: str | None
    action_item: str | None
    action_item_done: bool
    timer_elapsed: int | None
    source_pool_id: UUID | None
    suggested_by: UUID | None
    is_default_first: bool
    is_default_last: bool
    approval_status: str | None
    topic_notes: str | None
    invited_guests: list[str] | None
    created_at: dt.datetime
    updated_at: dt.datetime


# ─────────────────────────────────────────────────────────────────────────
# Meeting
# ─────────────────────────────────────────────────────────────────────────


class MeetingCreate(BaseModel):
    kind: str = "meeting"  # meeting | assembly
    title: str | None = None
    # Optional — when omitted the server fills it from the tenant's default
    # meeting weekday (see _apply_tenant_meeting_defaults in routes/meetings.py).
    date: dt.date | None = None
    time_start: dt.time | None = None
    time_end: dt.time | None = None
    location: str | None = None
    online_meeting_url: str | None = None
    attendees_invited: list[str] | None = None
    quorum_required: int | None = None
    notes: str | None = None
    topics: list[TopicCreate] = Field(default_factory=list)


class MeetingUpdate(BaseModel):
    # Left blank by default at creation — the editor can fill it in
    # manually at any time. If still empty when the meeting is published,
    # the server auto-assigns one as a fallback (see update_meeting's
    # _check_status_transition-adjacent logic in routes/meetings.py) so
    # nothing *requires* filling this in by hand.
    number: str | None = None
    title: str | None = None
    date: dt.date | None = None
    time_start: dt.time | None = None
    time_end: dt.time | None = None
    location: str | None = None
    online_meeting_url: str | None = None
    status: str | None = None
    attendees_invited: list[str] | None = None
    attendees_present: list[str] | None = None
    participant_ids: list[str] | None = None
    quorum_required: int | None = None
    quorum_reached: bool | None = None
    notes: str | None = None


class MeetingListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: str
    number: str | None
    title: str | None
    date: dt.date
    time_start: dt.time | None
    location: str | None
    status: str
    created_at: dt.datetime


class MeetingInviteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    invitee_kind: str  # member | participant
    invitee_id: UUID
    email: str
    display_name: str | None
    status: str  # pending | confirmed_attend | confirmed_absent
    responded_at: dt.datetime | None
    created_at: dt.datetime


class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    created_by_user_id: UUID
    kind: str
    number: str | None
    title: str | None
    date: dt.date
    time_start: dt.time | None
    time_end: dt.time | None
    location: str | None
    online_meeting_url: str | None
    status: str
    attendees_invited: list[str] | None
    attendees_present: list[str] | None
    participant_ids: list[str] | None
    attendees_responses: list[dict] | None
    internal_approvals: list[dict] | None
    protocol_approvals: list[dict] | None
    protocol_to_approve_id: UUID | None
    quorum_required: int | None
    quorum_reached: bool | None
    notes: str | None
    invite_sent_internal_at: dt.datetime | None
    invite_sent_public_at: dt.datetime | None
    protocol_generated_at: dt.datetime | None
    published_at: dt.datetime | None
    created_at: dt.datetime
    updated_at: dt.datetime
    topics: list[TopicOut] = Field(default_factory=list)
    invites: list[MeetingInviteOut] = Field(default_factory=list)


class PublishRecipient(BaseModel):
    name: str
    email: str


class PublishPreviewOut(BaseModel):
    """Pre-send preview for the "publish to public" flow — the rendered
    summary email plus who will receive it (and who was skipped for
    lacking an email). See routes/meetings.py publish_preview."""

    subject: str
    html: str
    recipients: list[PublishRecipient] = Field(default_factory=list)
    recipients_without_email: list[str] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────
# TopicPool
# ─────────────────────────────────────────────────────────────────────────


class TopicPoolCreate(BaseModel):
    title: str
    description: str | None = None
    duration_minutes: int | None = None
    invited_guests: list[str] | None = None
    priority: int | None = None


class TopicPoolUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    duration_minutes: int | None = None
    invited_guests: list[str] | None = None
    priority: int | None = None
    status: str | None = None  # pending_review | approved | in_meeting | used | rejected


class TopicPoolOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: str | None
    duration_minutes: int | None
    invited_guests: list[str] | None
    source: str
    suggested_by: UUID | None
    priority: int | None
    status: str
    created_at: dt.datetime
    updated_at: dt.datetime


# ─────────────────────────────────────────────────────────────────────────
# Participant — non-login contact tracked for meeting attendance. See
# app/models.py's Participant docstring for the identity-vs-Meetings
# ownership split.
# ─────────────────────────────────────────────────────────────────────────


class ParticipantCreate(BaseModel):
    # Optional — composed from first/last when omitted (see create_participant).
    full_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    nickname: str | None = None
    phone: str | None = None
    email: str | None = None
    role: str | None = None
    public_send: bool = True
    edit_permission: bool = False


class ParticipantUpdate(BaseModel):
    full_name: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    nickname: str | None = None
    phone: str | None = None
    email: str | None = None
    role: str | None = None
    public_send: bool | None = None
    edit_permission: bool | None = None


class ParticipantOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    full_name: str
    first_name: str | None
    last_name: str | None
    nickname: str | None
    phone: str | None
    email: str | None
    role: str | None
    public_send: bool
    # Manual "הרשאות עריכה" override (stored).
    edit_permission: bool = False
    # Derived, not stored: true when this contact's email matches an
    # identity user in the tenant (they're a system user). The effective
    # edit permission the UI shows is is_system_user OR edit_permission.
    is_system_user: bool = False
    created_by_user_id: UUID
    created_at: dt.datetime
    updated_at: dt.datetime


class ParticipantImportResult(BaseModel):
    imported: int
    skipped: int


# ─────────────────────────────────────────────────────────────────────────
# SavedDate — placeholder future meeting date, see app/models.py's
# SavedDate docstring.
# ─────────────────────────────────────────────────────────────────────────


class SavedDateCreate(BaseModel):
    kind: str = "meeting"  # meeting | assembly
    date: dt.date
    note: str | None = None


class SavedDateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: str
    date: dt.date
    note: str | None
    created_by_user_id: UUID
    created_at: dt.datetime


# ─────────────────────────────────────────────────────────────────────────
# Dashboard — aggregated home-page data. See app/routes/dashboard.py.
# ─────────────────────────────────────────────────────────────────────────


class DashboardMeetingItem(BaseModel):
    """MeetingListItem plus a computed display number — meetings only get
    a real `number` at publish time (see Meeting.number's docstring), so
    for a still-in-progress meeting this previews what the number *would*
    be if published today (same counting rule, not persisted)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    kind: str
    number: str | None
    display_number: str
    title: str | None
    date: dt.date
    time_start: dt.time | None
    location: str | None
    status: str
    created_at: dt.datetime


class DashboardOut(BaseModel):
    continuing_meeting: DashboardMeetingItem | None
    upcoming_meeting: MeetingListItem | None
    saved_dates: list[SavedDateOut]
    protocols_count: int
    open_action_items_count: int
    recent_protocols: list[MeetingListItem]


class ActionItemOut(BaseModel):
    """One row in the tenant-wide משימות לביצוע list — a Topic.action_item
    plus enough meeting context to show where it came from. Built by hand
    (not from_attributes) since it spans a Topic/Meeting join; see
    app/routes/action_items.py."""

    topic_id: UUID
    meeting_id: UUID
    meeting_kind: str
    meeting_number: str | None
    meeting_date: dt.date
    topic_title: str
    action_item: str
    action_item_done: bool


class ActionItemUpdate(BaseModel):
    done: bool
    # Opt-in, per action — the caller explicitly checks "עדכן במייל את
    # המוזמנים" before marking done; no notification fires by default.
    notify: bool = False


class DecisionSearchResult(BaseModel):
    meeting_id: UUID
    meeting_kind: str
    meeting_number: str | None
    meeting_date: dt.date
    topic_id: UUID
    topic_title: str
    decision_text: str


# ─────────────────────────────────────────────────────────────────────────
# Meeting invites + RSVP. See app/models.py's MeetingInvite docstring for
# why this is a normalized table rather than reusing attendees_invited/
# attendees_responses.
# ─────────────────────────────────────────────────────────────────────────


class InviteeRef(BaseModel):
    """One entry in a POST /invites request body — points at either an
    identity member or a local Participant; the route resolves email/
    display_name from the appropriate source."""

    kind: str  # member | participant
    id: UUID


class InvitePreviewTopic(BaseModel):
    title: str
    duration_minutes: int | None


class InvitePreviewOut(BaseModel):
    """Structured (not raw-HTML) preview data for the invitation modal —
    rendered natively by the frontend rather than injecting server HTML
    into the page. See app/routes/meetings.py's preview_invite."""

    recipient_name: str
    recipient_email: str
    tenant_name: str
    meeting_kind: str
    meeting_number: str | None
    meeting_date: dt.date
    time_start: dt.time | None
    time_end: dt.time | None
    location: str | None
    topics: list[InvitePreviewTopic]


class RsvpMeetingOut(BaseModel):
    """What an anonymous, token-holding recipient sees on the public RSVP
    page — deliberately narrow (no tenant_id, no internal ids, no private
    topics) since this route has no identity session backing it at all."""

    recipient_name: str
    status: str  # pending | confirmed_attend | confirmed_absent
    tenant_name: str
    meeting_kind: str
    meeting_number: str | None
    meeting_date: dt.date
    time_start: dt.time | None
    time_end: dt.time | None
    location: str | None
    topics: list[InvitePreviewTopic]


class RsvpSubmitRequest(BaseModel):
    response: str  # confirmed_attend | confirmed_absent


# ─────────────────────────────────────────────────────────────────────────
# Tenant settings — org branding, protocol signatories, meeting/assembly
# defaults, recurring topic templates. See app/models.py's TenantSettings/
# Signatory/UserSignature docstrings and app/routes/settings.py.
# ─────────────────────────────────────────────────────────────────────────


class SignatoryCreate(BaseModel):
    member_user_id: UUID | None = None
    position_title: str | None = None
    signature_text: str | None = None


class SignatoryUpdate(BaseModel):
    member_user_id: UUID | None = None
    position_title: str | None = None
    signature_text: str | None = None


class SignatoryOut(BaseModel):
    id: UUID
    order: int
    member_user_id: UUID | None
    member_display_name: str | None
    member_role: str | None
    position_title: str | None
    signature_text: str | None
    signature_image_url: str | None  # data: URL, built server-side from stored base64


class TenantSettingsUpdate(BaseModel):
    org_name: str | None = None
    email_signature: str | None = None
    meeting_location: str | None = None
    meeting_weekday: int | None = None  # 0=Sunday .. 6=Saturday
    meeting_start_time: dt.time | None = None
    meeting_end_time: dt.time | None = None
    assembly_location: str | None = None
    assembly_weekday: int | None = None
    assembly_start_time: dt.time | None = None
    assembly_end_time: dt.time | None = None
    recurring_topic_first_title: str | None = None
    recurring_topic_first_duration: int | None = None
    recurring_topic_last_title: str | None = None
    recurring_topic_last_duration: int | None = None


class TenantSettingsOut(BaseModel):
    org_name: str | None
    logo_url: str | None
    email_signature: str | None
    stamp_url: str | None
    meeting_location: str | None
    meeting_weekday: int | None
    meeting_start_time: dt.time | None
    meeting_end_time: dt.time | None
    assembly_location: str | None
    assembly_weekday: int | None
    assembly_start_time: dt.time | None
    assembly_end_time: dt.time | None
    recurring_topic_first_title: str | None
    recurring_topic_first_duration: int | None
    recurring_topic_last_title: str | None
    recurring_topic_last_duration: int | None
    signatories: list[SignatoryOut] = Field(default_factory=list)


class UserSignatureOut(BaseModel):
    signature_image_url: str | None


class UserSignatureUpdate(BaseModel):
    # A full data: URL as produced by canvas.toDataURL('image/png') on the
    # frontend — parsed and re-validated server-side, not trusted blindly.
    data_url: str

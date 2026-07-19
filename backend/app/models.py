"""SQLAlchemy models for the Meetings service.

Data-ownership rule (see klaser-identity's docs/klaser-platform-infra.md and
docs/identity-cutover.md): this DB owns everything meeting-specific
(meetings, topics, transcripts, protocols, …) and NOTHING else.

Do not add a `User`, `Tenant`, `AuthToken`, or `Subscription` model here —
those live exclusively in klaser-identity. Every `tenant_id` / `user_id` /
`*_user_id` column below is a plain UUID with NO foreign key into a local
table (there isn't one) — enrich with human-readable fields (email, tenant
name, etc.) by calling app.services.identity, never by joining across
databases.

Design notes
------------

- ``Meeting`` covers both board meetings (ישיבות ועד) and general assemblies
  (אסיפות) via the ``kind`` discriminator, rather than two near-duplicate
  tables (the original Base44 spec had separate Meeting/Assembly entities
  with an identical lifecycle — collapsing them avoids drift between two
  copies of the same state machine).
- ``Topic`` is a normalized child table keyed on ``meeting_id``, not an
  embedded JSON array on Meeting. The original spec stored topics as an
  embedded array and hit a read-modify-write race under concurrent editors
  (see original doc §10.2) — per-topic rows with per-topic writes avoid
  that class of bug entirely.
"""
import secrets
from datetime import date, datetime, time
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy import UUID as SQLUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.db import Base

# ─────────────────────────────────────────────────────────────────────────
# Meeting / Assembly
# ─────────────────────────────────────────────────────────────────────────


class Meeting(Base):
    """A committee meeting (ישיבה) or general assembly (אסיפה).

    Status lifecycle (see app/lib equivalents on the frontend for the route
    resolution mirroring this):

        draft -> invited_internal -> invited_public -> active
              -> pending_approval -> approved -> published -> archived
    """

    __tablename__ = "meetings"

    id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), primary_key=True, default=uuid4)

    # From identity — no FK, no local mirror. See module docstring.
    tenant_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), index=True, nullable=False)
    created_by_user_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), nullable=False)

    # 'meeting' (ישיבת ועד) | 'assembly' (אסיפה)
    kind: Mapped[str] = mapped_column(String, nullable=False, default="meeting")

    # Sequential display number, format "N-YY", e.g. "2-26". Generated
    # server-side counting only published/archived meetings for the
    # current year (drafts/cancellations don't bump the sequence) —
    # ported from the original generateMeetingNumber() convention.
    number: Mapped[str | None] = mapped_column(String)

    title: Mapped[str | None] = mapped_column(String)

    date: Mapped[date] = mapped_column(Date, nullable=False)
    time_start: Mapped[time | None] = mapped_column(Time)
    time_end: Mapped[time | None] = mapped_column(Time)
    location: Mapped[str | None] = mapped_column(String)
    online_meeting_url: Mapped[str | None] = mapped_column(String)

    # draft | invited_internal | invited_public | active | pending_approval
    # | approved | published | archived
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft", index=True)

    # Plain UUID lists/dicts — members come from identity, never a local FK.
    attendees_invited: Mapped[list | None] = mapped_column(JSON)  # list[str] user ids
    attendees_present: Mapped[list | None] = mapped_column(JSON)  # list[str] user ids
    attendees_responses: Mapped[list | None] = mapped_column(JSON)
    # [{user_id, status: pending|confirmed_attend|confirmed_absent, responded_at}]

    # list[str] Participant.id (local table below, NOT identity user ids —
    # a different id-space entirely). Non-login contacts tracked at this
    # meeting for attendance record-keeping. See Participant's docstring.
    participant_ids: Mapped[list | None] = mapped_column(JSON)

    internal_approvals: Mapped[list | None] = mapped_column(JSON)  # [{user_id, approved_at}]
    protocol_approvals: Mapped[list | None] = mapped_column(JSON)  # [{user_id, approved_at}]

    # The prior meeting's protocol being ratified in this meeting.
    protocol_to_approve_id: Mapped[UUID | None] = mapped_column(
        SQLUUID(as_uuid=True), ForeignKey("meetings.id", ondelete="SET NULL")
    )

    # Assembly-only fields (null for kind='meeting').
    quorum_required: Mapped[int | None] = mapped_column(Integer)
    quorum_reached: Mapped[bool | None] = mapped_column(Boolean)

    notes: Mapped[str | None] = mapped_column(Text)

    invite_sent_internal_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    invite_sent_public_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    protocol_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    topics: Mapped[list["Topic"]] = relationship(
        back_populates="meeting",
        foreign_keys="Topic.meeting_id",
        cascade="all, delete-orphan",
        order_by="Topic.order",
    )
    invites: Mapped[list["MeetingInvite"]] = relationship(
        back_populates="meeting",
        foreign_keys="MeetingInvite.meeting_id",
        cascade="all, delete-orphan",
        order_by="MeetingInvite.created_at",
    )


# ─────────────────────────────────────────────────────────────────────────
# Topic (normalized — see module docstring for why this isn't embedded JSON)
# ─────────────────────────────────────────────────────────────────────────


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), primary_key=True, default=uuid4)

    # Denormalized alongside meeting_id for defense-in-depth tenant scoping
    # on direct topic queries (matches elrom-platform's Chunk.tenant_id
    # pattern — every tenant-scoped table carries tenant_id directly rather
    # than relying solely on a join).
    tenant_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), index=True, nullable=False)
    meeting_id: Mapped[UUID] = mapped_column(
        SQLUUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), index=True, nullable=False
    )

    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # pending | in_progress | done | deferred | skipped
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")

    deferred_to_meeting_id: Mapped[UUID | None] = mapped_column(
        SQLUUID(as_uuid=True), ForeignKey("meetings.id", ondelete="SET NULL")
    )
    # Set on the fresh COPY created by a defer (app/services/defer_topic.py),
    # pointing back at the original source topic — lets undo-defer locate
    # the copy without title-matching heuristics. SET NULL (not CASCADE) so
    # deleting the source topic doesn't also delete the copy it spawned.
    deferred_from_topic_id: Mapped[UUID | None] = mapped_column(
        SQLUUID(as_uuid=True), ForeignKey("topics.id", ondelete="SET NULL")
    )
    decision_text: Mapped[str | None] = mapped_column(Text)
    action_item: Mapped[str | None] = mapped_column(Text)
    # Completion flag for action_item, tracked separately from the topic's
    # own status — a topic can be "done" while its follow-up task is still
    # open. Powers the tenant-wide משימות לביצוע list (app/routes/action_items.py).
    action_item_done: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    timer_elapsed: Mapped[int | None] = mapped_column(Integer)  # seconds

    source_pool_id: Mapped[UUID | None] = mapped_column(
        SQLUUID(as_uuid=True), ForeignKey("topic_pool.id", ondelete="SET NULL")
    )
    suggested_by: Mapped[UUID | None] = mapped_column(SQLUUID(as_uuid=True))  # user id, no FK

    is_default_first: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_default_last: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    approval_status: Mapped[str | None] = mapped_column(String)
    topic_notes: Mapped[str | None] = mapped_column(Text)
    invited_guests: Mapped[list | None] = mapped_column(JSON)  # list[str] external names

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    meeting: Mapped[Meeting] = relationship(back_populates="topics", foreign_keys=[meeting_id])


# ─────────────────────────────────────────────────────────────────────────
# MeetingInvite — one invited person + their RSVP, for a specific meeting.
#
# Supersedes the old plan of reusing the plain `attendees_invited` /
# `attendees_responses` JSON arrays for this: those only ever held identity
# user ids, and invitees here can be either an identity user (`kind=
# "member"`) or a local Participant (`kind="participant"`) — two different
# id-spaces that a flat list[str] can't disambiguate. `attendees_present`
# stays untouched and unrelated — that's live in-meeting attendance
# marking, a separate concept from "did they RSVP to the invitation".
#
# `email`/`display_name` are snapshotted at invite time rather than joined
# live: a Participant already lives locally, but a member's email comes
# from identity, and re-fetching it on every read (or worse, needing it to
# still exist there) is unnecessary — the token/RSVP flow is entirely
# self-contained in this table once the invite is created.
# ─────────────────────────────────────────────────────────────────────────


def _generate_invite_token() -> str:
    return secrets.token_urlsafe(32)


class MeetingInvite(Base):
    __tablename__ = "meeting_invites"
    __table_args__ = (
        UniqueConstraint("meeting_id", "invitee_kind", "invitee_id", name="uq_meeting_invites_invitee"),
    )

    id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), index=True, nullable=False)
    meeting_id: Mapped[UUID] = mapped_column(
        SQLUUID(as_uuid=True), ForeignKey("meetings.id", ondelete="CASCADE"), index=True, nullable=False
    )

    invitee_kind: Mapped[str] = mapped_column(String, nullable=False)  # member | participant
    invitee_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), nullable=False)  # no FK, see above
    email: Mapped[str] = mapped_column(String, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String)

    # Unguessable — possession of this token IS the auth for the public
    # RSVP endpoints (see app/routes/rsvp.py). No identity session involved.
    token: Mapped[str] = mapped_column(String, unique=True, index=True, default=_generate_invite_token)

    # pending | confirmed_attend | confirmed_absent
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending")
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    meeting: Mapped[Meeting] = relationship(back_populates="invites", foreign_keys=[meeting_id])


# ─────────────────────────────────────────────────────────────────────────
# Participant — a non-login contact, NOT an identity User. Tracked purely
# for meeting attendance/record-keeping (e.g. a guest, a resident who
# isn't a system user). Created/managed by any entitled tenant member;
# never authenticates, never appears in klaser-identity. A per-tenant
# reusable directory (mirrors TopicPool's shape), attached to individual
# meetings via Meeting.participant_ids above.
# ─────────────────────────────────────────────────────────────────────────


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), index=True, nullable=False)

    full_name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)

    created_by_user_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), nullable=False)  # no FK, see above

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ─────────────────────────────────────────────────────────────────────────
# SavedDate — a lightweight reserved future date ("תאריך שמור"), not yet a
# real Meeting. Lets a secretary/admin block out "we're meeting on the
# 12th" without committing to an agenda yet; POST /{id}/convert on the
# route turns one into a real draft Meeting and deletes the placeholder.
# ─────────────────────────────────────────────────────────────────────────


class SavedDate(Base):
    __tablename__ = "saved_dates"

    id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), index=True, nullable=False)

    kind: Mapped[str] = mapped_column(String, nullable=False, default="meeting")  # meeting | assembly
    date: Mapped[date] = mapped_column(Date, nullable=False)
    note: Mapped[str | None] = mapped_column(String)

    created_by_user_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), nullable=False)  # no FK, see above
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ─────────────────────────────────────────────────────────────────────────
# TopicPool — backlog of candidate topics feeding meeting agendas
# ─────────────────────────────────────────────────────────────────────────


class TopicPool(Base):
    __tablename__ = "topic_pool"

    id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), index=True, nullable=False)

    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    invited_guests: Mapped[list | None] = mapped_column(JSON)

    # manual | public_suggestion
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    suggested_by: Mapped[UUID | None] = mapped_column(SQLUUID(as_uuid=True))  # user id, no FK
    priority: Mapped[int | None] = mapped_column(Integer)

    # pending_review | approved | in_meeting | used | rejected
    status: Mapped[str] = mapped_column(String, nullable=False, default="pending_review", index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

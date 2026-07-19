"""meetings core — meetings, topics, topic_pool

Revision ID: b59cfe352cb7
Revises:
Create Date: 2026-07-15

Hand-written (no live Postgres available to autogenerate against at
authoring time) — mirrors app/models.py exactly. Verify with
`alembic check` / a fresh `alembic upgrade head` against a real DB before
merging.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b59cfe352cb7"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meetings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="meeting"),
        sa.Column("number", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("time_start", sa.Time(), nullable=True),
        sa.Column("time_end", sa.Time(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("online_meeting_url", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("attendees_invited", postgresql.JSON(), nullable=True),
        sa.Column("attendees_present", postgresql.JSON(), nullable=True),
        sa.Column("attendees_responses", postgresql.JSON(), nullable=True),
        sa.Column("internal_approvals", postgresql.JSON(), nullable=True),
        sa.Column("protocol_approvals", postgresql.JSON(), nullable=True),
        sa.Column("protocol_to_approve_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("quorum_required", sa.Integer(), nullable=True),
        sa.Column("quorum_reached", sa.Boolean(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("invite_sent_internal_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("invite_sent_public_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("protocol_generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(
            ["protocol_to_approve_id"], ["meetings.id"], ondelete="SET NULL", name="fk_meetings_protocol_to_approve"
        ),
    )
    op.create_index("ix_meetings_tenant_id", "meetings", ["tenant_id"])
    op.create_index("ix_meetings_status", "meetings", ["status"])

    op.create_table(
        "topic_pool",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("invited_guests", postgresql.JSON(), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="manual"),
        sa.Column("suggested_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending_review"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_topic_pool_tenant_id", "topic_pool", ["tenant_id"])
    op.create_index("ix_topic_pool_status", "topic_pool", ["status"])

    op.create_table(
        "topics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("duration_minutes", sa.Integer(), nullable=True),
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("deferred_to_meeting_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("decision_text", sa.Text(), nullable=True),
        sa.Column("action_item", sa.Text(), nullable=True),
        sa.Column("timer_elapsed", sa.Integer(), nullable=True),
        sa.Column("source_pool_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("suggested_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_default_first", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_default_last", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("approval_status", sa.String(), nullable=True),
        sa.Column("topic_notes", sa.Text(), nullable=True),
        sa.Column("invited_guests", postgresql.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE", name="fk_topics_meeting"),
        sa.ForeignKeyConstraint(
            ["deferred_to_meeting_id"], ["meetings.id"], ondelete="SET NULL", name="fk_topics_deferred_to_meeting"
        ),
        sa.ForeignKeyConstraint(
            ["source_pool_id"], ["topic_pool.id"], ondelete="SET NULL", name="fk_topics_source_pool"
        ),
    )
    op.create_index("ix_topics_tenant_id", "topics", ["tenant_id"])
    op.create_index("ix_topics_meeting_id", "topics", ["meeting_id"])


def downgrade() -> None:
    op.drop_index("ix_topics_meeting_id", table_name="topics")
    op.drop_index("ix_topics_tenant_id", table_name="topics")
    op.drop_table("topics")

    op.drop_index("ix_topic_pool_status", table_name="topic_pool")
    op.drop_index("ix_topic_pool_tenant_id", table_name="topic_pool")
    op.drop_table("topic_pool")

    op.drop_index("ix_meetings_status", table_name="meetings")
    op.drop_index("ix_meetings_tenant_id", table_name="meetings")
    op.drop_table("meetings")

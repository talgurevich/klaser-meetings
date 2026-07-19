"""meeting_invites — invitees + RSVP for a meeting invitation

Revision ID: a1b2c3d4e5f6
Revises: f7a2c8e1b3d5
Create Date: 2026-07-20

Hand-written (no live Postgres available to autogenerate against at
authoring time) — mirrors app/models.py exactly. Verify with
`alembic check` / a fresh `alembic upgrade head` against a real DB before
merging.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "f7a2c8e1b3d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meeting_invites",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("meeting_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invitee_kind", sa.String(), nullable=False),
        sa.Column("invitee_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column("token", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE", name="fk_meeting_invites_meeting"),
        sa.UniqueConstraint("meeting_id", "invitee_kind", "invitee_id", name="uq_meeting_invites_invitee"),
    )
    op.create_index("ix_meeting_invites_tenant_id", "meeting_invites", ["tenant_id"])
    op.create_index("ix_meeting_invites_meeting_id", "meeting_invites", ["meeting_id"])
    op.create_index("ix_meeting_invites_token", "meeting_invites", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_meeting_invites_token", table_name="meeting_invites")
    op.drop_index("ix_meeting_invites_meeting_id", table_name="meeting_invites")
    op.drop_index("ix_meeting_invites_tenant_id", table_name="meeting_invites")
    op.drop_table("meeting_invites")

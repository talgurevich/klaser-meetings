"""meeting_recordings — audio recordings per meeting

Revision ID: a1c3e5f7b9d1
Revises: f7b9c1d3e5a7
Create Date: 2026-07-26

Stores meeting audio (browser mic capture or uploaded file) in a dedicated
table. Audio bytes live in `audio`; transcript/transcription_status are
reserved for the later AI layer. Hand-written — mirrors app/models.py;
verify with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision: str = "a1c3e5f7b9d1"
down_revision: str | None = "f7b9c1d3e5a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meeting_recordings",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", PGUUID(as_uuid=True), nullable=False),
        sa.Column("meeting_id", PGUUID(as_uuid=True), nullable=False),
        sa.Column("created_by_user_id", PGUUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False, server_default="audio/webm"),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="mic"),
        sa.Column("audio", sa.LargeBinary(), nullable=False),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column(
            "transcription_status", sa.String(), nullable=False, server_default="none"
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
    )
    op.create_index(
        "ix_meeting_recordings_tenant_id", "meeting_recordings", ["tenant_id"]
    )
    op.create_index(
        "ix_meeting_recordings_meeting_id", "meeting_recordings", ["meeting_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_meeting_recordings_meeting_id", table_name="meeting_recordings")
    op.drop_index("ix_meeting_recordings_tenant_id", table_name="meeting_recordings")
    op.drop_table("meeting_recordings")

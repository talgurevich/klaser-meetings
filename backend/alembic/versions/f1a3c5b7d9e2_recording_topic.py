"""meeting_recordings.topic_id — per-topic recordings

Revision ID: f1a3c5b7d9e2
Revises: e9f1a3c5b7d9
Create Date: 2026-07-28

Recordings are now captured per agenda topic. Nullable so existing
meeting-level recordings keep null. Hand-written — mirrors app/models.py;
verify with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision: str = "f1a3c5b7d9e2"
down_revision: str | None = "e9f1a3c5b7d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "meeting_recordings",
        sa.Column("topic_id", PGUUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_meeting_recordings_topic_id", "meeting_recordings", ["topic_id"]
    )
    op.create_foreign_key(
        "fk_meeting_recordings_topic_id",
        "meeting_recordings",
        "topics",
        ["topic_id"],
        ["id"],
        ondelete="CASCADE",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_meeting_recordings_topic_id", "meeting_recordings", type_="foreignkey"
    )
    op.drop_index("ix_meeting_recordings_topic_id", table_name="meeting_recordings")
    op.drop_column("meeting_recordings", "topic_id")

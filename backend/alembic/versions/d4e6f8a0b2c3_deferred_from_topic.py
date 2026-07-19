"""topics.deferred_from_topic_id — links a deferred-copy back to its source

Revision ID: d4e6f8a0b2c3
Revises: c2d4e6f8a0b1
Create Date: 2026-07-27

Hand-written (no live Postgres available to autogenerate against at
authoring time) — mirrors app/models.py exactly. Verify with
`alembic check` / a fresh `alembic upgrade head` against a real DB before
merging.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d4e6f8a0b2c3"
down_revision: str | None = "c2d4e6f8a0b1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "topics",
        sa.Column("deferred_from_topic_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_topics_deferred_from_topic",
        "topics",
        "topics",
        ["deferred_from_topic_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_topics_deferred_from_topic", "topics", type_="foreignkey")
    op.drop_column("topics", "deferred_from_topic_id")

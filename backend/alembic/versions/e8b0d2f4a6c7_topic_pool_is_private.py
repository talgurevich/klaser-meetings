"""topic_pool.is_private — mark a pool topic as חסוי

Revision ID: e8b0d2f4a6c7
Revises: d7f9a1c3e5b6
Create Date: 2026-08-17

Adds topic_pool.is_private, mirroring topics.is_private. Picking a
confidential pool item into a meeting agenda carries the flag onto the
created Topic. Hand-written — mirrors app/models.py; verify with
`alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e8b0d2f4a6c7"
down_revision: str | None = "d7f9a1c3e5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "topic_pool",
        sa.Column("is_private", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("topic_pool", "is_private")

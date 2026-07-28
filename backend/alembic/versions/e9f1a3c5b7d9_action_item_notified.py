"""topics.action_item_notified_at — track task-owner emails

Revision ID: e9f1a3c5b7d9
Revises: d7e9f1a3c5b8
Create Date: 2026-07-28

Lets lock/distribute/publish each email newly-assigned follow-up owners
without re-emailing anyone. Hand-written — mirrors app/models.py; verify
with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e9f1a3c5b7d9"
down_revision: str | None = "d7e9f1a3c5b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "topics",
        sa.Column("action_item_notified_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("topics", "action_item_notified_at")

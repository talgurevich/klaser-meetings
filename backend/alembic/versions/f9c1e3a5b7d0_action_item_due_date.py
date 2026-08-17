"""topics.action_item_due_date — יעד לביצוע for a follow-up task

Revision ID: f9c1e3a5b7d0
Revises: e8b0d2f4a6c7
Create Date: 2026-08-17

Adds a nullable target date to the follow-up task, set from the
tenant-wide משימות לביצוע list. Hand-written — mirrors app/models.py;
verify with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f9c1e3a5b7d0"
down_revision: str | None = "e8b0d2f4a6c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("topics", sa.Column("action_item_due_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("topics", "action_item_due_date")

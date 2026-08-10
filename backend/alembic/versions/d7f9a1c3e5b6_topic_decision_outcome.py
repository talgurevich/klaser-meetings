"""topic decision_outcome — אושר / לא אושר when closing a topic

Revision ID: d7f9a1c3e5b6
Revises: c6e8a0b2d4f5
Create Date: 2026-08-05

Adds topics.decision_outcome ("approved" / "rejected"), chosen via radio
buttons when a topic is closed during a meeting/assembly. Hand-written —
mirrors app/models.py; verify with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d7f9a1c3e5b6"
down_revision: str | None = "c6e8a0b2d4f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("topics", sa.Column("decision_outcome", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("topics", "decision_outcome")

"""participants.join_date — תאריך הצטרפות

Revision ID: c4e6a8b0d2f3
Revises: b3d5f7a9c1e2
Create Date: 2026-07-23

Optional join date for אלפון contacts. Hand-written — mirrors
app/models.py; verify with a fresh `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4e6a8b0d2f3"
down_revision: str | None = "b3d5f7a9c1e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("join_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "join_date")

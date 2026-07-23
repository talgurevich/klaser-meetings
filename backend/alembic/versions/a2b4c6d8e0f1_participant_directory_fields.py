"""participants: first_name, last_name, nickname, role — אלפון fields

Revision ID: a2b4c6d8e0f1
Revises: f9a3c1d7e2b4
Create Date: 2026-07-23

Structured directory fields from the CSV import (and the fuller add form).
full_name stays the canonical display string. "פעיל" is not a separate
column — it maps to the existing public_send flag. Hand-written — mirrors
app/models.py; verify with a fresh `alembic upgrade head` before merging.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a2b4c6d8e0f1"
down_revision: str | None = "f9a3c1d7e2b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("first_name", sa.String(), nullable=True))
    op.add_column("participants", sa.Column("last_name", sa.String(), nullable=True))
    op.add_column("participants", sa.Column("nickname", sa.String(), nullable=True))
    op.add_column("participants", sa.Column("role", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "role")
    op.drop_column("participants", "nickname")
    op.drop_column("participants", "last_name")
    op.drop_column("participants", "first_name")

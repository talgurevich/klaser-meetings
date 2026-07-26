"""participants.roles — multi-value תפקידים

Revision ID: e6a8c0d2f4b6
Revises: d5f7a9c1e3b4
Create Date: 2026-07-26

Multi-select role titles for a contact, superseding the single `role`
column (kept as a read fallback for existing rows). Hand-written — mirrors
app/models.py; verify with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e6a8c0d2f4b6"
down_revision: str | None = "d5f7a9c1e3b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("roles", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "roles")

"""tenant_settings.role_titles — org-defined role/position types

Revision ID: d5f7a9c1e3b4
Revises: c4e6a8b0d2f3
Create Date: 2026-07-26

List of role titles offered as the תפקיד dropdown in the אלפון.
Hand-written — mirrors app/models.py; verify with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d5f7a9c1e3b4"
down_revision: str | None = "c4e6a8b0d2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenant_settings", sa.Column("role_titles", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenant_settings", "role_titles")

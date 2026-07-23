"""participants.edit_permission — manual "הרשאות עריכה" override

Revision ID: b3d5f7a9c1e2
Revises: a2b4c6d8e0f1
Create Date: 2026-07-23

Manual edit-permission flag. Effective permission is this OR an email
match with a tenant identity user (derived at read time). Hand-written —
mirrors app/models.py; verify with a fresh `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b3d5f7a9c1e2"
down_revision: str | None = "a2b4c6d8e0f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("edit_permission", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("participants", "edit_permission")

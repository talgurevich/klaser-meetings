"""topics.action_item_done — completion flag for follow-up tasks

Revision ID: c2d4e6f8a0b1
Revises: a1b2c3d4e5f6
Create Date: 2026-07-16

Hand-written (no live Postgres available to autogenerate against at
authoring time) — mirrors app/models.py exactly. Verify with
`alembic check` / a fresh `alembic upgrade head` against a real DB before
merging.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c2d4e6f8a0b1"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "topics",
        sa.Column("action_item_done", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("topics", "action_item_done")

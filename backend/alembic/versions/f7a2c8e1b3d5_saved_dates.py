"""saved_dates — placeholder future meeting dates

Revision ID: f7a2c8e1b3d5
Revises: d3f1a9c4e2b7
Create Date: 2026-07-16

Hand-written (no live Postgres available to autogenerate against at
authoring time) — mirrors app/models.py exactly. Verify with
`alembic check` / a fresh `alembic upgrade head` against a real DB before
merging.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f7a2c8e1b3d5"
down_revision: str | None = "d3f1a9c4e2b7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_dates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="meeting"),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_saved_dates_tenant_id", "saved_dates", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_saved_dates_tenant_id", table_name="saved_dates")
    op.drop_table("saved_dates")

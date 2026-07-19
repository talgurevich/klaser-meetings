"""participants — non-login contacts tracked for meeting attendance

Revision ID: d3f1a9c4e2b7
Revises: b59cfe352cb7
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

revision: str = "d3f1a9c4e2b7"
down_revision: str | None = "b59cfe352cb7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_participants_tenant_id", "participants", ["tenant_id"])

    op.add_column("meetings", sa.Column("participant_ids", postgresql.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("meetings", "participant_ids")

    op.drop_index("ix_participants_tenant_id", table_name="participants")
    op.drop_table("participants")

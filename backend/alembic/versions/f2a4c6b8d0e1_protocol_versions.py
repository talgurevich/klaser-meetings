"""protocol_versions — per-distribution protocol snapshots

Revision ID: f2a4c6b8d0e1
Revises: a3c5e7b9d1f4
Create Date: 2026-08-02

An immutable snapshot of a meeting's protocol content, recorded each time the
protocol is distributed to the committee for approval (deduped by content, so
version 1 = the first distributed protocol and each edit that gets
re-distributed bumps the number). Powers the "גרסאות" history on the protocol
page. Hand-written — mirrors app/models.py; verify with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision: str = "f2a4c6b8d0e1"
down_revision: str | None = "a3c5e7b9d1f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "protocol_versions",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", PGUUID(as_uuid=True), nullable=False),
        sa.Column("meeting_id", PGUUID(as_uuid=True), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("meeting_id", "version_number", name="uq_protocol_versions_number"),
    )
    op.create_index("ix_protocol_versions_tenant_id", "protocol_versions", ["tenant_id"])
    op.create_index("ix_protocol_versions_meeting_id", "protocol_versions", ["meeting_id"])


def downgrade() -> None:
    op.drop_index("ix_protocol_versions_meeting_id", table_name="protocol_versions")
    op.drop_index("ix_protocol_versions_tenant_id", table_name="protocol_versions")
    op.drop_table("protocol_versions")

"""meeting_documents — files attached to a meeting/assembly

Revision ID: b5d7f9a1c3e4
Revises: a4c6e8b0d2f3
Create Date: 2026-08-04

Arbitrary files attached to a meeting (added during setup and through the
process up to publication; view-only after). Bytes stored on the row like
meeting_recordings. Hand-written — mirrors app/models.py; verify with
`alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision: str = "b5d7f9a1c3e4"
down_revision: str | None = "a4c6e8b0d2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meeting_documents",
        sa.Column("id", PGUUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", PGUUID(as_uuid=True), nullable=False),
        sa.Column("meeting_id", PGUUID(as_uuid=True), nullable=False),
        sa.Column("uploaded_by_user_id", PGUUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column(
            "content_type", sa.String(), nullable=False, server_default="application/octet-stream"
        ),
        sa.Column("size_bytes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["meeting_id"], ["meetings.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_meeting_documents_tenant_id", "meeting_documents", ["tenant_id"])
    op.create_index("ix_meeting_documents_meeting_id", "meeting_documents", ["meeting_id"])


def downgrade() -> None:
    op.drop_index("ix_meeting_documents_meeting_id", table_name="meeting_documents")
    op.drop_index("ix_meeting_documents_tenant_id", table_name="meeting_documents")
    op.drop_table("meeting_documents")

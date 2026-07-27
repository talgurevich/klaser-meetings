"""protocol receipt confirmation gate

Revision ID: d7e9f1a3c5b8
Revises: c5b7d9e1f3a2
Create Date: 2026-07-27

Adds the ≥50%-of-invitees protocol-receipt gate before public publish:
meeting_invites.protocol_receipt_confirmed_at (per-invitee) and
meetings.protocol_approval_sent_at (when the approval distribution was sent).
Hand-written — mirrors app/models.py; verify with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d7e9f1a3c5b8"
down_revision: str | None = "c5b7d9e1f3a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "meeting_invites",
        sa.Column("protocol_receipt_confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "meetings",
        sa.Column("protocol_approval_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("meetings", "protocol_approval_sent_at")
    op.drop_column("meeting_invites", "protocol_receipt_confirmed_at")

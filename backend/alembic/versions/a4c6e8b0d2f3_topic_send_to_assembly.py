"""topic send-to-assembly — escalate a committee-meeting topic to the assembly

Revision ID: a4c6e8b0d2f3
Revises: f2a4c6b8d0e1
Create Date: 2026-08-04

Adds the "שלח לאסיפה" queue on topics: sent_to_assembly_at (queued),
sent_to_assembly_meeting_id (the assembly it landed in, null while waiting for
the next assembly to be created), and from_committee_meeting (set on the copy
placed in the assembly, for the "הועבר מפגישת הועד" badge). Hand-written —
mirrors app/models.py; verify with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID as PGUUID

revision: str = "a4c6e8b0d2f3"
down_revision: str | None = "f2a4c6b8d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "topics", sa.Column("sent_to_assembly_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "topics", sa.Column("sent_to_assembly_meeting_id", PGUUID(as_uuid=True), nullable=True)
    )
    op.add_column(
        "topics",
        sa.Column(
            "from_committee_meeting",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.create_foreign_key(
        "fk_topics_sent_to_assembly_meeting",
        "topics",
        "meetings",
        ["sent_to_assembly_meeting_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_topics_sent_to_assembly_meeting", "topics", type_="foreignkey")
    op.drop_column("topics", "from_committee_meeting")
    op.drop_column("topics", "sent_to_assembly_meeting_id")
    op.drop_column("topics", "sent_to_assembly_at")

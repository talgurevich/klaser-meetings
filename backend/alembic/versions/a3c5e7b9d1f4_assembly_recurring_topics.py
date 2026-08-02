"""tenant_settings assembly recurring topics

Revision ID: a3c5e7b9d1f4
Revises: f1a3c5b7d9e2
Create Date: 2026-07-28

Parallel recurring-topic config for אסיפות (kind='assembly'), mirroring the
existing meeting ones. Hand-written — mirrors app/models.py; verify with
`alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a3c5e7b9d1f4"
down_revision: str | None = "f1a3c5b7d9e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tenant_settings", sa.Column("assembly_recurring_topic_first_title", sa.String(), nullable=True))
    op.add_column("tenant_settings", sa.Column("assembly_recurring_topic_first_duration", sa.Integer(), nullable=True))
    op.add_column("tenant_settings", sa.Column("assembly_recurring_topic_last_title", sa.String(), nullable=True))
    op.add_column("tenant_settings", sa.Column("assembly_recurring_topic_last_duration", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tenant_settings", "assembly_recurring_topic_last_duration")
    op.drop_column("tenant_settings", "assembly_recurring_topic_last_title")
    op.drop_column("tenant_settings", "assembly_recurring_topic_first_duration")
    op.drop_column("tenant_settings", "assembly_recurring_topic_first_title")

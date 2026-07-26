"""topics.action_item_owner — responsible person for a follow-up

Revision ID: f7b9c1d3e5a7
Revises: e6a8c0d2f4b6
Create Date: 2026-07-26

Free-text name of who's responsible for a topic's follow-up task, chosen
when the follow-up is created. Hand-written — mirrors app/models.py; verify
with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f7b9c1d3e5a7"
down_revision: str | None = "e6a8c0d2f4b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("topics", sa.Column("action_item_owner", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("topics", "action_item_owner")

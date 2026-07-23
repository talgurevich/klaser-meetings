"""participants.public_send — public distribution flag for אלפון contacts

Revision ID: f9a3c1d7e2b4
Revises: e5f7b1c3d9a2
Create Date: 2026-07-23

Hand-written (no live Postgres available to autogenerate against at
authoring time) — mirrors app/models.py exactly. Existing contacts default
to on (server_default "true") so publishing keeps reaching them. Verify
with a fresh `alembic upgrade head` against a real DB before merging.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f9a3c1d7e2b4"
down_revision: str | None = "e5f7b1c3d9a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "participants",
        sa.Column("public_send", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("participants", "public_send")

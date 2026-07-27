"""participants.signature_image — role-holder signature

Revision ID: c5b7d9e1f3a2
Revises: a1c3e5f7b9d1
Create Date: 2026-07-26

(Filename keeps the original b3d5f7a9c1e2_ prefix but the real revision id is
c5b7d9e1f3a2 — the first id collided with participant_edit_permission.)

Per-contact signature image (base64) so role-holders from the אלפון can be
shown in the protocol/invite signature block. Hand-written — mirrors
app/models.py; verify with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c5b7d9e1f3a2"
down_revision: str | None = "a1c3e5f7b9d1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("participants", sa.Column("signature_image_data", sa.Text(), nullable=True))
    op.add_column("participants", sa.Column("signature_image_mime", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("participants", "signature_image_mime")
    op.drop_column("participants", "signature_image_data")

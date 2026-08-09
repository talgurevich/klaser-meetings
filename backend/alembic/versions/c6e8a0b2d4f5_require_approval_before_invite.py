"""tenant setting: require committee approval before the public invite

Revision ID: c6e8a0b2d4f5
Revises: b5d7f9a1c3e4
Create Date: 2026-08-05

Per-kind toggle for whether distributing the public אלפון invitation must wait
for a committee majority to approve first. Defaults preserve prior behaviour:
meetings unrestricted (false), assemblies gated (true). Hand-written — mirrors
app/models.py; verify with `alembic upgrade head`.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c6e8a0b2d4f5"
down_revision: str | None = "b5d7f9a1c3e4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "tenant_settings",
        sa.Column(
            "meeting_require_approval_before_invite",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column(
        "tenant_settings",
        sa.Column(
            "assembly_require_approval_before_invite",
            sa.Boolean(),
            nullable=False,
            server_default="true",
        ),
    )


def downgrade() -> None:
    op.drop_column("tenant_settings", "assembly_require_approval_before_invite")
    op.drop_column("tenant_settings", "meeting_require_approval_before_invite")

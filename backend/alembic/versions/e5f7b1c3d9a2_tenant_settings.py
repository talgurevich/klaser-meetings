"""tenant_settings, signatories, user_signatures — org branding/defaults

Revision ID: e5f7b1c3d9a2
Revises: d4e6f8a0b2c3
Create Date: 2026-07-21

Hand-written (no live Postgres available to autogenerate against at
authoring time) — mirrors app/models.py exactly. Verify with
`alembic check` / a fresh `alembic upgrade head` against a real DB before
merging.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e5f7b1c3d9a2"
down_revision: str | None = "d4e6f8a0b2c3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "tenant_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False, unique=True),
        sa.Column("org_name", sa.String(), nullable=True),
        sa.Column("logo_data", sa.Text(), nullable=True),
        sa.Column("logo_mime", sa.String(), nullable=True),
        sa.Column("email_signature", sa.Text(), nullable=True),
        sa.Column("stamp_data", sa.Text(), nullable=True),
        sa.Column("stamp_mime", sa.String(), nullable=True),
        sa.Column("meeting_location", sa.String(), nullable=True),
        sa.Column("meeting_weekday", sa.Integer(), nullable=True),
        sa.Column("meeting_start_time", sa.Time(), nullable=True),
        sa.Column("meeting_end_time", sa.Time(), nullable=True),
        sa.Column("assembly_location", sa.String(), nullable=True),
        sa.Column("assembly_weekday", sa.Integer(), nullable=True),
        sa.Column("assembly_start_time", sa.Time(), nullable=True),
        sa.Column("assembly_end_time", sa.Time(), nullable=True),
        sa.Column("recurring_topic_first_title", sa.String(), nullable=True),
        sa.Column("recurring_topic_first_duration", sa.Integer(), nullable=True),
        sa.Column("recurring_topic_last_title", sa.String(), nullable=True),
        sa.Column("recurring_topic_last_duration", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_tenant_settings_tenant_id", "tenant_settings", ["tenant_id"])

    op.create_table(
        "signatories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "tenant_settings_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("tenant_settings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("member_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("member_display_name", sa.String(), nullable=True),
        sa.Column("member_role", sa.String(), nullable=True),
        sa.Column("position_title", sa.String(), nullable=True),
        sa.Column("signature_text", sa.Text(), nullable=True),
        sa.Column("signature_image_data", sa.Text(), nullable=True),
        sa.Column("signature_image_mime", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("ix_signatories_tenant_id", "signatories", ["tenant_id"])

    op.create_table(
        "user_signatures",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("signature_image_data", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("tenant_id", "user_id", name="uq_user_signatures_tenant_user"),
    )
    op.create_index("ix_user_signatures_tenant_id", "user_signatures", ["tenant_id"])
    op.create_index("ix_user_signatures_user_id", "user_signatures", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_user_signatures_user_id", table_name="user_signatures")
    op.drop_index("ix_user_signatures_tenant_id", table_name="user_signatures")
    op.drop_table("user_signatures")

    op.drop_index("ix_signatories_tenant_id", table_name="signatories")
    op.drop_table("signatories")

    op.drop_index("ix_tenant_settings_tenant_id", table_name="tenant_settings")
    op.drop_table("tenant_settings")

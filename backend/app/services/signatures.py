"""Builds the combined signature-block rows for the protocol / invite PDFs.

Two sources, shown together: the admin-curated Signatory list (up to 3, from
tenant settings) plus every אלפון role-holder (a Participant with a role from
TenantSettings.role_titles) who has uploaded a signature image. Each row is a
lightweight object exposing exactly the attributes pdf_common.signatures reads.
"""
from types import SimpleNamespace
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Participant, TenantSettings


def _role_holder_rows(db: Session, tenant_id: UUID) -> list[SimpleNamespace]:
    parts = (
        db.execute(
            select(Participant).where(
                Participant.tenant_id == tenant_id,
                Participant.signature_image_data.is_not(None),
            )
        )
        .scalars()
        .all()
    )
    rows: list[SimpleNamespace] = []
    for p in sorted(parts, key=lambda x: x.full_name):
        roles = p.roles or ([p.role] if p.role else [])
        if not roles:  # only actual role-holders appear in the signature block
            continue
        rows.append(
            SimpleNamespace(
                signature_image_data=p.signature_image_data,
                signature_image_mime=p.signature_image_mime,
                position_title=", ".join(roles),
                member_role=None,
                member_display_name=p.full_name,
            )
        )
    return rows


def combined_signatory_rows(db: Session, settings_row: TenantSettings) -> list:
    """Admin-curated signatories (ordered) followed by אלפון role-holders
    with a signature. Any object with signature_image_data/mime,
    position_title, member_role, member_display_name works as a row."""
    manual = sorted(settings_row.signatories, key=lambda s: s.order)
    return list(manual) + _role_holder_rows(db, settings_row.tenant_id)

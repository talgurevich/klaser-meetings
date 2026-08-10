"""Participant directory ("אלפון") — non-login contacts (name, phone,
email, role) tenants track for meeting attendance and the public
distribution list. NOT identity Users: they never authenticate and have no
row in klaser-identity at all (see app/models.py's Participant docstring).

"הרשאות עריכה" is not stored — it's derived: a contact counts as a system
user (and thus an editor) when its email matches an identity user in the
tenant. See _system_user_emails / _to_out.

Access, deliberately broader than most editor-gated routes here: any
entitled tenant member can list/create, matching the explicit product
requirement that "system users and admin" (not just editors) can add
contacts. Editing/removing an existing entry — and bulk CSV import — is
editor-gated.
"""
import csv
import datetime as dt
import io
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Participant
from app.schemas import (
    ParticipantCreate,
    ParticipantImportResult,
    ParticipantOut,
    ParticipantUpdate,
)
from app.services.identity import IdentityUser, identity_service, require_entitlement
from app.services.images import data_url, read_and_validate_image
from app.services.permissions import require_editor

router = APIRouter()


def _system_user_emails(tenant_id: str) -> set[str]:
    """Lowercased emails of the tenant's identity users, for the
    is_system_user derivation. Degrades to empty (everyone non-system) if
    the roster can't be fetched — e.g. no service token configured."""
    try:
        return {
            (u.get("email") or "").strip().lower()
            for u in identity_service.list_users(tenant_id)
            if u.get("email")
        }
    except Exception:  # noqa: BLE001 — roster is best-effort here
        return set()


def _to_out(p: Participant, system_emails: set[str]) -> ParticipantOut:
    out = ParticipantOut.model_validate(p)
    out.is_system_user = bool(p.email) and p.email.strip().lower() in system_emails
    # Fall back to the legacy single `role` for rows saved before roles.
    if not out.roles and p.role:
        out.roles = [p.role]
    out.signature_image_url = data_url(p.signature_image_data, p.signature_image_mime)
    return out


def _get_participant_or_404(db: Session, tenant_id: UUID, participant_id: UUID) -> Participant:
    p = db.execute(
        select(Participant).where(
            Participant.id == participant_id, Participant.tenant_id == tenant_id
        )
    ).scalar_one_or_none()
    if p is None:
        raise HTTPException(status_code=404, detail="איש הקשר לא נמצא")
    return p


def _compose_full_name(full_name: str | None, first: str | None, last: str | None, email: str | None) -> str:
    if full_name and full_name.strip():
        return full_name.strip()
    composed = " ".join(part for part in [(first or "").strip(), (last or "").strip()] if part).strip()
    return composed or (email or "").strip() or "ללא שם"


@router.get("", response_model=list[ParticipantOut])
def list_participants(
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[ParticipantOut]:
    stmt = (
        select(Participant)
        .where(Participant.tenant_id == UUID(user.tenant_id))
        .order_by(Participant.full_name)
    )
    rows = db.execute(stmt).scalars().all()
    system_emails = _system_user_emails(user.tenant_id)
    return [_to_out(p, system_emails) for p in rows]


@router.post("", response_model=ParticipantOut, status_code=201)
def create_participant(
    body: ParticipantCreate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> ParticipantOut:
    participant = Participant(
        tenant_id=UUID(user.tenant_id),
        full_name=_compose_full_name(body.full_name, body.first_name, body.last_name, body.email),
        first_name=body.first_name,
        last_name=body.last_name,
        nickname=body.nickname,
        phone=body.phone,
        email=body.email,
        role=body.role,
        roles=body.roles,
        join_date=body.join_date,
        public_send=body.public_send,
        edit_permission=body.edit_permission,
        created_by_user_id=UUID(user.user_id),
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return _to_out(participant, _system_user_emails(user.tenant_id))


# ─────────────────────────────────────────────────────────────────────────
# CSV import — resilient header detection. Rather than requiring an exact set
# of Hebrew headers, we match each column in the file to a canonical field by
# a list of aliases (Hebrew + English), most-specific first, so exports from
# different tools ("שם מלא" vs. "שם פרטי"/"שם משפחה", "טלפון" vs. "נייד",
# "מייל" vs. "אימייל", …) all import correctly.
# ─────────────────────────────────────────────────────────────────────────

# (canonical field, aliases) — ORDER MATTERS: specific fields are matched
# before generic ones so e.g. "שם פרטי" is claimed by first_name before the
# bare "שם" alias of full_name can grab it.
_FIELD_ALIASES: list[tuple[str, list[str]]] = [
    ("email", ["אימייל", "מייל", "דוא\"ל", "דואל", "דואר אלקטרוני", "email", "e-mail", "mail"]),
    ("phone", ["נייד", "טלפון", "טל", "פלאפון", "מספר טלפון", "phone", "mobile", "cell", "tel"]),
    ("first_name", ["שם פרטי", "פרטי", "first name", "firstname", "first"]),
    ("last_name", ["שם משפחה", "משפחה", "last name", "lastname", "surname", "family", "last"]),
    ("nickname", ["כינוי", "nickname", "nick"]),
    ("role", ["תפקיד", "תפקידים", "role", "position", "title"]),
    ("edit_permission", ["הרשאות עריכה", "הרשאת עריכה", "חבר ועד", "ועד", "עורך", "editor", "committee"]),
    ("public_send", ["פעיל", "חבר", "תפוצה", "שליחה", "פרסום", "active", "member", "public"]),
    ("join_date", ["תאריך הצטרפות", "הצטרפות", "join date", "joined", "תאריך"]),
    ("full_name", ["שם מלא", "שם ומשפחה", "שם החבר", "full name", "fullname", "name", "שם"]),
]

_TRUE_TOKENS = {"כן", "yes", "y", "true", "1", "v", "✓", "x", "+", "נכון", "כ"}
_FALSE_TOKENS = {"לא", "no", "n", "false", "0", "-", "✗", "אין"}


def _norm(h: str | None) -> str:
    return re.sub(r"\s+", " ", (h or "").replace("﻿", "").strip().lower())


def _map_headers(fieldnames: list[str]) -> dict[str, str]:
    """canonical field -> the actual header in this file. Each header is
    claimed by at most one field; specific fields win (see order above)."""
    headers = [h for h in fieldnames if h]
    norm = {h: _norm(h) for h in headers}
    used: set[str] = set()
    out: dict[str, str] = {}
    for field, aliases in _FIELD_ALIASES:
        na = [_norm(a) for a in aliases]
        for h in headers:
            if h in used:
                continue
            nh = norm[h]
            if any(nh == a or a in nh for a in na):
                out[field] = h
                used.add(h)
                break
    return out


def _bool_token(v: str, default: bool) -> bool:
    s = _norm(v)
    if s in _TRUE_TOKENS:
        return True
    if s in _FALSE_TOKENS:
        return False
    return default


def _parse_date(v: str) -> dt.date | None:
    s = (v or "").strip()
    if not s:
        return None
    for fmt in ("%d/%m/%Y", "%d.%m.%Y", "%d-%m-%Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def _digits(v: str | None) -> str:
    return re.sub(r"\D", "", v or "")


@router.post("/import", response_model=ParticipantImportResult)
def import_participants(
    file: UploadFile,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> ParticipantImportResult:
    """Bulk-import contacts from a CSV. Column headers are matched fuzzily to
    fields (full/first/last name, nickname, phone, email, role, active,
    edit-permission, join date) — so many export formats work. Duplicate rows
    are skipped: by email when present, otherwise by name + phone, so
    re-uploading the same file doesn't create duplicates."""
    raw = file.file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("cp1255", errors="replace")  # legacy Hebrew fallback

    reader = csv.DictReader(io.StringIO(text))
    cols = _map_headers(reader.fieldnames or [])
    tenant_id = UUID(user.tenant_id)

    def g(row: dict, field: str) -> str:
        header = cols.get(field)
        return (row.get(header) or "").strip() if header else ""

    # Existing keys for dedupe: emails, plus (name, phone-digits) for
    # emailless contacts so re-uploading a phone-only list doesn't duplicate.
    existing_emails: set[str] = set()
    existing_np: set[tuple[str, str]] = set()
    for name, phone, email in db.execute(
        select(Participant.full_name, Participant.phone, Participant.email).where(
            Participant.tenant_id == tenant_id
        )
    ):
        if email and email.strip():
            existing_emails.add(email.strip().lower())
        else:
            existing_np.add((_norm(name), _digits(phone)))

    imported = 0
    skipped = 0
    seen_emails: set[str] = set()
    seen_np: set[tuple[str, str]] = set()
    for row in reader:
        first = g(row, "first_name")
        last = g(row, "last_name")
        full = g(row, "full_name")
        email = g(row, "email")
        phone = g(row, "phone")
        role = g(row, "role")
        name = _compose_full_name(full or None, first, last, email)

        # Skip only truly blank rows (nothing identifying at all).
        if not (full or first or last or email or phone):
            continue

        if email:
            key = email.lower()
            if key in existing_emails or key in seen_emails:
                skipped += 1
                continue
            seen_emails.add(key)
        else:
            np = (_norm(name), _digits(phone))
            if np in existing_np or np in seen_np:
                skipped += 1
                continue
            seen_np.add(np)

        db.add(
            Participant(
                tenant_id=tenant_id,
                full_name=name,
                first_name=first or None,
                last_name=last or None,
                nickname=g(row, "nickname") or None,
                phone=phone or None,
                email=email or None,
                role=role or None,
                roles=[role] if role else None,
                join_date=_parse_date(g(row, "join_date")),
                # "פעיל"/"חבר" — public-send flag; absent or affirmative => on.
                public_send=_bool_token(g(row, "public_send"), True),
                # "הרשאות עריכה"/"חבר ועד" manual override (email match still
                # applies on top, derived at read time).
                edit_permission=_bool_token(g(row, "edit_permission"), False),
                created_by_user_id=UUID(user.user_id),
            )
        )
        imported += 1

    db.commit()
    return ParticipantImportResult(imported=imported, skipped=skipped)


@router.patch("/{participant_id}", response_model=ParticipantOut)
def update_participant(
    participant_id: UUID,
    body: ParticipantUpdate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> ParticipantOut:
    participant = db.execute(
        select(Participant).where(
            Participant.id == participant_id, Participant.tenant_id == UUID(user.tenant_id)
        )
    ).scalar_one_or_none()
    if participant is None:
        raise HTTPException(status_code=404, detail="איש/אשת הקשר לא נמצא/ה")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(participant, field, value)
    # Keep full_name coherent when the name parts change and no explicit
    # full_name was provided in this request.
    if "full_name" not in updates and ("first_name" in updates or "last_name" in updates):
        participant.full_name = _compose_full_name(
            None, participant.first_name, participant.last_name, participant.email
        )

    db.commit()
    db.refresh(participant)
    return _to_out(participant, _system_user_emails(user.tenant_id))


@router.delete("/{participant_id}", status_code=204)
def delete_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> None:
    participant = db.execute(
        select(Participant).where(
            Participant.id == participant_id, Participant.tenant_id == UUID(user.tenant_id)
        )
    ).scalar_one_or_none()
    if participant is None:
        raise HTTPException(status_code=404, detail="איש/אשת הקשר לא נמצא/ה")
    db.delete(participant)
    db.commit()


# ─── Role-holder signature image ─────────────────────────────────────────


@router.post("/{participant_id}/signature", response_model=ParticipantOut)
async def upload_participant_signature(
    participant_id: UUID,
    file: UploadFile,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> ParticipantOut:
    """Attach a signature image to a role-holder — shown in the protocol /
    invite signature block alongside the admin-curated signatories."""
    tenant_id = UUID(user.tenant_id)
    p = _get_participant_or_404(db, tenant_id, participant_id)
    p.signature_image_data, p.signature_image_mime = await read_and_validate_image(file)
    db.commit()
    db.refresh(p)
    return _to_out(p, _system_user_emails(user.tenant_id))


@router.delete("/{participant_id}/signature", response_model=ParticipantOut)
def delete_participant_signature(
    participant_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> ParticipantOut:
    tenant_id = UUID(user.tenant_id)
    p = _get_participant_or_404(db, tenant_id, participant_id)
    p.signature_image_data = None
    p.signature_image_mime = None
    db.commit()
    db.refresh(p)
    return _to_out(p, _system_user_emails(user.tenant_id))

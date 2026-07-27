"""Server-side invitation PDF (הזמנה לישיבה) attached to invite emails.
Built on pdf_common (shared header/details/agenda/signatures)."""
from __future__ import annotations

import datetime as dt
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Meeting, Participant, TenantSettings
from app.services import pdf_common as pc
from app.services.mail import _KIND_LABELS
from app.services.signatures import combined_signatory_rows


def _guest_name_map(db: Session, meeting: Meeting) -> dict[str, str]:
    ids: set[str] = set()
    for t in meeting.topics:
        for g in t.invited_guests or []:
            ids.add(str(g))
    uuids = []
    for i in ids:
        try:
            uuids.append(UUID(i))
        except (ValueError, TypeError):
            continue
    if not uuids:
        return {}
    rows = (
        db.execute(
            select(Participant).where(
                Participant.id.in_(uuids), Participant.tenant_id == meeting.tenant_id
            )
        )
        .scalars()
        .all()
    )
    return {str(p.id): p.full_name for p in rows}


def build_invite_pdf(db: Session, meeting: Meeting, tenant_name: str) -> bytes:
    settings_row = db.execute(
        select(TenantSettings)
        .where(TenantSettings.tenant_id == meeting.tenant_id)
        .options(selectinload(TenantSettings.signatories))
    ).scalar_one_or_none()

    org_name = (settings_row.org_name if settings_row and settings_row.org_name else tenant_name) or "ארגון"
    kind_he = _KIND_LABELS.get(meeting.kind, meeting.kind)
    guests = _guest_name_map(db, meeting)
    topics = sorted((t for t in meeting.topics if not t.is_private), key=lambda t: t.order)
    invitees = [i.display_name or i.email for i in meeting.invites]

    time_range = ""
    if meeting.time_start:
        time_range = meeting.time_start.strftime("%H:%M")
        if meeting.time_end:
            time_range += f" – {meeting.time_end.strftime('%H:%M')}"

    pdf = pc.RtlPdf()
    logo = pc.img_reader(settings_row.logo_data, settings_row.logo_mime) if settings_row else None
    pc.header(pdf, org_name, "ועד ההנהלה", logo)
    pc.title(pdf, f"הזמנה ל{kind_he}")

    detail_rows = [("מספר ישיבה", meeting.number or "—"), ("תאריך", pc.fmt_date(meeting.date))]
    if time_range:
        detail_rows.append(("שעה", time_range))
    if meeting.location:
        detail_rows.append(("מקום", meeting.location))
    pc.details_table(pdf, detail_rows)

    pdf.rtl(f"מוזמנים ({len(invitees)})", size=12, bold=True, h=6)
    pdf.rtl(", ".join(invitees) if invitees else "—", size=10, color=pc.SOFT, h=5, gap=3)

    pdf.rtl("סדר יום", size=12, bold=True, h=6, gap=1)
    total = 0
    items = []
    for idx, t in enumerate(topics, start=1):
        parts = [f"**{t.title}**"]
        if t.description:
            parts.append(t.description)
        tg = [guests[str(g)] for g in (t.invited_guests or []) if str(g) in guests]
        if tg:
            parts.append("מוזמן/ת: " + ", ".join(tg))
        if t.duration_minutes:
            total += t.duration_minutes
        time_txt = f"זמן מוקצה: {t.duration_minutes} דקות" if t.duration_minutes else ""
        items.append((idx, "\n".join(parts), time_txt))
    pc.agenda_table(pdf, items)
    if total:
        pdf.set_font("dejavu", "B", 11)
        pdf.set_text_color(*pc.ACCENT)
        pdf.cell(0, 6, f'סה"כ זמן משוער: {total} דקות', align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    if settings_row:
        stamp = pc.img_reader(settings_row.stamp_data, settings_row.stamp_mime)
        pc.signatures(pdf, combined_signatory_rows(db, settings_row), stamp)

    pdf._footer_text = f"{org_name} — הזמנה ל{kind_he}   ·   תאריך הפקה: {pc.fmt_date(dt.date.today())}"
    return bytes(pdf.output())

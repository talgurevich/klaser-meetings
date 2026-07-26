"""Server-side protocol PDF (פרוטוקול ישיבה) — the post-meeting document.
Same look as the invitation (pdf_common), with present/absent members and
per-topic decisions/notes instead of invitees + guests."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Meeting, TenantSettings
from app.services import pdf_common as pc
from app.services.meeting_summary import attendance_names

# Resolved topic statuses that stand in for a decision in the protocol.
_STATUS_NOTE = {
    "deferred": "הועבר לפגישה הבאה",
    "skipped": "דולג",
    "cancelled": "בוטל",
}


def build_protocol_pdf(db: Session, meeting: Meeting, tenant_name: str) -> bytes:
    settings_row = db.execute(
        select(TenantSettings)
        .where(TenantSettings.tenant_id == meeting.tenant_id)
        .options(selectinload(TenantSettings.signatories))
    ).scalar_one_or_none()

    org_name = (settings_row.org_name if settings_row and settings_row.org_name else tenant_name) or "ארגון"
    topics = sorted((t for t in meeting.topics if not t.is_private), key=lambda t: t.order)

    present = attendance_names(db, meeting)
    present_ids = set(meeting.attendees_present or [])
    absent = [
        (inv.display_name or inv.email)
        for inv in meeting.invites
        if inv.invitee_kind == "member" and str(inv.invitee_id) not in present_ids
    ]

    time_range = ""
    if meeting.time_start:
        time_range = meeting.time_start.strftime("%H:%M")
        if meeting.time_end:
            time_range += f" - {meeting.time_end.strftime('%H:%M')}"

    # Was this protocol already distributed and then edited? If so this is
    # a revised document — say so, and reference the originally-issued date.
    revised = bool(
        meeting.published_at
        and any(t.updated_at and t.updated_at > meeting.published_at for t in meeting.topics)
    )

    pdf = pc.RtlPdf()
    logo = pc.img_reader(settings_row.logo_data, settings_row.logo_mime) if settings_row else None
    pc.header(pdf, org_name, "פרוטוקול ישיבה", logo)
    pc.title(pdf, "פרוטוקול ישיבה")
    if revised:
        pdf.set_font("dejavu", "B", 10)
        pdf.set_text_color(*pc.ACCENT)
        pdf.cell(
            0,
            6,
            f"מסמך מעודכן — מעדכן את הפרוטוקול שהופץ ב-{pc.fmt_date(meeting.published_at.date())}",
            align="C",
            new_x="LMARGIN",
            new_y="NEXT",
        )
        pdf.ln(2)

    detail_rows = [("מספר ישיבה", meeting.number or "—"), ("תאריך", pc.fmt_date(meeting.date))]
    if time_range:
        detail_rows.append(("שעה", time_range))
    if meeting.location:
        detail_rows.append(("מקום", meeting.location))
    pc.details_table(pdf, detail_rows)

    pdf.rtl(f"נוכחים ({len(present)})", size=12, bold=True, h=6)
    pdf.rtl(", ".join(present) if present else "—", size=10, color=pc.SOFT, h=5, gap=2)
    if absent:
        pdf.rtl(f"חסרים ({len(absent)})", size=12, bold=True, h=6)
        pdf.rtl(", ".join(absent), size=10, color=pc.SOFT, h=5, gap=2)

    pdf.rtl("נושאי הישיבה", size=12, bold=True, h=6, gap=1)
    items = []
    for idx, t in enumerate(topics, start=1):
        parts = [f"**{t.title}**"]
        status_note = _STATUS_NOTE.get(t.status)
        if status_note:
            parts.append(status_note)
        elif (t.decision_text or "").strip():
            parts.append(f"החלטה: {t.decision_text}")
        if (t.topic_notes or "").strip():
            parts.append(f"הערות: {t.topic_notes}")
        if (t.action_item or "").strip():
            owner = (t.action_item_owner or "").strip()
            parts.append(f"משימה: {t.action_item}{f' (אחראי: {owner})' if owner else ''}")
        time_txt = f"זמן מוקצה: {t.duration_minutes} דקות" if t.duration_minutes else ""
        items.append((idx, "\n".join(parts), time_txt))
    pc.agenda_table(pdf, items)
    pdf.ln(4)

    if settings_row:
        stamp = pc.img_reader(settings_row.stamp_data, settings_row.stamp_mime)
        pc.signatures(pdf, sorted(settings_row.signatories, key=lambda s: s.order), stamp)

    pdf._footer_text = f"{org_name} — פרוטוקול ישיבה   ·   תאריך הפקה: {pc.fmt_datetime(dt.datetime.now())}"
    return bytes(pdf.output())

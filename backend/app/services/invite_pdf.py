"""Server-side invitation PDF (הזמנה לישיבה) attached to invite emails.

Pure-Python (fpdf2 + uharfbuzz, no system libraries — works on a native
Render build) with a bundled DejaVu font and right-to-left text shaping.
Mirrors the on-screen protocol layout: org header, meeting details,
invitees, agenda (per-topic guests + allocated time), signatures, footer.
"""
from __future__ import annotations

import base64
import datetime as dt
import io
from pathlib import Path
from uuid import UUID

from fpdf import FPDF
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Meeting, Participant, TenantSettings
from app.services.mail import _KIND_LABELS

_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_INK = (23, 23, 23)
_SOFT = (110, 110, 110)
_LINE = (215, 213, 209)
_ACCENT = (40, 58, 90)


def _img_reader(b64: str | None, mime: str | None) -> io.BytesIO | None:
    """Decode a stored base64 image to a stream fpdf2 can embed. Only
    raster formats (PNG/JPG) — SVG isn't embeddable here, so it's skipped."""
    if not b64 or (mime and "svg" in mime.lower()):
        return None
    try:
        return io.BytesIO(base64.b64decode(b64))
    except Exception:  # noqa: BLE001
        return None


def _fmt_date(d: dt.date) -> str:
    months = [
        "בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני",
        "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר",
    ]
    return f"{d.day} {months[d.month - 1]} {d.year}"


class _Pdf(FPDF):
    def __init__(self) -> None:
        super().__init__(format="A4")
        self.set_margins(18, 16, 18)
        self.set_auto_page_break(True, margin=16)
        self.add_font("dejavu", "", str(_FONT_DIR / "DejaVuSans.ttf"))
        self.add_font("dejavu", "B", str(_FONT_DIR / "DejaVuSans-Bold.ttf"))
        self._footer_text = ""
        self.add_page()
        self.set_text_shaping(True)

    @property
    def content_w(self) -> float:
        return self.w - self.l_margin - self.r_margin

    def footer(self) -> None:
        if not self._footer_text:
            return
        self.set_y(-14)
        self.set_font("dejavu", "", 8)
        self.set_text_color(*_SOFT)
        self.cell(0, 5, self._footer_text, align="C")

    def rtl(self, text: str, *, size: float = 11, bold: bool = False, color=_INK, h: float = 6, gap: float = 0) -> None:
        self.set_font("dejavu", "B" if bold else "", size)
        self.set_text_color(*color)
        self.set_x(self.l_margin)
        self.multi_cell(self.content_w, h, text, align="R", new_x="LMARGIN", new_y="NEXT")
        if gap:
            self.ln(gap)

    def rule(self, color=_LINE, weight: float = 0.3) -> None:
        self.set_draw_color(*color)
        self.set_line_width(weight)
        y = self.get_y()
        self.line(self.l_margin, y, self.w - self.r_margin, y)
        self.ln(2)


def _guest_name_map(db: Session, meeting: Meeting) -> dict[str, str]:
    ids: set[str] = set()
    for t in meeting.topics:
        for g in t.invited_guests or []:
            ids.add(str(g))
    if not ids:
        return {}
    uuids = []
    for i in ids:
        try:
            uuids.append(UUID(i))
        except (ValueError, TypeError):
            continue
    if not uuids:
        return {}
    rows = db.execute(
        select(Participant).where(
            Participant.id.in_(uuids), Participant.tenant_id == meeting.tenant_id
        )
    ).scalars().all()
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

    pdf = _Pdf()

    # ── Header: logo left, org right ────────────────────────────────────
    top_y = pdf.get_y()
    if settings_row:
        logo = _img_reader(settings_row.logo_data, settings_row.logo_mime)
        if logo is not None:
            try:
                pdf.image(logo, x=pdf.l_margin, y=top_y, h=14)
            except Exception:  # noqa: BLE001
                pass
    pdf.set_xy(pdf.l_margin, top_y)
    pdf.rtl(org_name, size=17, bold=True, color=_INK, h=8)
    pdf.rtl("ועד ההנהלה", size=10, color=_SOFT, h=5)
    pdf.ln(1)
    pdf.rule(color=_INK, weight=0.6)
    pdf.ln(2)

    # ── Title ───────────────────────────────────────────────────────────
    pdf.set_font("dejavu", "B", 15)
    pdf.set_text_color(*_ACCENT)
    pdf.cell(0, 9, f"הזמנה ל{kind_he}", align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # ── Details ─────────────────────────────────────────────────────────
    box_top = pdf.get_y()
    time_range = ""
    if meeting.time_start:
        time_range = meeting.time_start.strftime("%H:%M")
        if meeting.time_end:
            time_range += f" – {meeting.time_end.strftime('%H:%M')}"
    pdf.rtl(f"מספר ישיבה: {meeting.number or '—'}", size=11, bold=True, h=6)
    pdf.rtl(f"תאריך ושעה: {_fmt_date(meeting.date)}" + (f" · {time_range}" if time_range else ""), size=11, h=6)
    if meeting.location:
        pdf.rtl(f"מקום: {meeting.location}", size=11, h=6)
    pdf.set_draw_color(*_LINE)
    pdf.set_line_width(0.3)
    pdf.rect(pdf.l_margin - 2, box_top - 2, pdf.content_w + 4, pdf.get_y() - box_top + 4)
    pdf.ln(6)

    # ── Invitees ────────────────────────────────────────────────────────
    pdf.rtl(f"מוזמנים ({len(invitees)})", size=12, bold=True, h=6)
    pdf.rtl(", ".join(invitees) if invitees else "—", size=10, color=_SOFT, h=5, gap=3)

    # ── Agenda ──────────────────────────────────────────────────────────
    pdf.rtl("סדר יום", size=12, bold=True, h=6, gap=1)
    total = 0
    for idx, t in enumerate(topics, start=1):
        pdf.rtl(f"{idx}. {t.title}", size=11, bold=True, h=6)
        if t.description:
            pdf.rtl(t.description, size=10, color=_SOFT, h=5)
        tg = [guests[str(g)] for g in (t.invited_guests or []) if str(g) in guests]
        if tg:
            pdf.rtl("מוזמן/ת: " + ", ".join(tg), size=9, color=_SOFT, h=5)
        if t.duration_minutes:
            total += t.duration_minutes
            pdf.rtl(f"זמן מוקצה: {t.duration_minutes} דקות", size=9, color=_SOFT, h=5)
        pdf.ln(1)
    if total:
        pdf.ln(1)
        pdf.set_font("dejavu", "B", 11)
        pdf.set_text_color(*_ACCENT)
        pdf.cell(0, 6, f'סה"כ זמן משוער: {total} דקות', align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(6)

    # ── Signatures ──────────────────────────────────────────────────────
    if settings_row:
        blocks = []
        for s in sorted(settings_row.signatories, key=lambda s: s.order):
            blocks.append(("sig", s))
        stamp = _img_reader(settings_row.stamp_data, settings_row.stamp_mime)
        if stamp is not None:
            blocks.insert(len(blocks) // 2, ("stamp", stamp))
        if blocks:
            n = len(blocks)
            bw = pdf.content_w / n
            base_y = pdf.get_y() + 4
            for i, (kind, obj) in enumerate(blocks):
                x = pdf.l_margin + i * bw
                cx = x + bw / 2
                if kind == "stamp":
                    try:
                        pdf.image(obj, x=cx - 11, y=base_y, h=20)
                    except Exception:  # noqa: BLE001
                        pass
                else:
                    img = _img_reader(obj.signature_image_data, obj.signature_image_mime)
                    if img is not None:
                        try:
                            pdf.image(img, x=cx - 14, y=base_y + 2, h=14)
                        except Exception:  # noqa: BLE001
                            pass
                # line + labels
                ly = base_y + 22
                pdf.set_draw_color(*_LINE)
                pdf.line(x + 6, ly, x + bw - 6, ly)
                pdf.set_xy(x, ly + 1)
                pdf.set_font("dejavu", "B", 10)
                pdf.set_text_color(*_INK)
                label = "חותמת" if kind == "stamp" else (obj.position_title or obj.member_role or "")
                pdf.cell(bw, 5, label, align="C", new_x="LEFT", new_y="NEXT")
                if kind == "sig":
                    pdf.set_xy(x, ly + 6)
                    pdf.set_font("dejavu", "", 9)
                    pdf.set_text_color(*_SOFT)
                    pdf.cell(bw, 5, obj.member_display_name or "", align="C", new_x="LEFT", new_y="NEXT")
            pdf.set_y(base_y + 34)

    # ── Confirm + footer ────────────────────────────────────────────────
    pdf.ln(2)
    pdf.set_font("dejavu", "B", 11)
    pdf.set_text_color(*_ACCENT)
    pdf.cell(0, 6, "אנא אשרו קבלה", align="C", new_x="LMARGIN", new_y="NEXT")

    pdf._footer_text = f"{org_name} — הזמנה ל{kind_he}   ·   תאריך הפקה: {_fmt_date(dt.date.today())}"
    out = pdf.output()
    return bytes(out)

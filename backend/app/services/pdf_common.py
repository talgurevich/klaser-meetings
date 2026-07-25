"""Shared building blocks for the meeting PDFs (invitation + protocol).

Pure-Python (fpdf2 + uharfbuzz, no system libraries — works on a native
Render build) with a bundled DejaVu font and right-to-left text shaping.
Both documents share the same header, details table, agenda table and
signature row; only the middle content differs.
"""
from __future__ import annotations

import base64
import datetime as dt
import io
from pathlib import Path

from fpdf import FPDF
from fpdf.fonts import FontFace

_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"

INK = (23, 23, 23)
SOFT = (110, 110, 110)
LINE = (215, 213, 209)
ACCENT = (40, 58, 90)
SURFACE = (245, 245, 244)

_MONTHS = [
    "בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני",
    "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר",
]


def fmt_date(d: dt.date) -> str:
    return f"{d.day} {_MONTHS[d.month - 1]} {d.year}"


def fmt_datetime(t: dt.datetime) -> str:
    return f"{t.day} {_MONTHS[t.month - 1]} {t.year}, {t.strftime('%H:%M')}"


def img_reader(b64: str | None, mime: str | None) -> io.BytesIO | None:
    """Decode a stored base64 image to a stream fpdf2 can embed. Only
    raster formats (PNG/JPG) — SVG isn't embeddable here, so it's skipped."""
    if not b64 or (mime and "svg" in mime.lower()):
        return None
    try:
        return io.BytesIO(base64.b64decode(b64))
    except Exception:  # noqa: BLE001
        return None


class RtlPdf(FPDF):
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
        self.set_text_color(*SOFT)
        self.cell(0, 5, self._footer_text, align="C")

    def rtl(self, text: str, *, size: float = 11, bold: bool = False, color=INK, h: float = 6, gap: float = 0) -> None:
        self.set_font("dejavu", "B" if bold else "", size)
        self.set_text_color(*color)
        self.set_x(self.l_margin)
        self.multi_cell(self.content_w, h, text, align="R", new_x="LMARGIN", new_y="NEXT")
        if gap:
            self.ln(gap)


def header(pdf: RtlPdf, org_name: str, subtitle: str, logo: io.BytesIO | None) -> None:
    top_y = pdf.get_y()
    if logo is not None:
        try:
            pdf.image(logo, x=pdf.l_margin, y=top_y, h=14)
        except Exception:  # noqa: BLE001
            pass
    pdf.set_xy(pdf.l_margin, top_y)
    pdf.rtl(org_name, size=17, bold=True, color=INK, h=8)
    pdf.rtl(subtitle, size=10, color=SOFT, h=5)
    pdf.ln(1)
    pdf.set_draw_color(*INK)
    pdf.set_line_width(0.6)
    y = pdf.get_y()
    pdf.line(pdf.l_margin, y, pdf.w - pdf.r_margin, y)
    pdf.ln(3)


def title(pdf: RtlPdf, text: str) -> None:
    pdf.set_font("dejavu", "B", 15)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 9, text, align="C", new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)


def details_table(pdf: RtlPdf, rows: list[tuple[str, str]]) -> None:
    """Two-column label/value table (label right-bold, value left), with
    horizontal separators — the meeting details block."""
    label_w = 44
    pdf.set_font("dejavu", "", 11)
    pdf.set_text_color(*INK)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.2)
    with pdf.table(
        width=pdf.content_w,
        col_widths=(pdf.content_w - label_w, label_w),
        text_align=("RIGHT", "RIGHT"),
        first_row_as_headings=False,
        markdown=True,
        borders_layout="HORIZONTAL_LINES",
        line_height=6,
        padding=(2.5, 3, 2.5, 3),
    ) as table:
        for label, value in rows:
            r = table.row()
            r.cell(value or "—")
            r.cell(f"**{label}:**")
    pdf.ln(5)


def agenda_table(pdf: RtlPdf, items: list[tuple[int, str, str]]) -> None:
    """# / נושא / זמן table. items = (number, topic_markdown, time_text)."""
    num_w, time_w = 11, 40
    topic_w = pdf.content_w - num_w - time_w
    pdf.set_font("dejavu", "", 10)
    pdf.set_text_color(*INK)
    pdf.set_draw_color(*LINE)
    pdf.set_line_width(0.2)
    headings = FontFace(emphasis="BOLD", color=SOFT, fill_color=SURFACE)
    with pdf.table(
        width=pdf.content_w,
        col_widths=(time_w, topic_w, num_w),
        text_align=("RIGHT", "RIGHT", "CENTER"),
        first_row_as_headings=True,
        headings_style=headings,
        markdown=True,
        line_height=6,
        padding=(2.5, 3, 2.5, 3),
    ) as table:
        h = table.row()
        h.cell("זמן")
        h.cell("נושא")
        h.cell("#")
        for num, topic_md, time_text in items:
            r = table.row()
            r.cell(time_text)
            r.cell(topic_md)
            r.cell(str(num))
    pdf.ln(2)


def signatures(pdf: RtlPdf, signatory_rows, stamp: io.BytesIO | None) -> None:
    """Fixed three-slot signature block, all sourced from tenant settings:
    the first signatory on the right (e.g. יו״ר), the org stamp (חותמת
    האגודה) in the centre, the second signatory on the left (e.g. מנהל
    קהילה). Each slot is drawn only if its source exists — nothing is shown
    for a missing signatory/stamp."""
    sigs = list(signatory_rows)[:2]
    if not sigs and stamp is None:
        return
    bw = pdf.content_w / 3
    base_y = pdf.get_y() + 4
    x_left = pdf.l_margin
    x_center = pdf.l_margin + bw
    x_right = pdf.l_margin + 2 * bw

    def _line_labels(x: float, label: str, name: str | None) -> None:
        ly = base_y + 22
        pdf.set_draw_color(*LINE)
        pdf.set_line_width(0.2)
        pdf.line(x + 6, ly, x + bw - 6, ly)
        pdf.set_xy(x, ly + 1)
        pdf.set_font("dejavu", "B", 10)
        pdf.set_text_color(*INK)
        pdf.cell(bw, 5, label, align="C", new_x="LEFT", new_y="NEXT")
        if name is not None:
            pdf.set_xy(x, ly + 6)
            pdf.set_font("dejavu", "", 9)
            pdf.set_text_color(*SOFT)
            pdf.cell(bw, 5, name, align="C", new_x="LEFT", new_y="NEXT")

    def _draw_sig(sig, x: float) -> None:
        img = img_reader(sig.signature_image_data, sig.signature_image_mime)
        if img is not None:
            try:
                pdf.image(img, x=x + bw / 2 - 14, y=base_y + 2, h=14)
            except Exception:  # noqa: BLE001
                pass
        _line_labels(x, sig.position_title or sig.member_role or "", sig.member_display_name or "")

    if len(sigs) >= 1:  # right slot — chair (יו״ר)
        _draw_sig(sigs[0], x_right)
    if stamp is not None:  # centre slot — org stamp (חותמת האגודה)
        try:
            pdf.image(stamp, x=x_center + bw / 2 - 11, y=base_y, h=20)
        except Exception:  # noqa: BLE001
            pass
        _line_labels(x_center, "חותמת", None)
    if len(sigs) >= 2:  # left slot — community manager (מנהל קהילה)
        _draw_sig(sigs[1], x_left)

    pdf.set_y(base_y + 34)

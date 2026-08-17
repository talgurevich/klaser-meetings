"""Small server-side helpers for meeting lifecycle bookkeeping."""
from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Meeting


def generate_meeting_number(db: Session, *, tenant_id: UUID, kind: str, on: date | None = None) -> str:
    """Sequential meeting number, format "N-YY" — the Nth meeting of that
    kind for the tenant in the calendar year, with the 2-digit year (e.g.
    the first ישיבה of 2026 -> "1-26").

    Assigned automatically at creation and editable afterwards; N is one
    past the count of same-kind meetings already in that year (date-range
    filtered rather than func.extract for SQLite/Postgres portability).
    """
    d = on or date.today()
    year_start = date(d.year, 1, 1)
    year_end = date(d.year, 12, 31)
    count = db.execute(
        select(func.count())
        .select_from(Meeting)
        .where(
            Meeting.tenant_id == tenant_id,
            Meeting.kind == kind,
            Meeting.date >= year_start,
            Meeting.date <= year_end,
        )
    ).scalar_one()
    return f"{count + 1}-{d.year % 100:02d}"


def meeting_number_sort_key(number: str | None) -> tuple[int, int, int]:
    """Ascending sort key for the "N-YY" display number: (has_number, YY, N).

    The number is editable free text, so anything that doesn't parse (and
    anything unset) sorts alongside the empty case rather than raising.
    """
    n, _, yy = (number or "").partition("-")
    n, yy = n.strip(), yy.strip()
    if not n.isdigit() or not yy.isdigit():
        return (0, 0, 0)
    return (1, int(yy), int(n))

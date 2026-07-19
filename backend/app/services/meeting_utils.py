"""Small server-side helpers for meeting lifecycle bookkeeping."""
from datetime import date
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Meeting

# Numbering only advances past these statuses — drafts and anything still
# in flight don't consume a sequence slot, matching the original
# generateMeetingNumber() convention (counts only published/archived).
_COUNTED_STATUSES = ("published", "archived")


def generate_meeting_number(db: Session, *, tenant_id: UUID, kind: str, on: date | None = None) -> str:
    """Return the next display number for a meeting/assembly, format
    "N-YY" (e.g. "2-26"), scoped per tenant + kind + calendar year."""
    year = (on or date.today()).year
    yy = year % 100

    count = db.execute(
        select(func.count())
        .select_from(Meeting)
        .where(
            Meeting.tenant_id == tenant_id,
            Meeting.kind == kind,
            Meeting.status.in_(_COUNTED_STATUSES),
            func.extract("year", Meeting.date) == year,
        )
    ).scalar_one()

    return f"{count + 1}-{yy:02d}"

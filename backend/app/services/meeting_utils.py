"""Small server-side helpers for meeting lifecycle bookkeeping."""
from datetime import date


def generate_meeting_number(on: date | None = None) -> str:
    """Default meeting number — the meeting date in Israeli DD/MM/YY format,
    concatenated (e.g. 26 Jul 2026 -> "260726").

    Assigned automatically from the meeting's date at creation, and kept in
    sync with the date afterwards until the user customizes it (see
    routes/meetings.py's create_meeting / update_meeting). The user can
    override it with any string at any time.
    """
    return (on or date.today()).strftime("%d%m%y")

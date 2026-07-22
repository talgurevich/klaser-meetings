"""Meeting summary + recipient resolution for the "publish to public" flow.

When an approved meeting is published, everyone invited plus every attached
participant gets an email summarising the meeting and its decisions. This
module builds both the recipient list and the email body; the actual send
+ status transition live in routes/meetings.py, and the same builder backs
the pre-send preview so what the user approves is exactly what goes out.
"""
from __future__ import annotations

import html
from dataclasses import dataclass, field
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Meeting, Participant
from app.services.identity import identity_service
from app.services.mail import _KIND_LABELS, _wrap_html


@dataclass(frozen=True)
class Recipient:
    name: str
    email: str


@dataclass
class PublishSummary:
    subject: str
    html: str
    text: str
    recipients: list[Recipient]
    recipients_without_email: list[str] = field(default_factory=list)


def _fmt_date(meeting: Meeting) -> str:
    return meeting.date.strftime("%d/%m/%Y")


def _fmt_time_range(meeting: Meeting) -> str:
    s = meeting.time_start.strftime("%H:%M") if meeting.time_start else ""
    e = meeting.time_end.strftime("%H:%M") if meeting.time_end else ""
    if s and e:
        return f"{s}–{e}"
    return s or e


def _member_name_map(meeting: Meeting) -> dict[str, str]:
    """user_id -> display name, drawn first from the meeting's own member
    invites (always available, no service token needed) and topped up
    best-effort from the identity roster for anyone marked present who
    wasn't a formal invitee. Roster failure (e.g. missing service token)
    degrades gracefully — names we can't resolve just fall back to a
    generic label in the attendance list."""
    names: dict[str, str] = {}
    for inv in meeting.invites:
        if inv.invitee_kind == "member" and inv.display_name:
            names[str(inv.invitee_id)] = inv.display_name
    present = set(meeting.attendees_present or [])
    missing = present - set(names)
    if missing:
        try:
            for u in identity_service.list_users(str(meeting.tenant_id)):
                if u.get("id") in missing:
                    names[u["id"]] = u.get("display_name") or u.get("email") or u["id"]
        except Exception:  # noqa: BLE001 — roster is a nicety here, never fatal
            pass
    return names


def attendance_names(db: Session, meeting: Meeting) -> list[str]:
    """Public wrapper — names of who was present, for the protocol page."""
    return _attendance(db, meeting)


def _attendance(db: Session, meeting: Meeting) -> list[str]:
    """Names of who was present — members marked present, then attached
    participants (the Participant directory people tracked for this
    meeting's attendance record)."""
    names: list[str] = []
    name_map = _member_name_map(meeting)
    for uid in meeting.attendees_present or []:
        names.append(name_map.get(uid, "חבר/ת ועד"))
    if meeting.participant_ids:
        pids = [UUID(p) for p in meeting.participant_ids]
        parts = (
            db.execute(
                select(Participant).where(
                    Participant.id.in_(pids), Participant.tenant_id == meeting.tenant_id
                )
            )
            .scalars()
            .all()
        )
        names.extend(p.full_name for p in parts)
    return names


def resolve_recipients(db: Session, meeting: Meeting) -> tuple[list[Recipient], list[str]]:
    """All invitees + all attached participants, deduped by (lowercased)
    email. Returns (recipients_with_email, names_without_email)."""
    seen: dict[str, Recipient] = {}
    without: list[str] = []

    for inv in meeting.invites:
        email = (inv.email or "").strip()
        if not email:
            without.append(inv.display_name or "מוזמן/ת")
            continue
        key = email.lower()
        if key not in seen:
            seen[key] = Recipient(name=inv.display_name or email, email=email)

    if meeting.participant_ids:
        pids = [UUID(p) for p in meeting.participant_ids]
        parts = (
            db.execute(
                select(Participant).where(
                    Participant.id.in_(pids), Participant.tenant_id == meeting.tenant_id
                )
            )
            .scalars()
            .all()
        )
        for p in parts:
            email = (p.email or "").strip()
            if not email:
                without.append(p.full_name)
                continue
            key = email.lower()
            if key not in seen:
                seen[key] = Recipient(name=p.full_name, email=email)

    return list(seen.values()), without


def _sections(meeting: Meeting) -> tuple[list[tuple[str, str]], list[tuple[str, str]]]:
    """(decisions, action_items) as (topic_title, text) pairs — private
    topics excluded, since this goes out publicly."""
    topics = sorted((t for t in meeting.topics if not t.is_private), key=lambda t: t.order)
    decisions = [(t.title, t.decision_text) for t in topics if (t.decision_text or "").strip()]
    actions = [(t.title, t.action_item) for t in topics if (t.action_item or "").strip()]
    return decisions, actions


def build_publish_summary(db: Session, meeting: Meeting, tenant_name: str) -> PublishSummary:
    kind_he = _KIND_LABELS.get(meeting.kind, meeting.kind)
    number_suffix = f" מספר {meeting.number}" if meeting.number else ""
    date_s = _fmt_date(meeting)
    time_s = _fmt_time_range(meeting)
    attendance = _attendance(db, meeting)
    decisions, actions = _sections(meeting)

    def esc(s: str) -> str:
        return html.escape(s)

    # ---- HTML ----
    parts_html = [
        f"<h1>סיכום {esc(kind_he)}{esc(number_suffix)}</h1>",
        f"<p><strong>תאריך:</strong> {esc(date_s)}"
        + (f" | <strong>שעה:</strong> {esc(time_s)}" if time_s else "")
        + "</p>",
    ]
    if meeting.location:
        parts_html.append(f"<p><strong>מקום:</strong> {esc(meeting.location)}</p>")

    if attendance:
        items = "".join(f"<li>{esc(n)}</li>" for n in attendance)
        parts_html.append(f"<p><strong>נוכחים:</strong></p><ol>{items}</ol>")

    if decisions:
        rows = "".join(
            f"<li><strong>{esc(t)}</strong><br>{esc(txt)}</li>" for t, txt in decisions
        )
        parts_html.append(f"<p><strong>החלטות:</strong></p><ol>{rows}</ol>")
    else:
        parts_html.append("<p><strong>החלטות:</strong> לא נרשמו החלטות.</p>")

    if actions:
        rows = "".join(
            f"<li><strong>{esc(t)}</strong><br>{esc(txt)}</li>" for t, txt in actions
        )
        parts_html.append(f"<p><strong>משימות לביצוע:</strong></p><ol>{rows}</ol>")

    html_body = "\n".join(parts_html)

    # ---- text ----
    parts_text = [
        f"סיכום {kind_he}{number_suffix}",
        f"תאריך: {date_s}" + (f" | שעה: {time_s}" if time_s else ""),
    ]
    if meeting.location:
        parts_text.append(f"מקום: {meeting.location}")
    if attendance:
        parts_text.append("\nנוכחים:\n" + "\n".join(f"- {n}" for n in attendance))
    if decisions:
        parts_text.append(
            "\nהחלטות:\n" + "\n".join(f"{i + 1}. {t}: {txt}" for i, (t, txt) in enumerate(decisions))
        )
    else:
        parts_text.append("\nהחלטות: לא נרשמו החלטות.")
    if actions:
        parts_text.append(
            "\nמשימות לביצוע:\n" + "\n".join(f"{i + 1}. {t}: {txt}" for i, (t, txt) in enumerate(actions))
        )
    parts_text.append(f"\n— {tenant_name}")
    text_body = "\n".join(parts_text)

    recipients, without = resolve_recipients(db, meeting)

    return PublishSummary(
        subject=f"סיכום {kind_he}{number_suffix} — {date_s}",
        html=_wrap_html(html_body, f"{tenant_name} · Klaser"),
        text=text_body,
        recipients=recipients,
        recipients_without_email=without,
    )

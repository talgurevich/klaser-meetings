"""Transactional email via Resend — meeting invitations only.

Ported near-verbatim from klaser-identity/app/services/mail.py (same
RTL-safe wrapper, same dry-run-without-a-key convention): if
RESEND_API_KEY is unset, `_send` logs the payload and returns instead of
hitting the network, so the invite/RSVP flow is fully testable locally
without a real Resend account.
"""
from __future__ import annotations

import html
from dataclasses import dataclass

import resend
import structlog

from app.config import settings

log = structlog.get_logger()


@dataclass(frozen=True)
class Message:
    to: str
    subject: str
    html_body: str
    text_body: str


def _from_line() -> str:
    name = (settings.mail_from_name or "Klaser").strip()
    email = settings.mail_from_email
    return f"{name} <{email}>" if name else email


def _send(msg: Message) -> None:
    """Fire-and-forget send. Never raises — a mail failure must not break
    the invite-sending request for the other recipients in the batch."""
    if not settings.resend_api_key:
        log.info("mail.dry_run", to=msg.to, subject=msg.subject, reason="RESEND_API_KEY not set")
        return
    resend.api_key = settings.resend_api_key
    try:
        resend.Emails.send(
            {
                "from": _from_line(),
                "to": [msg.to],
                "subject": msg.subject,
                "html": msg.html_body,
                "text": msg.text_body,
            }
        )
        log.info("mail.sent", to=msg.to, subject=msg.subject)
    except Exception as e:  # noqa: BLE001 — must not propagate
        log.warning("mail.send_failed", to=msg.to, error=str(e))


# ─────────────────────────────────────────────────────────────────────────
# Shared RTL-safe HTML wrapper — identical rationale to identity's copy:
# Gmail/Outlook strip <html>/<body> and their CSS on render, so dir="rtl"
# there is lost; repeat it inline on every wrapper div instead.
# ─────────────────────────────────────────────────────────────────────────

_BASE_STYLE = """
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; background: #fafaf9; font-family: 'Heebo', 'Assistant', system-ui, sans-serif; color: #171717; direction: rtl; }
    a { color: #b8412b; text-decoration: none; }
    .btn { display: inline-block; text-decoration: none; padding: 12px 24px; font-weight: 700;
           letter-spacing: 0.02em; border-radius: 4px; margin-left: 8px; }
    .btn-attend { background: #059669; color: #ffffff !important; }
    .btn-decline { background: #d97706; color: #ffffff !important; }
    .muted { color: #525252; font-size: 13px; line-height: 1.6; }
    .card { max-width: 560px; margin: 0 auto; background: #fafaf9; border: 1px solid #e7e5e4; padding: 40px 32px; direction: rtl; text-align: right; }
    h1 { font-size: 22px; font-weight: 900; margin: 0 0 12px; letter-spacing: -0.01em; }
    p  { line-height: 1.65; margin: 0 0 8px; font-size: 15px; }
    ol { margin: 8px 0 20px; padding-inline-start: 20px; }
    .foot { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e7e5e4; font-size: 12px; color: #525252; }
  </style>
"""


def _wrap_html(body: str, org_line: str) -> str:
    return f"""<!doctype html>
<html lang="he" dir="rtl">
<head>{_BASE_STYLE}</head>
<body dir="rtl" style="direction: rtl; text-align: right;">
  <div dir="rtl" style="padding: 32px 16px; direction: rtl; text-align: right;">
    <div class="card" dir="rtl" style="direction: rtl; text-align: right;">
      {body}
      <div class="foot" dir="rtl" style="direction: rtl; text-align: right;">
        {html.escape(org_line)}
      </div>
    </div>
  </div>
</body>
</html>"""


_KIND_LABELS = {"meeting": "ישיבת ועד", "assembly": "אסיפה"}


def send_prebuilt(*, to_email: str, subject: str, html_body: str, text_body: str) -> None:
    """Send an already-rendered message (subject/html/text built elsewhere,
    e.g. the meeting-summary publish flow). Same fire-and-forget / dry-run
    semantics as every other sender here."""
    _send(Message(to=to_email, subject=subject, html_body=html_body, text_body=text_body))


def send_meeting_invite(
    *,
    to_email: str,
    recipient_name: str,
    tenant_name: str,
    meeting_kind: str,
    meeting_number: str | None,
    meeting_date: str,
    time_start: str | None,
    time_end: str | None,
    location: str | None,
    topics: list[tuple[str, int | None]],
    rsvp_url_attend: str,
    rsvp_url_decline: str,
) -> None:
    """One invitation email, sent (or dry-run logged) per invitee. Each
    RSVP button links straight to /rsvp/{token}?response=... — a single
    click on the frontend auto-submits, no second confirmation page load
    required (see frontend/src/pages/Rsvp.tsx)."""
    kind_he = _KIND_LABELS.get(meeting_kind, meeting_kind)
    number_suffix = f" מספר {meeting_number}" if meeting_number else ""
    time_range = f"{time_start}–{time_end}" if time_start and time_end else (time_start or "")

    topics_html = "".join(
        f"<li>{html.escape(t)}{f' — {d} דקות' if d else ''}</li>" for t, d in topics
    )
    topics_text = "\n".join(f"{i + 1}. {t}" + (f" — {d} דקות" if d else "") for i, (t, d) in enumerate(topics))

    html_body = f"""
        <h1>שלום {html.escape(recipient_name)},</h1>
        <p>מוזמן/ת ל{kind_he}{html.escape(number_suffix)}</p>
        <p><strong>תאריך:</strong> {html.escape(meeting_date)}{f' | <strong>שעה:</strong> {html.escape(time_range)}' if time_range else ''}</p>
        {f'<p><strong>מקום:</strong> {html.escape(location)}</p>' if location else ''}
        {f'<p><strong>סדר יום:</strong></p><ol>{topics_html}</ol>' if topics else ''}
        <p>אנא אשר/י קבלת ההזמנה:</p>
        <p style="margin: 24px 0;">
          <a href="{html.escape(rsvp_url_decline)}" class="btn btn-decline">מאשר/ת קבלה ולא אוכל להגיע</a>
          <a href="{html.escape(rsvp_url_attend)}" class="btn btn-attend">מאשר/ת ומגיע/ה</a>
        </p>
    """

    text_body = (
        f"שלום {recipient_name},\n\n"
        f"מוזמן/ת ל{kind_he}{number_suffix}\n"
        f"תאריך: {meeting_date}" + (f" | שעה: {time_range}\n" if time_range else "\n")
        + (f"מקום: {location}\n" if location else "")
        + (f"\nסדר יום:\n{topics_text}\n" if topics else "")
        + f"\nלאישור הגעה: {rsvp_url_attend}\n"
        f"לאישור קבלה ללא הגעה: {rsvp_url_decline}\n\n"
        f"— {tenant_name}"
    )

    _send(
        Message(
            to=to_email,
            subject=f"הזמנה ל{kind_he}{number_suffix} — {meeting_date}",
            html_body=_wrap_html(html_body, f"{tenant_name} · Klaser"),
            text_body=text_body,
        )
    )


def send_action_item_update(
    *,
    to_email: str,
    recipient_name: str,
    tenant_name: str,
    meeting_kind: str,
    meeting_number: str | None,
    meeting_date: str,
    topic_title: str,
    action_item_text: str,
    event: str,  # "done" | "deleted" | "reopened"
) -> None:
    """Notifies everyone invited to the meeting a follow-up task
    originated from, when that task is marked finished or removed from
    the tenant-wide משימות לביצוע list ("update the participants of that
    meeting") — closes the loop without anyone needing to check back on
    the meeting itself. Sent (or dry-run logged) per invitee, same as
    send_meeting_invite."""
    kind_he = _KIND_LABELS.get(meeting_kind, meeting_kind)
    number_suffix = f" מספר {meeting_number}" if meeting_number else ""
    event_he = {"done": "הושלמה", "deleted": "הוסרה", "reopened": "נפתחה מחדש"}.get(event, event)

    html_body = f"""
        <h1>עדכון משימת המשך</h1>
        <p>שלום {html.escape(recipient_name)},</p>
        <p>המשימה הבאה, שנקבעה ב{kind_he}{html.escape(number_suffix)} מתאריך {html.escape(meeting_date)}
           בנושא <strong>{html.escape(topic_title)}</strong>, {event_he}:</p>
        <p style="margin: 16px 0; padding: 12px 16px; background: #f5f5f4; border-radius: 4px;">
          {html.escape(action_item_text)}
        </p>
    """
    text_body = (
        f"שלום {recipient_name},\n\n"
        f"המשימה הבאה, שנקבעה ב{kind_he}{number_suffix} מתאריך {meeting_date} בנושא {topic_title}, {event_he}:\n\n"
        f"{action_item_text}\n\n"
        f"— {tenant_name}"
    )

    _send(
        Message(
            to=to_email,
            subject=f"עדכון משימה — {topic_title}",
            html_body=_wrap_html(html_body, f"{tenant_name} · Klaser"),
            text_body=text_body,
        )
    )

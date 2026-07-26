"""Smoke test: publish-preview lists all invitees + participants and the
summary content; publish sends (dry-run) and transitions approved->published;
guards reject non-approved / no-protocol-approval."""
import os, datetime as dt
from uuid import UUID as U, uuid4
os.environ["DATABASE_URL"] = "sqlite://"
os.environ.pop("RESEND_API_KEY", None)  # force mail dry-run

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

import app.services.identity as identity
from app.services.identity import IdentityUser
from app.db import Base, get_db
from app import models
from app.models import Meeting, MeetingInvite, Participant, Topic
from app.main import app

TENANT = "a1b2c3d4-1111-4a2b-8c3d-e5f6a7b8c9d0"
USER = "b2c3d4e5-2222-4b3c-9d4e-f6a7b8c9d0e1"
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Sess = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def _db():
    d = Sess()
    try:
        yield d
    finally:
        d.close()

app.dependency_overrides[get_db] = _db
identity._introspect = lambda request: IdentityUser(
    user_id=USER, email="g@x.com", display_name="Gil", role="admin",
    is_super_admin=False, tenant_id=TENANT, tenant_name="ועד הבית", entitlements=["meetings"],
)
client = TestClient(app); client.cookies.set("klaser_session", "x")

member_uid = str(uuid4())

def make_meeting(status, with_protocol_approval=True):
    db = Sess()
    m = Meeting(tenant_id=U(TENANT), created_by_user_id=U(USER), kind="meeting",
                number="220726", date=dt.date(2026, 7, 22),
                time_start=dt.time(18, 0), time_end=dt.time(20, 0), location="מועדון",
                status=status, attendees_present=[member_uid],
                protocol_approvals=[{"user_id": USER, "approved_at": "x"}] if with_protocol_approval else None)
    db.add(m); db.flush()
    p = Participant(tenant_id=U(TENANT), full_name="דנה משתתפת", email="dana@ex.com", created_by_user_id=U(USER))
    db.add(p); db.flush()
    m.participant_ids = [str(p.id)]
    db.add_all([
        MeetingInvite(tenant_id=U(TENANT), meeting_id=m.id, invitee_kind="member",
                      invitee_id=U(member_uid), email="avi@ex.com", display_name="אבי חבר"),
        MeetingInvite(tenant_id=U(TENANT), meeting_id=m.id, invitee_kind="participant",
                      invitee_id=p.id, email="dana@ex.com", display_name="דנה משתתפת"),
        Topic(tenant_id=U(TENANT), meeting_id=m.id, order=0, title="תקציב",
              decision_text="אושר תקציב 2026", action_item="להעביר לרו\"ח", is_private=False),
        Topic(tenant_id=U(TENANT), meeting_id=m.id, order=1, title="נושא סודי",
              decision_text="החלטה חסויה", is_private=True),
    ])
    db.commit(); mid = str(m.id); db.close()
    return mid

# --- preview ---
mid = make_meeting("approved")
r = client.get(f"/api/meetings/{mid}/publish-preview")
assert r.status_code == 200, r.text
pv = r.json()
emails = sorted(x["email"] for x in pv["recipients"])
print("recipients:", emails)
assert emails == ["avi@ex.com", "dana@ex.com"], "all invitees + participants, deduped"
assert "אושר תקציב 2026" in pv["html"], "decision text present"
assert 'להעביר לרו' in pv["html"], "action item present"
assert "החלטה חסויה" not in pv["html"], "private topic must be excluded"
assert "אבי חבר" in pv["html"] or "דנה" in pv["html"], "attendance names present"
print("subject:", pv["subject"])

# --- publish (dry-run mail) ---
r = client.post(f"/api/meetings/{mid}/publish")
assert r.status_code == 200, r.text
assert r.json()["status"] == "published", "status -> published"
print("published ok, status =", r.json()["status"])

# --- guard: not approved ---
mid2 = make_meeting("active")
r = client.post(f"/api/meetings/{mid2}/publish")
print("publish from active ->", r.status_code)
assert r.status_code == 409

# --- guard: approved but no protocol approval ---
mid3 = make_meeting("approved", with_protocol_approval=False)
r = client.post(f"/api/meetings/{mid3}/publish")
print("publish approved w/o protocol approval ->", r.status_code)
assert r.status_code == 409

print("ALL OK")

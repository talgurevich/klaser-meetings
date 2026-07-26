"""Smoke test for the new 'continue to meeting' (continuing_meeting)
selection: prefer non-draft with nearest upcoming date, else nearest
upcoming draft. SQLite StaticPool + patched _introspect.
"""
import os, datetime as dt
from uuid import UUID as U
os.environ["DATABASE_URL"] = "sqlite://"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

import app.services.identity as identity
from app.services.identity import IdentityUser
from app.db import Base, get_db
from app import models
from app.models import Meeting
from app.main import app

TENANT = "a1b2c3d4-1111-4a2b-8c3d-e5f6a7b8c9d0"
engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
S = sessionmaker(bind=engine, autoflush=False, autocommit=False)

def _db():
    d = S()
    try:
        yield d
    finally:
        d.close()

app.dependency_overrides[get_db] = _db
identity._introspect = lambda request: IdentityUser(
    user_id="b2c3d4e5-2222-4b3c-9d4e-f6a7b8c9d0e1", email="g@x.com", display_name="Gil",
    role="admin", is_super_admin=False, tenant_id=TENANT, tenant_name="T", entitlements=["meetings"],
)
import app.routes.dashboard as dash
dash.generate_meeting_number = lambda *a, **k: "1-26"  # SQLite date-extract quirk, incidental

client = TestClient(app); client.cookies.set("klaser_session", "x")

today = dt.date.today()
def d(n): return today + dt.timedelta(days=n)

def reset(rows):
    db = S()
    db.query(Meeting).delete()
    for kind, date, status, title in rows:
        db.add(Meeting(tenant_id=U(TENANT), created_by_user_id=U("b2c3d4e5-2222-4b3c-9d4e-f6a7b8c9d0e1"),
                       kind=kind, date=date, status=status, title=title))
    db.commit(); db.close()

def continuing():
    r = client.get("/api/dashboard")
    assert r.status_code == 200, r.text
    c = r.json()["continuing_meeting"]
    return None if c is None else (c["title"], c["status"], c["date"])

# Case 1: non-draft (day +10) beats a nearer draft (day +2)
reset([
    ("board", d(2),  "draft",            "draft-near"),
    ("board", d(10), "pending_approval", "approved-far"),
])
print("case1 (expect approved-far):", continuing())

# Case 2: no non-draft in future -> nearest upcoming draft
reset([
    ("board", d(5),  "draft", "draft-d5"),
    ("board", d(1),  "draft", "draft-d1"),
    ("board", d(-3), "pending_approval", "nondraft-past"),  # past, excluded
])
print("case2 (expect draft-d1):", continuing())

# Case 3: two non-drafts, nearest upcoming wins; past non-draft ignored
reset([
    ("board", d(-1), "active", "nondraft-yesterday"),
    ("board", d(3),  "active", "nondraft-d3"),
    ("board", d(8),  "approved", "nondraft-d8"),
])
print("case3 (expect nondraft-d3):", continuing())

# Case 4: nothing upcoming; a past non-draft still in work -> show it
reset([
    ("board", d(-2), "draft", "old-draft"),
    ("board", d(-5), "active", "past-active-older"),
    ("board", d(-1), "pending_approval", "past-nondraft-recent"),
])
print("case4 (expect past-nondraft-recent):", continuing())

# Case 5: only past drafts -> most recent past draft
reset([
    ("board", d(-9), "draft", "draft-old"),
    ("board", d(-2), "draft", "draft-recent"),
])
print("case5 (expect draft-recent):", continuing())

# Case 6: upcoming draft beats past non-draft? No — non-draft always wins
reset([
    ("board", d(3),  "draft", "upcoming-draft"),
    ("board", d(-4), "active", "past-nondraft"),
])
print("case6 (expect past-nondraft):", continuing())

# Case 7: truly empty -> None
reset([])
print("case7 (expect None):", continuing())

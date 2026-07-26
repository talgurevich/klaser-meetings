"""Smoke test: every meeting's first topic is the fixed protocol-approval
topic; configurable 'נושא ראשון' follows; user topics offset correctly."""
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
from app.models import TenantSettings
from app.routes.meetings import _PROTOCOL_APPROVAL_TITLE
from app.main import app

TENANT = "a1b2c3d4-1111-4a2b-8c3d-e5f6a7b8c9d0"
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
    user_id="b2c3d4e5-2222-4b3c-9d4e-f6a7b8c9d0e1", email="g@x.com", display_name="Gil",
    role="admin", is_super_admin=False, tenant_id=TENANT, tenant_name="T", entitlements=["meetings"],
)
client = TestClient(app); client.cookies.set("klaser_session", "x")

def topics_of(meeting_id):
    r = client.get(f"/api/meetings/{meeting_id}")
    assert r.status_code == 200, r.text
    ts = sorted(r.json()["topics"], key=lambda t: t["order"])
    return [(t["title"], t["order"], t["is_default_first"], t["is_default_last"]) for t in ts]

# Case A: no tenant settings -> just the fixed protocol topic first.
r = client.post("/api/meetings", json={"kind": "meeting", "topics": [{"title": "נושא א"}, {"title": "נושא ב"}]})
mid = r.json()["id"]
tA = topics_of(mid)
print("A:", tA)
assert tA[0][0] == _PROTOCOL_APPROVAL_TITLE and tA[0][2] is True and tA[0][1] == 0
assert [t[0] for t in tA[1:]] == ["נושא א", "נושא ב"]

# Case B: with configurable first + last recurring topics.
db = Sess()
db.add(TenantSettings(
    tenant_id=U(TENANT),
    recurring_topic_first_title="דיווח יו\"ר", recurring_topic_first_duration=5,
    recurring_topic_last_title="שונות", recurring_topic_last_duration=10,
))
db.commit(); db.close()

r = client.post("/api/meetings", json={"kind": "meeting", "topics": [{"title": "נושא מרכזי"}]})
mid = r.json()["id"]
tB = topics_of(mid)
print("B:", tB)
titles = [t[0] for t in tB]
assert titles[0] == _PROTOCOL_APPROVAL_TITLE, "protocol topic must be first"
assert titles[1] == 'דיווח יו"ר', "configurable first topic follows at #2"
assert titles[2] == "נושא מרכזי", "user topic after the two pinned-first topics"
assert titles[-1] == "שונות" and tB[-1][3] is True, "last pinned topic at the end"
# exactly one protocol topic, and it's the only order-0
assert sum(1 for t in tB if t[0] == _PROTOCOL_APPROVAL_TITLE) == 1
assert tB[0][1] == 0 and tB[1][1] == 1 and tB[2][1] == 2

print("ALL OK")

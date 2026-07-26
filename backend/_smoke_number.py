"""Smoke test: meeting number defaults to date DDMMYY, tracks date changes
until the user customizes it."""
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

# Fixed default weekday so we know the created date. Wednesday=3.
db = Sess()
db.add(TenantSettings(tenant_id=U(TENANT), meeting_weekday=3))
db.commit(); db.close()

def create():
    r = client.post("/api/meetings", json={"kind": "meeting"})
    assert r.status_code == 201, r.text
    return r.json()

def patch(mid, body):
    r = client.patch(f"/api/meetings/{mid}", json=body)
    assert r.status_code == 200, r.text
    return r.json()

m = create()
expected = dt.date.fromisoformat(m["date"]).strftime("%d%m%y")
print("created: date", m["date"], "number", m["number"], "expected", expected)
assert m["number"] == expected, "number should default to DDMMYY of date"

# Change the date -> number should track it (not customized yet).
m2 = patch(m["id"], {"date": "2026-03-04"})
print("after date change: date", m2["date"], "number", m2["number"])
assert m2["number"] == "040326", "number should follow the new date"

# Customize the number -> then change date -> number must stay customized.
m3 = patch(m["id"], {"number": "ישיבה מיוחדת"})
assert m3["number"] == "ישיבה מיוחדת"
m4 = patch(m["id"], {"date": "2026-05-06"})
print("after customize + date change: date", m4["date"], "number", m4["number"])
assert m4["number"] == "ישיבה מיוחדת", "customized number must NOT be overwritten"

# Explicit number + date in the same request -> explicit wins.
m5 = patch(m["id"], {"date": "2026-06-07", "number": "12345"})
print("explicit number+date: date", m5["date"], "number", m5["number"])
assert m5["number"] == "12345"

print("ALL OK")

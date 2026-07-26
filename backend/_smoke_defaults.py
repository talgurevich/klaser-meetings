"""Smoke test: new meeting inherits date(weekday)/time/location from
tenant settings when the client omits them, per kind."""
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
import app.routes.meetings as mt
mt.generate_meeting_number = lambda *a, **k: "1-26"

client = TestClient(app); client.cookies.set("klaser_session", "x")

# Seed tenant settings: meetings on Wednesday(=3) 18:00-20:00 @ מועדון,
# assemblies on Sunday(=0) 10:00 @ אולם.
db = Sess()
db.add(TenantSettings(
    tenant_id=U(TENANT),
    meeting_location="מועדון", meeting_weekday=3,
    meeting_start_time=dt.time(18, 0), meeting_end_time=dt.time(20, 0),
    assembly_location="אולם", assembly_weekday=0,
    assembly_start_time=dt.time(10, 0), assembly_end_time=dt.time(12, 0),
))
db.commit(); db.close()

def create(kind):
    r = client.post("/api/meetings", json={"kind": kind})
    assert r.status_code == 201, r.text
    return r.json()

def sunday_based(iso):
    d = dt.date.fromisoformat(iso)
    return (d.weekday() + 1) % 7

m = create("meeting")
print("meeting  -> date", m["date"], "weekday(sun=0)", sunday_based(m["date"]),
      "start", m["time_start"], "end", m["time_end"], "loc", m["location"])
assert sunday_based(m["date"]) == 3, "meeting date should land on Wednesday"
assert m["time_start"] == "18:00:00" and m["time_end"] == "20:00:00"
assert m["location"] == "מועדון"
assert dt.date.fromisoformat(m["date"]) >= dt.date.today()

a = create("assembly")
print("assembly -> date", a["date"], "weekday(sun=0)", sunday_based(a["date"]),
      "start", a["time_start"], "loc", a["location"])
assert sunday_based(a["date"]) == 0, "assembly date should land on Sunday"
assert a["time_start"] == "10:00:00"
assert a["location"] == "אולם"

# Explicit values from the client are NOT overridden by defaults.
r = client.post("/api/meetings", json={"kind": "meeting", "date": "2026-12-25", "location": "אחר"})
j = r.json()
print("explicit -> date", j["date"], "loc", j["location"], "start(from default)", j["time_start"])
assert j["date"] == "2026-12-25" and j["location"] == "אחר"
assert j["time_start"] == "18:00:00"  # still filled from default (was omitted)

print("ALL OK")

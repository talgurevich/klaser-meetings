"""Smoke test: does an action_item set on a topic show up in the
tenant-wide /api/action-items list? Reproduces the user's report.

Pattern per repo convention: SQLite StaticPool, patched _introspect.
"""
import os
os.environ["DATABASE_URL"] = "sqlite://"

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

import app.services.identity as identity
from app.services.identity import IdentityUser
from app.db import Base, get_db
from app import models  # noqa: F401  (register tables)
from app.main import app

TENANT = "11111111-1111-1111-1111-111111111111"

engine = create_engine(
    "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
)
Base.metadata.create_all(engine)
TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _db_override():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _db_override

FAKE = IdentityUser(
    user_id="22222222-2222-2222-2222-222222222222",
    email="gil@example.com",
    display_name="Gil",
    role="admin",
    is_super_admin=False,
    tenant_id=TENANT,
    tenant_name="Test Tenant",
    entitlements=["meetings"],
)
identity._introspect = lambda request: FAKE

client = TestClient(app)
client.cookies.set("klaser_session", "x")

r = client.post("/api/meetings", json={"kind": "board", "date": "2026-07-21"})
print("create meeting:", r.status_code, r.text[:200])
meeting_id = r.json()["id"]

r = client.post(f"/api/meetings/{meeting_id}/topics", json={"title": "נושא בדיקה"})
print("add topic:", r.status_code, r.text[:200])
topic_id = r.json()["id"]

r = client.patch(
    f"/api/meetings/{meeting_id}/topics/{topic_id}",
    json={"action_item": "להתקשר לספק"},
)
print("set action_item:", r.status_code, r.text[:250])

r = client.get("/api/action-items")
print("list action-items:", r.status_code)
print("   -> items:", r.json())

import os
from uuid import UUID as U
os.environ["DATABASE_URL"]="sqlite://"
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
import app.services.identity as identity
from app.services.identity import IdentityUser
from app.db import Base, get_db
from app import models
from app.models import Participant
from app.main import app
T="a1b2c3d4-1111-4a2b-8c3d-e5f6a7b8c9d0"; USER="b2c3d4e5-2222-4b3c-9d4e-f6a7b8c9d0e1"
e=create_engine("sqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool)
Base.metadata.create_all(e); S=sessionmaker(bind=e)
def _db():
    d=S()
    try: yield d
    finally: d.close()
app.dependency_overrides[get_db]=_db
identity._introspect=lambda r: IdentityUser(user_id=USER,email="g@x.com",display_name="Gil",role="admin",is_super_admin=False,tenant_id=T,tenant_name="t",entitlements=["meetings"])
identity.identity_service.list_users=lambda tid:[]
c=TestClient(app); c.cookies.set("klaser_session","x")

db=S()
p=Participant(tenant_id=U(T),full_name="אורח",email="guest@x.com",public_send=True,edit_permission=False,created_by_user_id=U(USER))
db.add(p); db.commit(); pid=str(p.id); db.close()

# Meeting 1, add a topic with a guest, defer it
m1=c.post("/api/meetings",json={"kind":"meeting","date":"2026-07-01"}).json()
t=c.post(f"/api/meetings/{m1['id']}/topics",json={"title":"נושא נדחה","invited_guests":[pid]}).json()
r=c.post(f"/api/meetings/{m1['id']}/topics/{t['id']}/defer")
print("defer:", r.status_code, "status:", r.json()["status"])
assert r.status_code==201 and r.json()["status"]=="deferred"

# Create meeting 2 (same kind, later) -> deferred topic pulled in + guest invited
m2=c.post("/api/meetings",json={"kind":"meeting","date":"2026-08-01"}).json()
m2full=c.get(f"/api/meetings/{m2['id']}").json()
titles=[x["title"] for x in m2full["topics"]]
print("m2 topics:", titles)
assert "נושא נדחה" in titles, "deferred topic carried into next meeting"
invmails=[i["email"] for i in m2full["invites"]]
print("m2 invites:", invmails)
assert "guest@x.com" in invmails, "deferred topic's guest invited to next meeting"

# An assembly created after should NOT pull the meeting-kind deferred topic (already placed anyway)
a=c.post("/api/meetings",json={"kind":"assembly","date":"2026-08-15"}).json()
atitles=[x["title"] for x in c.get(f"/api/meetings/{a['id']}").json()["topics"]]
assert "נושא נדחה" not in atitles
print("assembly didn't pull it: OK")
print("ALL OK")

import os, datetime as dt
from uuid import UUID as U, uuid4
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
c=TestClient(app); c.cookies.set("klaser_session","x")

db=S()
p1=Participant(tenant_id=U(T),full_name="עם מייל",email="has@x.com",created_by_user_id=U(USER))
p2=Participant(tenant_id=U(T),full_name="בלי מייל",email=None,created_by_user_id=U(USER))
db.add_all([p1,p2]); db.commit(); p1id=str(p1.id); p2id=str(p2.id); db.close()

# 1. pool add -> approved, no approval needed
r=c.post("/api/topic-pool",json={"title":"נושא","duration_minutes":10,"invited_guests":[p1id,p2id],"priority":0})
print("pool status:", r.json()["status"], "guests:", len(r.json()["invited_guests"]))
assert r.json()["status"]=="approved"

# 2. add topic to a meeting with those guests -> invites p1 (email), skip p2 (no email)
m=c.post("/api/meetings",json={"kind":"meeting","date":"2026-07-28"}).json()
c.post(f"/api/meetings/{m['id']}/topics",json={"title":"נושא","invited_guests":[p1id,p2id,"garbage"]})
inv=c.get(f"/api/meetings/{m['id']}").json()["invites"]
emails=sorted(i["email"] for i in inv)
print("invites after add-topic:", emails)
assert emails==["has@x.com"], emails
# 3. adding another topic with same guest doesn't double-invite
c.post(f"/api/meetings/{m['id']}/topics",json={"title":"עוד","invited_guests":[p1id]})
inv2=c.get(f"/api/meetings/{m['id']}").json()["invites"]
assert len([i for i in inv2 if i["email"]=="has@x.com"])==1, "no duplicate invite"
print("no duplicate on re-add: OK")
print("ALL OK")

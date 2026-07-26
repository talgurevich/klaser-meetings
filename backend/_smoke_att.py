import os, datetime as dt
from uuid import UUID as U, uuid4
os.environ["DATABASE_URL"] = "sqlite://"
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
import app.services.identity as identity
from app.services.identity import IdentityUser
from app.db import Base, get_db
from app import models
from app.models import Meeting, MeetingInvite, Participant
from app.main import app
T="a1b2c3d4-1111-4a2b-8c3d-e5f6a7b8c9d0"; USER="b2c3d4e5-2222-4b3c-9d4e-f6a7b8c9d0e1"
e=create_engine("sqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool)
Base.metadata.create_all(e); S=sessionmaker(bind=e)
def _db():
    d=S()
    try: yield d
    finally: d.close()
app.dependency_overrides[get_db]=_db
identity._introspect=lambda r: IdentityUser(user_id=USER,email="g@x.com",display_name="Gil",role="admin",is_super_admin=False,tenant_id=T,tenant_name=" t",entitlements=["meetings"])
c=TestClient(app); c.cookies.set("klaser_session","x")
mid_member=str(uuid4())
db=S()
m=Meeting(tenant_id=U(T),created_by_user_id=U(USER),kind="meeting",date=dt.date(2026,7,28),status="published",attendees_present=[mid_member])
db.add(m); db.flush()
p=Participant(tenant_id=U(T),full_name="דנה משתתפת",email="d@x.com",created_by_user_id=U(USER)); db.add(p); db.flush()
m.participant_ids=[str(p.id)]
db.add(MeetingInvite(tenant_id=U(T),meeting_id=m.id,invitee_kind="member",invitee_id=U(mid_member),email="avi@x.com",display_name="אבי חבר"))
db.commit(); mid=str(m.id); db.close()
r=c.get(f"/api/meetings/{mid}/attendance")
print(r.status_code, r.json())
assert r.status_code==200 and "אבי חבר" in r.json() and "דנה משתתפת" in r.json()
print("OK")

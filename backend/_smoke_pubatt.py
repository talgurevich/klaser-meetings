import os, datetime as dt
from uuid import UUID as U, uuid4
os.environ["DATABASE_URL"]="sqlite://"
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
import app.services.identity as identity
from app.services.identity import IdentityUser
import app.services.mail as mail
from app.db import Base, get_db
from app import models
from app.models import Meeting, MeetingInvite, Topic
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
# capture attachments passed to _send
seen={}
_orig=mail._send
def cap(msg):
    seen['att']=msg.attachments
    return  # skip real send
mail._send=cap
c=TestClient(app); c.cookies.set("klaser_session","x")
db=S()
m=Meeting(tenant_id=U(T),created_by_user_id=U(USER),kind="meeting",number="4-26",date=dt.date(2026,4,28),status="approved",protocol_approvals=[{"user_id":USER,"approved_at":"x"}])
db.add(m); db.flush()
db.add(MeetingInvite(tenant_id=U(T),meeting_id=m.id,invitee_kind="member",invitee_id=uuid4(),email="a@x.com",display_name="חבר"))
db.add(Topic(tenant_id=U(T),meeting_id=m.id,order=0,title="נושא",decision_text="approved"))
db.commit(); mid=str(m.id); db.close()
r=c.post(f"/api/meetings/{mid}/publish")
print("publish:",r.status_code)
att=seen.get('att',())
print("attachments:",[(a.filename, len(a.content)>1000) for a in att])
assert len(att)==1 and att[0].filename.endswith(".pdf") and len(att[0].content)>1000
print("OK - protocol PDF attached to summary email")

import os, datetime as dt
from uuid import UUID as U, uuid4
os.environ["DATABASE_URL"]="sqlite://"; os.environ.pop("RESEND_API_KEY",None)
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
import app.services.identity as identity
from app.services.identity import IdentityUser
from app.db import Base, get_db
from app import models
from app.models import Meeting, MeetingInvite, Participant
import app.services.mail as mail
mail.settings.resend_api_key=""  # force dry-run
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
m=Meeting(tenant_id=U(T),created_by_user_id=U(USER),kind="meeting",number="220726",date=dt.date(2026,7,22),status="approved",protocol_approvals=[{"user_id":USER,"approved_at":"x"}])
db.add(m); db.flush()
db.add(MeetingInvite(tenant_id=U(T),meeting_id=m.id,invitee_kind="member",invitee_id=uuid4(),email="avi@x.com",display_name="אבי"))
# public list contacts (tenant-wide, NOT attached to meeting)
db.add(Participant(tenant_id=U(T),full_name="ציבורי כן",email="pub@x.com",public_send=True,created_by_user_id=U(USER)))
db.add(Participant(tenant_id=U(T),full_name="לא ציבורי",email="no@x.com",public_send=False,created_by_user_id=U(USER)))
db.commit(); mid=str(m.id); db.close()
r=c.get(f"/api/meetings/{mid}/publish-preview")
emails=sorted(x["email"] for x in r.json()["recipients"])
print("recipients:", emails)
assert emails==["avi@x.com","pub@x.com"], "invitee + public contact only; non-public excluded"
print("OK")

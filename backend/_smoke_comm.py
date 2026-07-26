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
# one committee-by-email (matches a system user)
identity.identity_service.list_users=lambda tid:[{"id":"u1","email":"sysed@x.com","display_name":"Sys Editor"}]
c=TestClient(app); c.cookies.set("klaser_session","x")

db=S()
db.add(Participant(tenant_id=U(T),full_name="עורך ידני",email="manual@x.com",edit_permission=True,created_by_user_id=U(USER)))
db.add(Participant(tenant_id=U(T),full_name="עורך אימייל",email="sysed@x.com",edit_permission=False,created_by_user_id=U(USER)))
db.add(Participant(tenant_id=U(T),full_name="חבר רגיל",email="plain@x.com",edit_permission=False,created_by_user_id=U(USER)))
db.add(Participant(tenant_id=U(T),full_name="עורך בלי מייל",email=None,edit_permission=True,created_by_user_id=U(USER)))
db.commit(); db.close()

m=c.post("/api/meetings",json={"kind":"meeting","date":"2026-07-28"}).json()
inv=sorted(i["email"] for i in c.get(f"/api/meetings/{m['id']}").json()["invites"])
print("auto-invited:", inv)
assert inv==["manual@x.com","sysed@x.com"], inv   # both committee (manual + email-match); plain & no-email excluded
print("OK — committee auto-invited, non-committee & no-email excluded")

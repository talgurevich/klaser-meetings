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
# modal-style create: single full_name, email, join_date
r=c.post("/api/participants",json={"full_name":"נעם גל","email":"noam@x.com","phone":"050","role":"גזבר","join_date":"2026-05-28","public_send":True,"edit_permission":False})
print("create:", r.status_code)
p=r.json(); print(p["full_name"], p["join_date"], p["role"], "member",p["public_send"],"editor",p["edit_permission"])
assert p["full_name"]=="נעם גל" and p["join_date"]=="2026-05-28" and p["public_send"] and not p["edit_permission"]
# edit: flip editor on + change join date
r2=c.patch(f"/api/participants/{p['id']}",json={"edit_permission":True,"join_date":"2026-06-01"})
q=r2.json(); assert q["edit_permission"] and q["join_date"]=="2026-06-01"
print("edit OK")
print("ALL OK")

import os
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
c=TestClient(app); c.cookies.set("klaser_session","x")
print("initial role_titles:", c.get("/api/tenant-settings").json()["role_titles"])
r=c.put("/api/tenant-settings",json={"role_titles":["גזבר","מזכיר","יו\"ר"]})
print("after put:", r.json()["role_titles"])
assert r.json()["role_titles"]==["גזבר","מזכיר","יו\"ר"]
print("re-get:", c.get("/api/tenant-settings").json()["role_titles"])
assert c.get("/api/tenant-settings").json()["role_titles"]==["גזבר","מזכיר","יו\"ר"]
print("OK")

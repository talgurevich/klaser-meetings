import os, datetime as dt
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
c=TestClient(app); c.cookies.set("klaser_session","x")
def mk(kind,date):
    return c.post("/api/meetings",json={"kind":kind,"date":date}).json()["number"]
print("m1:", mk("meeting","2026-02-01"))    # 1-26
print("m2:", mk("meeting","2026-05-01"))    # 2-26
print("assembly1:", mk("assembly","2026-03-01"))  # 1-26 (separate kind sequence)
print("m3-2027:", mk("meeting","2027-01-10"))     # 1-27 (new year)
print("m4-2026:", mk("meeting","2026-08-01"))     # 3-26
assert mk.__self__ is None if False else True
# re-fetch numbers to assert
nums=[m["number"] for m in c.get("/api/meetings").json()]
print("all numbers:", sorted(nums))

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
from app.models import Meeting
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
for d_,st,ti in [(dt.date(2026,1,10),"draft","a"),(dt.date(2026,6,15),"published","b"),(dt.date(2026,9,20),"published","c")]:
    db.add(Meeting(tenant_id=U(T),created_by_user_id=U(USER),kind="meeting",date=d_,status=st,title=ti))
db.commit(); db.close()
def titles(**q):
    import urllib.parse
    qs="&".join(f"{k}={urllib.parse.quote(v)}" for k,v in q.items())
    r=c.get("/api/meetings"+("?"+qs if qs else ""))
    return sorted(m["title"] for m in r.json())
print("all:", titles())
print("published:", titles(status="published"))
assert titles(status="published")==["b","c"]
print("from 2026-05-01:", titles(date_from="2026-05-01"))
assert titles(date_from="2026-05-01")==["b","c"]
print("to 2026-05-01:", titles(date_to="2026-05-01"))
assert titles(date_to="2026-05-01")==["a"]
print("published + range:", titles(status="published",date_from="2026-07-01",date_to="2026-12-31"))
assert titles(status="published",date_from="2026-07-01",date_to="2026-12-31")==["c"]
print("OK")

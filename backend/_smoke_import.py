import os, io
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
# one system user matches a CSV email
identity.identity_service.list_users=lambda tid:[{"id":"u1","email":"eyalmarks@gmail.com","display_name":"אייל"}]
c=TestClient(app); c.cookies.set("klaser_session","x")

csv_text = "שם משפחה,שם פרטי,כינוי,נייד,אימייל,תפקיד,פעיל,הרשאות עריכה\n"
csv_text += "גל,נעם,,050-305-2968,noam@elrom.tv,,כן,לא\n"
csv_text += "מרקס,אייל,,052-673-3863,eyalmarks@gmail.com,מנהל הקהילה,כן,כן\n"
csv_text += "פוטוק,סתיו,,054-286-1067,,רפת,לא,לא\n"           # no email, active=לא
csv_text += "גל,נעם,dup,050-000-0000,noam@elrom.tv,,כן,לא\n"   # duplicate email -> skipped

r = c.post("/api/participants/import", files={"file": ("alfon.csv", csv_text.encode("utf-8"), "text/csv")})
print("import:", r.status_code, r.json())
assert r.status_code==200
assert r.json()=={"imported":3,"skipped":1}, r.json()

r = c.get("/api/participants")
rows = {p["full_name"]: p for p in r.json()}
print("names:", sorted(rows))
noam = rows["נעם גל"]; eyal = rows["אייל מרקס"]; stav = rows["סתיו פוטוק"]
assert noam["email"]=="noam@elrom.tv" and noam["is_system_user"] is False
assert eyal["is_system_user"] is True and eyal["role"]=="מנהל הקהילה"
assert stav["active"] is False and stav["email"] is None and stav["role"]=="רפת"
assert all(p["public_send"] for p in rows.values())  # default on
print("OK")

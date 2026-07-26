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
csv_text="שם משפחה,שם פרטי,כינוי,נייד,אימייל,תפקיד,פעיל,הרשאות עריכה\n"
csv_text+="גל,נעם,,050,noam@x.com,,כן,לא\n"
csv_text+="פוטוק,סתיו,,054,stav@x.com,רפת,לא,לא\n"
r=c.post("/api/participants/import",files={"file":("a.csv",csv_text.encode("utf-8"),"text/csv")})
print("import:",r.json())
rows={p["full_name"]:p for p in c.get("/api/participants").json()}
assert rows["נעם גל"]["public_send"] is True
assert rows["סתיו פוטוק"]["public_send"] is False
assert "active" not in rows["נעם גל"]
print("public_send: נעם=True, סתיו(פעיל=לא)=False  OK")

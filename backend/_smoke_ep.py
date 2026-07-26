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
identity.identity_service.list_users=lambda tid:[{"id":"u1","email":"sys@x.com","display_name":"Sys"}]
c=TestClient(app); c.cookies.set("klaser_session","x")

# manual mark, no email match -> edit_permission True, is_system_user False
c.post("/api/participants",json={"first_name":"מנואל","last_name":"א","email":"manual@x.com","edit_permission":True})
# email match, no manual -> is_system_user True, edit_permission False
c.post("/api/participants",json={"first_name":"סיס","last_name":"ב","email":"sys@x.com"})
# neither
c.post("/api/participants",json={"first_name":"רגיל","last_name":"ג","email":"plain@x.com"})
# CSV import reading הרשאות עריכה=כן
csv="שם משפחה,שם פרטי,כינוי,נייד,אימייל,תפקיד,פעיל,הרשאות עריכה\nד,ייבוא,,050,imp@x.com,,כן,כן\n"
c.post("/api/participants/import",files={"file":("a.csv",csv.encode("utf-8"),"text/csv")})

rows={p["full_name"]:p for p in c.get("/api/participants").json()}
def eff(p): return p["is_system_user"] or p["edit_permission"]
man=rows["מנואל א"]; sys=rows["סיס ב"]; plain=rows["רגיל ג"]; imp=rows["ייבוא ד"]
print("manual:", man["edit_permission"], man["is_system_user"], "eff", eff(man))
print("sysmatch:", sys["edit_permission"], sys["is_system_user"], "eff", eff(sys))
print("plain:", plain["edit_permission"], plain["is_system_user"], "eff", eff(plain))
print("import(כן):", imp["edit_permission"], "eff", eff(imp))
assert man["edit_permission"] and not man["is_system_user"] and eff(man)
assert sys["is_system_user"] and not sys["edit_permission"] and eff(sys)
assert not eff(plain)
assert imp["edit_permission"] and eff(imp)
print("OK")

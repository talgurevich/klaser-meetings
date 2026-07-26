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
identity.identity_service.list_users=lambda tid:[]
c=TestClient(app); c.cookies.set("klaser_session","x")
# create with multiple roles
r=c.post("/api/participants",json={"full_name":"א","email":"a@x.com","roles":["גזבר","מזכיר"]})
p=r.json(); print("create roles:",p["roles"]); assert p["roles"]==["גזבר","מזכיר"]
# edit roles
q=c.patch(f"/api/participants/{p['id']}",json={"roles":["יו\"ר"]}).json(); assert q["roles"]==["יו\"ר"]
# CSV import -> roles=[value]
csv="שם משפחה,שם פרטי,כינוי,נייד,אימייל,תפקיד,פעיל,הרשאות עריכה\nב,ייבוא,,050,imp@x.com,מנהל הקהילה,כן,לא\n"
c.post("/api/participants/import",files={"file":("a.csv",csv.encode("utf-8"),"text/csv")})
# legacy fallback: a row with only `role` set
db=S(); db.add(Participant(tenant_id=U(T),full_name="לגסי",email="l@x.com",role="ותיק",created_by_user_id=U(USER))); db.commit(); db.close()
rows={x["full_name"]:x for x in c.get("/api/participants").json()}
print("import roles:",rows["ייבוא ב"]["roles"]); assert rows["ייבוא ב"]["roles"]==["מנהל הקהילה"]
print("legacy roles:",rows["לגסי"]["roles"]); assert rows["לגסי"]["roles"]==["ותיק"]
print("ALL OK")

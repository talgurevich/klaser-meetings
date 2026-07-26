import os, datetime as dt
from uuid import UUID as U
os.environ["DATABASE_URL"]="sqlite://"
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.db import Base
from app import models
from app.models import Meeting, Topic, TenantSettings
from app.services.protocol_pdf import build_protocol_pdf
T="a1b2c3d4-1111-4a2b-8c3d-e5f6a7b8c9d0"; USER="b2c3d4e5-2222-4b3c-9d4e-f6a7b8c9d0e1"
e=create_engine("sqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool)
Base.metadata.create_all(e); S=sessionmaker(bind=e); db=S()
db.add(TenantSettings(tenant_id=U(T),org_name="ארגון"))
m=Meeting(tenant_id=U(T),created_by_user_id=U(USER),kind="meeting",number="5-26",date=dt.date(2026,5,1),status="published")
db.add(m); db.flush()
db.add(Topic(tenant_id=U(T),meeting_id=m.id,order=0,title="נושא שהוכרע",status="done",decision_text="approved",duration_minutes=5))
db.add(Topic(tenant_id=U(T),meeting_id=m.id,order=1,title="נושא שנדחה",status="deferred",duration_minutes=10))
db.commit(); m=db.get(Meeting,m.id)
open("/sessions/beautiful-vibrant-davinci/mnt/outputs/protocol_defer.pdf","wb").write(build_protocol_pdf(db,m,"ארגון"))
print("ok")

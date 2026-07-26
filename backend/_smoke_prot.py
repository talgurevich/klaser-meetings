import os, datetime as dt
from uuid import UUID as U, uuid4
os.environ["DATABASE_URL"]="sqlite://"
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.db import Base
from app import models
from app.models import Meeting, MeetingInvite, Topic, TenantSettings, Signatory
from app.services.protocol_pdf import build_protocol_pdf
T="a1b2c3d4-1111-4a2b-8c3d-e5f6a7b8c9d0"; USER="b2c3d4e5-2222-4b3c-9d4e-f6a7b8c9d0e1"
e=create_engine("sqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool)
Base.metadata.create_all(e); S=sessionmaker(bind=e); db=S()
ts=TenantSettings(tenant_id=U(T), org_name="ועד הנהלה אגודה קהילתית אל-רום")
db.add(ts); db.flush()
db.add(Signatory(tenant_id=U(T),tenant_settings_id=ts.id,order=0,position_title="יו\"ר אגודה קהילתית",member_display_name="נעם גל"))
db.add(Signatory(tenant_id=U(T),tenant_settings_id=ts.id,order=1,position_title="מנהל קהילה",member_display_name="אייל מרקס"))
present_id=str(uuid4()); absent_id=str(uuid4())
m=Meeting(tenant_id=U(T),created_by_user_id=U(USER),kind="meeting",number="4-26",date=dt.date(2026,4,28),time_start=dt.time(18,0),time_end=dt.time(20,0),location="חדר ישיבות מזכירות",status="published",attendees_present=[present_id])
db.add(m); db.flush()
db.add(MeetingInvite(tenant_id=U(T),meeting_id=m.id,invitee_kind="member",invitee_id=U(present_id),email="p@x.com",display_name="נעם גל"))
db.add(MeetingInvite(tenant_id=U(T),meeting_id=m.id,invitee_kind="member",invitee_id=U(absent_id),email="a@x.com",display_name="אורית דואק"))
db.add(Topic(tenant_id=U(T),meeting_id=m.id,order=0,title="אישור פרוטוקול 3-26",duration_minutes=2,decision_text="approved"))
db.add(Topic(tenant_id=U(T),meeting_id=m.id,order=1,title="מינוי רפרנט ועד הנהלה לועדת חינוך",duration_minutes=6,decision_text="approved",topic_notes="קטי תהיה רפרנטית ועד ההנהלה עד ספטמבר 2026"))
db.add(Topic(tenant_id=U(T),meeting_id=m.id,order=2,title="עדכונים",duration_minutes=30,decision_text="approved"))
db.commit(); m=db.get(Meeting,m.id)
pdf=build_protocol_pdf(db,m,"אגודה קהילתית")
open("/sessions/beautiful-vibrant-davinci/mnt/outputs/protocol_sample.pdf","wb").write(pdf)
print("bytes:",len(pdf))

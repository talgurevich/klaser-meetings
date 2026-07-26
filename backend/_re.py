import os, datetime as dt
from uuid import UUID as U, uuid4
os.environ["DATABASE_URL"]="sqlite://"
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.db import Base
from app import models
from app.models import Meeting, MeetingInvite, Participant, Topic, TenantSettings, Signatory
from app.services.invite_pdf import build_invite_pdf
T="a1b2c3d4-1111-4a2b-8c3d-e5f6a7b8c9d0"; USER="b2c3d4e5-2222-4b3c-9d4e-f6a7b8c9d0e1"
e=create_engine("sqlite://",connect_args={"check_same_thread":False},poolclass=StaticPool)
Base.metadata.create_all(e); S=sessionmaker(bind=e); db=S()
ts=TenantSettings(tenant_id=U(T), org_name="אגודה קהילתית כפר אל-רום")
db.add(ts); db.flush()
db.add(Signatory(tenant_id=U(T), tenant_settings_id=ts.id, order=0, position_title="יו\"ר אגודה קהילתית", member_display_name="נעם גל"))
db.add(Signatory(tenant_id=U(T), tenant_settings_id=ts.id, order=1, position_title="מנהל קהילה", member_display_name="אייל מרקס"))
m=Meeting(tenant_id=U(T),created_by_user_id=U(USER),kind="meeting",number="8-26",date=dt.date(2026,7,20),time_start=dt.time(18,0),time_end=dt.time(20,0),location="חדר ישיבות, מזכירות",status="draft")
db.add(m); db.flush()
p1=Participant(tenant_id=U(T),full_name="שלומית גדליה",email="a@x.com",created_by_user_id=U(USER))
p2=Participant(tenant_id=U(T),full_name="מתן יפרח",email="b@x.com",created_by_user_id=U(USER))
db.add_all([p1,p2]); db.flush()
db.add(Topic(tenant_id=U(T),meeting_id=m.id,order=0,title="אישור פרוטוקול ישיבה קודמת",duration_minutes=2))
db.add(Topic(tenant_id=U(T),meeting_id=m.id,order=1,title="בחירת נציגים לועדת תכנון",description="יש לבחור שני חברי אגש\"ח ושני חברי קהילה",duration_minutes=30,invited_guests=[str(p1.id),str(p2.id)]))
db.add(Topic(tenant_id=U(T),meeting_id=m.id,order=2,title="עדכונים",duration_minutes=30))
for nm in ["ניר קליין","אייל מרקס","נעם גל","שלומית גדליה","מתן יפרח"]:
    db.add(MeetingInvite(tenant_id=U(T),meeting_id=m.id,invitee_kind="participant",invitee_id=uuid4(),email=f"{nm}@x.com",display_name=nm))
db.commit()
m=db.get(Meeting,m.id)
pdf=build_invite_pdf(db,m,"אגודה קהילתית כפר אל-רום")
open("/sessions/beautiful-vibrant-davinci/mnt/outputs/invite_sample.pdf","wb").write(pdf)
print("bytes:",len(pdf))

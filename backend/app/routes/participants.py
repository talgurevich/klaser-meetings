"""Participant directory — non-login contacts (full name, phone, email)
tenants track for meeting attendance. NOT identity Users: they never
authenticate and have no row in klaser-identity at all (see
app/models.py's Participant docstring).

Access, deliberately broader than most editor-gated routes here: any
entitled tenant member can list/create, matching the explicit product
requirement that "system users and admin" (not just editors) can add
participants for tracking. Editing/removing an existing directory entry
is editor-gated, since it can affect other meetings' attendance records
that already reference it.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Meeting, Participant
from app.schemas import ParticipantCreate, ParticipantOut, ParticipantUpdate
from app.services.identity import IdentityUser, require_entitlement
from app.services.permissions import require_editor

router = APIRouter()


@router.get("", response_model=list[ParticipantOut])
def list_participants(
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[Participant]:
    stmt = (
        select(Participant)
        .where(Participant.tenant_id == UUID(user.tenant_id))
        .order_by(Participant.full_name)
    )
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=ParticipantOut, status_code=201)
def create_participant(
    body: ParticipantCreate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> Participant:
    participant = Participant(
        tenant_id=UUID(user.tenant_id),
        full_name=body.full_name,
        phone=body.phone,
        email=body.email,
        public_send=body.public_send,
        created_by_user_id=UUID(user.user_id),
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return participant


@router.patch("/{participant_id}", response_model=ParticipantOut)
def update_participant(
    participant_id: UUID,
    body: ParticipantUpdate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Participant:
    participant = db.execute(
        select(Participant).where(
            Participant.id == participant_id, Participant.tenant_id == UUID(user.tenant_id)
        )
    ).scalar_one_or_none()
    if participant is None:
        raise HTTPException(status_code=404, detail="המשתתף/ת לא נמצא/ה")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(participant, field, value)

    db.commit()
    db.refresh(participant)
    return participant


@router.delete("/{participant_id}", status_code=204)
def delete_participant(
    participant_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> None:
    tenant_id = UUID(user.tenant_id)
    participant = db.execute(
        select(Participant).where(Participant.id == participant_id, Participant.tenant_id == tenant_id)
    ).scalar_one_or_none()
    if participant is None:
        raise HTTPException(status_code=404, detail="המשתתף/ת לא נמצא/ה")

    # Strip this participant from any meeting it was attached to — its id
    # lives only in Meeting.participant_ids (a plain JSON array, no FK), so
    # nothing enforces referential integrity automatically.
    pid = str(participant_id)
    meetings = db.execute(
        select(Meeting).where(Meeting.tenant_id == tenant_id, Meeting.participant_ids.isnot(None))
    ).scalars()
    for meeting in meetings:
        if meeting.participant_ids and pid in meeting.participant_ids:
            meeting.participant_ids = [p for p in meeting.participant_ids if p != pid]

    db.delete(participant)
    db.commit()

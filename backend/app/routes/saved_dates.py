"""Saved dates — lightweight placeholders for a future meeting date before
there's a real agenda (see app/models.py's SavedDate docstring).

Read is open to any entitled user (it's a shared planning calendar);
create/delete/convert are editor-gated, same as meeting creation itself —
reserving or committing a meeting date is an editing action, not a
member action.
"""
import datetime as dt
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Meeting, SavedDate
from app.schemas import MeetingOut, SavedDateCreate, SavedDateOut
from app.services.identity import IdentityUser, require_entitlement
from app.services.permissions import require_editor

router = APIRouter()


@router.get("", response_model=list[SavedDateOut])
def list_saved_dates(
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_entitlement("meetings")),
) -> list[SavedDate]:
    stmt = (
        select(SavedDate)
        .where(SavedDate.tenant_id == UUID(user.tenant_id), SavedDate.date >= dt.date.today())
        .order_by(SavedDate.date)
    )
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=SavedDateOut, status_code=201)
def create_saved_date(
    body: SavedDateCreate,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> SavedDate:
    saved_date = SavedDate(
        tenant_id=UUID(user.tenant_id),
        kind=body.kind,
        date=body.date,
        note=body.note,
        created_by_user_id=UUID(user.user_id),
    )
    db.add(saved_date)
    db.commit()
    db.refresh(saved_date)
    return saved_date


@router.delete("/{saved_date_id}", status_code=204)
def delete_saved_date(
    saved_date_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> None:
    saved_date = db.execute(
        select(SavedDate).where(SavedDate.id == saved_date_id, SavedDate.tenant_id == UUID(user.tenant_id))
    ).scalar_one_or_none()
    if saved_date is None:
        raise HTTPException(status_code=404, detail="התאריך השמור לא נמצא")
    db.delete(saved_date)
    db.commit()


@router.post("/{saved_date_id}/convert", response_model=MeetingOut, status_code=201)
def convert_saved_date(
    saved_date_id: UUID,
    db: Session = Depends(get_db),
    user: IdentityUser = Depends(require_editor()),
) -> Meeting:
    """Turn a placeholder date into a real draft Meeting, atomically —
    the meeting is created and the placeholder removed in the same
    transaction so a failure never leaves a duplicate or an orphan."""
    saved_date = db.execute(
        select(SavedDate).where(SavedDate.id == saved_date_id, SavedDate.tenant_id == UUID(user.tenant_id))
    ).scalar_one_or_none()
    if saved_date is None:
        raise HTTPException(status_code=404, detail="התאריך השמור לא נמצא")

    meeting = Meeting(
        tenant_id=UUID(user.tenant_id),
        created_by_user_id=UUID(user.user_id),
        kind=saved_date.kind,
        date=saved_date.date,
        status="draft",
    )
    db.add(meeting)
    db.delete(saved_date)
    db.commit()
    db.refresh(meeting)
    return meeting

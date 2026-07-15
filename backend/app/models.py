"""SQLAlchemy models for the Meetings service.

Data-ownership rule (see klaser-identity's docs/klaser-platform-infra.md and
docs/identity-cutover.md): this DB owns everything meeting-specific
(meetings, transcripts, protocols, …) and NOTHING else.

Do not add a `User`, `Tenant`, `AuthToken`, or `Subscription` model here —
those live exclusively in klaser-identity. Every `tenant_id` / `user_id`
column below is a plain UUID with NO foreign key into a local table (there
isn't one) — enrich with human-readable fields (email, tenant name, etc.)
by calling app.services.identity, never by joining across databases.

Example shape for a first real model, once you have one:

    class Meeting(Base):
        __tablename__ = "meetings"
        id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), primary_key=True, default=uuid4)
        tenant_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True), index=True)  # from identity — no FK
        created_by_user_id: Mapped[UUID] = mapped_column(SQLUUID(as_uuid=True))     # from identity — no FK
        title: Mapped[str | None] = mapped_column(String)
        created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
"""
# from datetime import datetime
# from uuid import UUID, uuid4
#
# from sqlalchemy import DateTime, String
# from sqlalchemy import UUID as SQLUUID
# from sqlalchemy.orm import Mapped, mapped_column
# from sqlalchemy.sql import func
#
# from app.db import Base

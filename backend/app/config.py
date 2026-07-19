"""Environment-driven config for the Meetings backend.

No session_secret, no cookie config here — this service never decodes a
session itself. Auth is entirely delegated to klaser-identity via
app/services/identity.py (see IDENTITY_URL / IDENTITY_SERVICE_TOKEN below).
"""
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    app_env: str = "development"
    log_level: str = "INFO"

    # Database — meetings' own DB (meeting-specific data only).
    database_url: str = "postgresql+psycopg://meetings:meetings@localhost:5434/meetings"

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_db_url(cls, v: str) -> str:
        """Render exposes Postgres as postgresql:// — convert to the psycopg3 driver scheme."""
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+psycopg://", 1)
        if isinstance(v, str) and v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql+psycopg://", 1)
        return v

    # Identity service — see app/services/identity.py
    identity_url: str = "http://localhost:8001"
    identity_service_token: str = ""

    # CORS — this product's frontend(s)
    frontend_url: str = "http://localhost:5174"

    @property
    def frontend_origins(self) -> list[str]:
        return [o.strip() for o in self.frontend_url.split(",") if o.strip()]

    @property
    def primary_frontend_url(self) -> str:
        """The one frontend origin used to build outbound links (invite
        emails, RSVP links) — first entry of frontend_url, since that can
        be a comma-separated CORS list in local dev (multiple ports)."""
        origins = self.frontend_origins
        return origins[0] if origins else "http://localhost:5174"

    # Mail — Resend. Same dry-run-without-a-key convention as klaser-identity's
    # app/services/mail.py: unset locally, invitation emails just get logged
    # instead of sent, so the invite/RSVP flow is fully testable without a
    # real Resend account.
    resend_api_key: str = ""
    mail_from_email: str = "noreply@klaser.co.il"
    mail_from_name: str = "Klaser"


settings = Settings()

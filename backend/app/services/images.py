"""Shared image upload validation + data-URL helpers, used by the settings
signatory images and the אלפון role-holder signatures. base64-in-Postgres
rather than object storage — same rationale as the rest of the app."""
import base64

from fastapi import HTTPException, UploadFile

MAX_IMAGE_BYTES = 2 * 1024 * 1024  # 2MB
ALLOWED_IMAGE_TYPES = {"image/png", "image/svg+xml", "image/jpeg", "image/jpg"}


def data_url(data: str | None, mime: str | None) -> str | None:
    if not data or not mime:
        return None
    return f"data:{mime};base64,{data}"


async def read_and_validate_image(file: UploadFile) -> tuple[str, str]:
    """Read an uploaded image, enforce the 2MB cap + content-type allowlist,
    and return (base64_data, mime) ready to store."""
    mime = file.content_type or ""
    if mime not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="סוג קובץ לא נתמך — יש להעלות PNG, SVG או JPG")
    raw = await file.read()
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail="הקובץ גדול מדי — הגודל המרבי הוא 2MB")
    return base64.b64encode(raw).decode("ascii"), mime

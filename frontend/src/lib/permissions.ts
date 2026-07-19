import type { CurrentUser } from "./api";

/** Mirrors backend/app/services/permissions.py — keep the two in sync.
 * identity's `role` is one global string per user (admin/reviewer/secretary,
 * ported from Takanon), not product-specific. Meetings' policy: admin and
 * secretary (מזכיר/ה — typically who runs the agenda in a community
 * association) can edit; reviewer is read-only + can suggest topics.
 * is_super_admin always passes regardless of role. */
const EDITOR_ROLES = new Set(["admin", "secretary"]);

export function isEditor(user: CurrentUser | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.is_super_admin) || EDITOR_ROLES.has((user.role || "").toLowerCase());
}

/** Tenant-admin capability (the "Users" section) — distinct from
 * isEditor: an editor manages meetings content, an admin manages who's
 * in the org. Mirrors klaser-identity's require_tenant_admin exactly
 * (role == "admin" or is_super_admin), since that's the real enforcement
 * boundary — this is UX-only (hide/show), not security. */
export function isAdmin(user: CurrentUser | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.is_super_admin) || (user.role || "").toLowerCase() === "admin";
}

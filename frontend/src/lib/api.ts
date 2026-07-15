// This product's own backend.
const BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8002";

// Identity service — every auth-related call (login, register, /me,
// logout, tenant-switch, password reset) goes here instead of this
// product's backend. Cookies are shared across .klaser.co.il in
// production so both bases see the same session. Mirrors Takanon's
// frontend/src/lib/api.ts split — keep the two in sync if the pattern
// changes.
const IDENTITY_BASE =
  import.meta.env.VITE_IDENTITY_BASE_URL || "http://localhost:8001";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Best-effort extraction of a human-readable message from any thrown
 * error — unwraps FastAPI's {"detail": "..."} body when present. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const parsed = JSON.parse(err.message);
      if (parsed?.detail) return parsed.detail;
    } catch {
      // not JSON — fall through to the raw message
    }
    return err.message.replace(/^\{"detail":"|"\}$/g, "");
  }
  return err instanceof Error ? err.message : String(err);
}

async function _fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new ApiError(r.status, body || r.statusText);
  }
  return r.json();
}

/** Hits this product's own backend. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return _fetchJson<T>(`${BASE}${path}`, init);
}

/** Same shape as `request` but hits the identity service instead of this
 * product's backend. Used for all auth endpoints. */
async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  return _fetchJson<T>(`${IDENTITY_BASE}${path}`, init);
}

// ─── Types ─────────────────────────────────────────────────────────────

export type CurrentUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  tenant_id: string;
  tenant_name: string | null;
  is_super_admin?: boolean;
  home_tenant_id?: string | null;
  home_tenant_name?: string | null;
  viewing_other_tenant?: boolean;
  entitlements?: string[];
};

export type TenantItem = {
  id: string;
  name: string;
  segment: string;
};

export type RegistrationInfo = {
  email: string;
  display_name: string | null;
  tenant_name: string;
  role: string;
};

export type ResetPasswordInfo = {
  email: string;
};

// ─── Endpoints ─────────────────────────────────────────────────────────
export const api = {
  // Auth — every call below goes to the identity service (auth.klaser.co.il)
  // via authRequest, not to this product's backend. Cookies span
  // .klaser.co.il so both bases see the same session.
  me: () => authRequest<CurrentUser>("/api/auth/me"),
  googleLogin: (credential: string) =>
    authRequest<CurrentUser>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify({ credential }),
    }),
  logout: () =>
    authRequest<{ status: string }>("/api/auth/logout", { method: "POST" }),
  passwordLogin: (email: string, password: string) =>
    authRequest<CurrentUser>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  getRegistrationInfo: (token: string) =>
    authRequest<RegistrationInfo>(
      `/api/auth/registration/${encodeURIComponent(token)}`
    ),
  register: (token: string, password: string, displayName?: string) =>
    authRequest<CurrentUser>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ token, password, display_name: displayName || null }),
    }),

  forgotPassword: (email: string) =>
    authRequest<{ status: string }>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  getResetPasswordInfo: (token: string) =>
    authRequest<ResetPasswordInfo>(
      `/api/auth/reset-password/${encodeURIComponent(token)}`
    ),
  resetPassword: (token: string, password: string) =>
    authRequest<CurrentUser>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    }),

  // Super-admin only — tenant switcher (lives on identity)
  listTenants: () => authRequest<TenantItem[]>("/api/auth/tenants"),
  switchTenant: (tenantId: string) =>
    authRequest<CurrentUser>("/api/auth/switch-tenant", {
      method: "POST",
      body: JSON.stringify({ tenant_id: tenantId }),
    }),
  exitSwitch: () =>
    authRequest<CurrentUser>("/api/auth/exit-switch", { method: "POST" }),

  // This product's own backend — smoke-test route, proves the identity
  // wiring end-to-end. Replace/extend with real meetings endpoints.
  ping: () => request<{ status: string; user_id: string; entitlements: string[] }>(
    "/api/meetings/ping"
  ),
};

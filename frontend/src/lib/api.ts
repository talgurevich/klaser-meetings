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
  // DELETE endpoints (and any other 204) return an empty body — calling
  // .json() on that throws "Unexpected end of JSON input" even though
  // the request succeeded. Treat "nothing to parse" as success with an
  // empty result rather than an error.
  if (r.status === 204) {
    return undefined as T;
  }
  const text = await r.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
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

/** File uploads (logo/stamp/signatory image) — deliberately NOT routed
 * through `request`/`_fetchJson`: those always set Content-Type:
 * application/json, which would corrupt a multipart body. The browser
 * sets the correct `multipart/form-data; boundary=...` header itself as
 * long as we don't touch Content-Type at all here. */
async function uploadFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  const r = await fetch(`${BASE}${path}`, { method: "POST", credentials: "include", body: form });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new ApiError(r.status, body || r.statusText);
  }
  const text = await r.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
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

export type TenantUserItem = {
  id: string;
  email: string;
  display_name: string | null;
  role: string;
  is_super_admin: boolean;
  has_password: boolean;
  created_at: string | null;
};

// ─── Meetings domain types (mirror backend/app/schemas.py) ───────────────

export type MeetingKind = "meeting" | "assembly";
export type MeetingStatus =
  | "draft"
  | "invited_internal"
  | "invited_public"
  | "active"
  | "pending_approval"
  | "approved"
  | "published"
  | "archived";
export type TopicStatus = "pending" | "in_progress" | "done" | "deferred" | "skipped" | "cancelled";
export type TopicPoolStatus = "pending_review" | "approved" | "in_meeting" | "used" | "rejected";

export type Topic = {
  id: string;
  meeting_id: string;
  order: number;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  is_private: boolean;
  status: TopicStatus;
  deferred_to_meeting_id: string | null;
  deferred_from_topic_id: string | null;
  decision_text: string | null;
  action_item: string | null;
  timer_elapsed: number | null;
  source_pool_id: string | null;
  suggested_by: string | null;
  is_default_first: boolean;
  is_default_last: boolean;
  approval_status: string | null;
  topic_notes: string | null;
  invited_guests: string[] | null;
  created_at: string;
  updated_at: string;
};

export type TopicCreateInput = {
  title: string;
  description?: string | null;
  duration_minutes?: number | null;
  is_private?: boolean;
  order?: number | null;
  source_pool_id?: string | null;
  invited_guests?: string[] | null;
};

export type Approval = { member_id: string; approved_at: string };

// One invited person + their RSVP for a specific meeting. See
// backend/app/models.py's MeetingInvite docstring — invitee_id is either
// an identity user id ("member") or a local Participant id
// ("participant"), two different id-spaces.
export type MeetingInvite = {
  id: string;
  invitee_kind: "member" | "participant";
  invitee_id: string;
  email: string;
  display_name: string | null;
  status: "pending" | "confirmed_attend" | "confirmed_absent";
  responded_at: string | null;
  created_at: string;
};

export type MeetingListItem = {
  id: string;
  kind: MeetingKind;
  number: string | null;
  title: string | null;
  date: string;
  time_start: string | null;
  location: string | null;
  status: MeetingStatus;
  created_at: string;
};

export type Meeting = MeetingListItem & {
  tenant_id: string;
  created_by_user_id: string;
  time_end: string | null;
  online_meeting_url: string | null;
  attendees_invited: string[] | null;
  attendees_present: string[] | null;
  participant_ids: string[] | null;
  attendees_responses: { user_id: string; status: string; responded_at: string | null }[] | null;
  // Matches backend/app/routes/meetings.py's add_internal_approval /
  // add_protocol_approval — key is member_id, not user_id.
  internal_approvals: Approval[] | null;
  protocol_approvals: Approval[] | null;
  protocol_to_approve_id: string | null;
  quorum_required: number | null;
  quorum_reached: boolean | null;
  notes: string | null;
  invite_sent_internal_at: string | null;
  invite_sent_public_at: string | null;
  protocol_generated_at: string | null;
  published_at: string | null;
  updated_at: string;
  topics: Topic[];
  invites: MeetingInvite[];
};

export type PublishPreview = {
  subject: string;
  html: string;
  recipients: { name: string; email: string }[];
  recipients_without_email: string[];
};

export type MeetingCreateInput = {
  kind: MeetingKind;
  title?: string | null;
  // Optional — omit to let the backend fill from the tenant's default
  // meeting weekday (falls back to today if no default is set).
  date?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  location?: string | null;
  online_meeting_url?: string | null;
  attendees_invited?: string[] | null;
  quorum_required?: number | null;
  notes?: string | null;
  topics?: TopicCreateInput[];
};

export type MeetingUpdateInput = Partial<
  Omit<MeetingCreateInput, "kind" | "topics"> & {
    number: string | null;
    status: MeetingStatus;
    attendees_present: string[] | null;
    participant_ids: string[] | null;
    quorum_reached: boolean | null;
  }
>;

export type TopicPoolItem = {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  invited_guests: string[] | null;
  source: "manual" | "public_suggestion";
  suggested_by: string | null;
  priority: number | null;
  status: TopicPoolStatus;
  created_at: string;
  updated_at: string;
};

export type Member = {
  id: string;
  email: string;
  display_name: string | null;
  role: string | null;
};

// Non-login contact tracked purely for meeting attendance — NOT an
// identity User, never authenticates. See backend/app/models.py's
// Participant docstring.
export type Participant = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  role: string | null;
  public_send: boolean;
  is_system_user: boolean;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type ParticipantInput = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nickname?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: string | null;
  public_send?: boolean;
};

// A placeholder future meeting date, not yet a real Meeting — see
// backend/app/models.py's SavedDate docstring.
export type SavedDate = {
  id: string;
  kind: MeetingKind;
  date: string;
  note: string | null;
  created_by_user_id: string;
  created_at: string;
};

export type DashboardMeetingItem = {
  id: string;
  kind: MeetingKind;
  number: string | null;
  display_number: string;
  title: string | null;
  date: string;
  time_start: string | null;
  location: string | null;
  status: MeetingStatus;
  created_at: string;
};

export type DashboardData = {
  continuing_meeting: DashboardMeetingItem | null;
  upcoming_meeting: MeetingListItem | null;
  saved_dates: SavedDate[];
  protocols_count: number;
  open_action_items_count: number;
  recent_protocols: MeetingListItem[];
};

export type DecisionSearchResult = {
  meeting_id: string;
  meeting_kind: MeetingKind;
  meeting_number: string | null;
  meeting_date: string;
  topic_id: string;
  topic_title: string;
  decision_text: string;
};

export type ActionItem = {
  topic_id: string;
  meeting_id: string;
  meeting_kind: MeetingKind;
  meeting_number: string | null;
  meeting_date: string;
  topic_title: string;
  action_item: string;
  action_item_done: boolean;
};

export type InvitePreviewTopic = { title: string; duration_minutes: number | null };

export type InvitePreview = {
  recipient_name: string;
  recipient_email: string;
  tenant_name: string;
  meeting_kind: MeetingKind;
  meeting_number: string | null;
  meeting_date: string;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  topics: InvitePreviewTopic[];
};

// Tenant settings — org branding, protocol signatories, meeting/assembly
// defaults, recurring topic templates. See backend/app/models.py's
// TenantSettings/Signatory docstrings and backend/app/routes/settings.py.
export type Signatory = {
  id: string;
  order: number;
  member_user_id: string | null;
  member_display_name: string | null;
  member_role: string | null;
  position_title: string | null;
  signature_text: string | null;
  signature_image_url: string | null; // data: URL
};

export type TenantSettings = {
  org_name: string | null;
  logo_url: string | null; // data: URL
  email_signature: string | null;
  stamp_url: string | null; // data: URL
  meeting_location: string | null;
  meeting_weekday: number | null; // 0=Sunday .. 6=Saturday
  meeting_start_time: string | null;
  meeting_end_time: string | null;
  assembly_location: string | null;
  assembly_weekday: number | null;
  assembly_start_time: string | null;
  assembly_end_time: string | null;
  recurring_topic_first_title: string | null;
  recurring_topic_first_duration: number | null;
  recurring_topic_last_title: string | null;
  recurring_topic_last_duration: number | null;
  signatories: Signatory[];
};

export type TenantSettingsUpdateInput = Partial<
  Omit<TenantSettings, "logo_url" | "stamp_url" | "signatories">
>;

// What the public, no-login /rsvp/:token page sees.
export type RsvpMeeting = {
  recipient_name: string;
  status: "pending" | "confirmed_attend" | "confirmed_absent";
  tenant_name: string;
  meeting_kind: MeetingKind;
  meeting_number: string | null;
  meeting_date: string;
  time_start: string | null;
  time_end: string | null;
  location: string | null;
  topics: InvitePreviewTopic[];
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

  // Tenant admin — the "Users" section. Session-authed (not the
  // service-token /api/service/users*), gated server-side on
  // role=="admin" || is_super_admin, hard-scoped to the caller's own
  // tenant. See klaser-identity/app/routes/tenant_admin.py.
  listTenantUsers: () => authRequest<TenantUserItem[]>("/api/auth/tenant-users"),
  inviteTenantUser: (body: { email: string; role: string; display_name?: string | null }) =>
    authRequest<TenantUserItem>("/api/auth/tenant-users/invite", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTenantUser: (userId: string, body: { role?: string; display_name?: string | null }) =>
    authRequest<TenantUserItem>(`/api/auth/tenant-users/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTenantUser: (userId: string) =>
    authRequest<{ status: string; already_absent: boolean }>(`/api/auth/tenant-users/${userId}`, {
      method: "DELETE",
    }),
  resendTenantUserInvite: (userId: string) =>
    authRequest<TenantUserItem>(`/api/auth/tenant-users/${userId}/resend-invite`, {
      method: "POST",
    }),

  // This product's own backend — smoke-test route, proves the identity
  // wiring end-to-end.
  ping: () => request<{ status: string; user_id: string; entitlements: string[] }>(
    "/api/meetings/ping"
  ),

  // ─── Meetings ────────────────────────────────────────────────────────
  listMeetings: (params?: {
    kind?: MeetingKind;
    status?: MeetingStatus;
    date_from?: string;
    date_to?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.kind) qs.set("kind", params.kind);
    if (params?.status) qs.set("status", params.status);
    if (params?.date_from) qs.set("date_from", params.date_from);
    if (params?.date_to) qs.set("date_to", params.date_to);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<MeetingListItem[]>(`/api/meetings${suffix}`);
  },
  getMeeting: (id: string) => request<Meeting>(`/api/meetings/${id}`),
  createMeeting: (body: MeetingCreateInput) =>
    request<Meeting>("/api/meetings", { method: "POST", body: JSON.stringify(body) }),
  updateMeeting: (id: string, body: MeetingUpdateInput) =>
    request<Meeting>(`/api/meetings/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMeeting: (id: string) => request<void>(`/api/meetings/${id}`, { method: "DELETE" }),

  // Publish-to-public flow: preview the summary email + recipients, then
  // confirm to send + transition approved -> published.
  getPublishPreview: (id: string) =>
    request<PublishPreview>(`/api/meetings/${id}/publish-preview`),
  publishMeeting: (id: string) =>
    request<Meeting>(`/api/meetings/${id}/publish`, { method: "POST" }),
  getAttendance: (id: string) => request<string[]>(`/api/meetings/${id}/attendance`),

  addTopic: (meetingId: string, body: TopicCreateInput) =>
    request<Topic>(`/api/meetings/${meetingId}/topics`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateTopic: (meetingId: string, topicId: string, body: Partial<Topic>) =>
    request<Topic>(`/api/meetings/${meetingId}/topics/${topicId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteTopic: (meetingId: string, topicId: string) =>
    request<void>(`/api/meetings/${meetingId}/topics/${topicId}`, { method: "DELETE" }),
  reorderTopics: (meetingId: string, items: { id: string; order: number }[]) =>
    request<Topic[]>(`/api/meetings/${meetingId}/topics/reorder`, {
      method: "POST",
      body: JSON.stringify(items),
    }),

  // ─── Topic pool ──────────────────────────────────────────────────────
  listTopicPool: (status?: TopicPoolStatus) =>
    request<TopicPoolItem[]>(`/api/topic-pool${status ? `?status=${status}` : ""}`),
  suggestTopic: (body: {
    title: string;
    description?: string | null;
    duration_minutes?: number | null;
    invited_guests?: string[] | null;
    priority?: number | null;
  }) => request<TopicPoolItem>("/api/topic-pool", { method: "POST", body: JSON.stringify(body) }),
  updateTopicPoolItem: (id: string, body: Partial<Pick<TopicPoolItem, "title" | "description" | "duration_minutes" | "priority" | "status">>) =>
    request<TopicPoolItem>(`/api/topic-pool/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteTopicPoolItem: (id: string) =>
    request<void>(`/api/topic-pool/${id}`, { method: "DELETE" }),

  // ─── Members (tenant roster, proxied from identity) ─────────────────
  listMembers: () => request<Member[]>("/api/members"),

  // ─── Attendance ──────────────────────────────────────────────────────
  markAttendeePresent: (meetingId: string, memberId: string) =>
    request<string[]>(`/api/meetings/${meetingId}/attendees/${memberId}/present`, {
      method: "POST",
    }),
  markAttendeeAbsent: (meetingId: string, memberId: string) =>
    request<string[]>(`/api/meetings/${meetingId}/attendees/${memberId}/present`, {
      method: "DELETE",
    }),

  // ─── Defer ───────────────────────────────────────────────────────────
  deferTopic: (meetingId: string, topicId: string) =>
    request<Topic>(`/api/meetings/${meetingId}/topics/${topicId}/defer`, { method: "POST" }),
  undoDeferTopic: (meetingId: string, topicId: string) =>
    request<Topic>(`/api/meetings/${meetingId}/topics/${topicId}/undo-defer`, { method: "POST" }),

  // ─── Approvals ───────────────────────────────────────────────────────
  addInternalApproval: (meetingId: string) =>
    request<Meeting>(`/api/meetings/${meetingId}/internal-approval`, { method: "POST" }),
  addProtocolApproval: (meetingId: string) =>
    request<Meeting>(`/api/meetings/${meetingId}/protocol-approval`, { method: "POST" }),

  // ─── Participants (non-login contacts, see api.ts's Participant type) ─
  listParticipants: () => request<Participant[]>("/api/participants"),
  createParticipant: (body: ParticipantInput) =>
    request<Participant>("/api/participants", { method: "POST", body: JSON.stringify(body) }),
  updateParticipant: (id: string, body: ParticipantInput) =>
    request<Participant>(`/api/participants/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  importParticipants: (file: File) =>
    uploadFile<{ imported: number; skipped: number }>("/api/participants/import", file),
  deleteParticipant: (id: string) => request<void>(`/api/participants/${id}`, { method: "DELETE" }),

  // Attach/detach a directory participant to a specific meeting's
  // attendance. Open to any entitled user server-side (not editor-only —
  // see backend/app/routes/meetings.py).
  addParticipantToMeeting: (meetingId: string, participantId: string) =>
    request<string[]>(`/api/meetings/${meetingId}/participants/${participantId}`, { method: "POST" }),
  removeParticipantFromMeeting: (meetingId: string, participantId: string) =>
    request<string[]>(`/api/meetings/${meetingId}/participants/${participantId}`, { method: "DELETE" }),

  // ─── Saved dates ────────────────────────────────────────────────────
  listSavedDates: () => request<SavedDate[]>("/api/saved-dates"),
  createSavedDate: (body: { kind: MeetingKind; date: string; note?: string | null }) =>
    request<SavedDate>("/api/saved-dates", { method: "POST", body: JSON.stringify(body) }),
  deleteSavedDate: (id: string) => request<void>(`/api/saved-dates/${id}`, { method: "DELETE" }),
  convertSavedDate: (id: string) => request<Meeting>(`/api/saved-dates/${id}/convert`, { method: "POST" }),

  // ─── Decisions search ───────────────────────────────────────────────
  searchDecisions: (q: string) =>
    request<DecisionSearchResult[]>(`/api/decisions/search?q=${encodeURIComponent(q)}`),

  // ─── Dashboard ──────────────────────────────────────────────────────
  getDashboard: () => request<DashboardData>("/api/dashboard"),

  // ─── Action items (משימות לביצוע) — tenant-wide, across all meetings.
  // `notify` is opt-in per call — checking "עדכן במייל את המוזמנים" in the
  // UI before marking done/deleting is what emails the meeting's
  // invitees (see backend/app/routes/action_items.py); omitted/false
  // sends nothing. ───────────────────────────────────────────────────
  listActionItems: () => request<ActionItem[]>("/api/action-items"),
  setActionItemDone: (topicId: string, done: boolean, notify = false) =>
    request<ActionItem>(`/api/action-items/${topicId}`, {
      method: "PATCH",
      body: JSON.stringify({ done, notify }),
    }),
  deleteActionItem: (topicId: string, notify = false) =>
    request<void>(`/api/action-items/${topicId}?notify=${notify}`, { method: "DELETE" }),

  // ─── Meeting invites (editor-only) ─────────────────────────────────
  addInvites: (meetingId: string, invitees: { kind: "member" | "participant"; id: string }[]) =>
    request<MeetingInvite[]>(`/api/meetings/${meetingId}/invites`, {
      method: "POST",
      body: JSON.stringify(invitees),
    }),
  removeInvite: (meetingId: string, inviteId: string) =>
    request<void>(`/api/meetings/${meetingId}/invites/${inviteId}`, { method: "DELETE" }),
  sendInternalInvites: (meetingId: string) =>
    request<Meeting>(`/api/meetings/${meetingId}/invites/send-internal`, { method: "POST" }),
  sendPublicInvites: (meetingId: string) =>
    request<Meeting>(`/api/meetings/${meetingId}/invites/send-public`, { method: "POST" }),
  previewInvite: (meetingId: string, inviteeId?: string) =>
    request<InvitePreview>(
      `/api/meetings/${meetingId}/invites/preview${inviteeId ? `?invitee_id=${inviteeId}` : ""}`
    ),

  // ─── Public RSVP — no session, no credentials needed. Token possession
  // is the entire auth model (see backend/app/routes/rsvp.py). ─────────
  getRsvp: (token: string) => request<RsvpMeeting>(`/api/public/rsvp/${encodeURIComponent(token)}`),
  submitRsvp: (token: string, response: "confirmed_attend" | "confirmed_absent") =>
    request<RsvpMeeting>(`/api/public/rsvp/${encodeURIComponent(token)}`, {
      method: "POST",
      body: JSON.stringify({ response }),
    }),

  // ─── Tenant settings — reads open to any entitled user, writes
  // (PUT/logo/stamp/signatories) admin-only server-side (require_admin);
  // my-signature is self-service for any entitled user. See
  // backend/app/routes/settings.py. ───────────────────────────────────
  getTenantSettings: () => request<TenantSettings>("/api/tenant-settings"),
  updateTenantSettings: (body: TenantSettingsUpdateInput) =>
    request<TenantSettings>("/api/tenant-settings", { method: "PUT", body: JSON.stringify(body) }),
  uploadLogo: (file: File) => uploadFile<TenantSettings>("/api/tenant-settings/logo", file),
  deleteLogo: () => request<TenantSettings>("/api/tenant-settings/logo", { method: "DELETE" }),
  uploadStamp: (file: File) => uploadFile<TenantSettings>("/api/tenant-settings/stamp", file),
  deleteStamp: () => request<TenantSettings>("/api/tenant-settings/stamp", { method: "DELETE" }),

  addSignatory: (body: { member_user_id?: string | null; position_title?: string | null; signature_text?: string | null }) =>
    request<Signatory>("/api/tenant-settings/signatories", { method: "POST", body: JSON.stringify(body) }),
  updateSignatory: (
    id: string,
    body: { member_user_id?: string | null; position_title?: string | null; signature_text?: string | null }
  ) =>
    request<Signatory>(`/api/tenant-settings/signatories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSignatory: (id: string) => request<void>(`/api/tenant-settings/signatories/${id}`, { method: "DELETE" }),
  uploadSignatoryImage: (id: string, file: File) =>
    uploadFile<Signatory>(`/api/tenant-settings/signatories/${id}/image`, file),
  deleteSignatoryImage: (id: string) =>
    request<Signatory>(`/api/tenant-settings/signatories/${id}/image`, { method: "DELETE" }),

  getMySignature: () => request<{ signature_image_url: string | null }>("/api/tenant-settings/my-signature"),
  setMySignature: (dataUrl: string) =>
    request<{ signature_image_url: string | null }>("/api/tenant-settings/my-signature", {
      method: "PUT",
      body: JSON.stringify({ data_url: dataUrl }),
    }),
  deleteMySignature: () => request<void>("/api/tenant-settings/my-signature", { method: "DELETE" }),
};

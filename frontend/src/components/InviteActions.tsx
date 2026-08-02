import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Meeting, type Participant } from "../lib/api";
import InvitePreviewModal from "./InvitePreviewModal";

/** The prep-phase action row — replaces the generic "העבר לסטטוס" stepper
 * for draft/invited_internal specifically, since those transitions now
 * have real side effects (sending invitation emails) rather than being a
 * bare status flip. Every other transition (pending_approval -> approved
 * -> published -> archived) still goes through the plain stepper in
 * MeetingDetail.tsx.
 *
 * "✈ שלח לציבור" (api.sendPublicInvites / the invited_public status) was
 * deliberately pulled out of this flow — not needed for now. The backend
 * endpoint and status value are untouched, just not offered here; the
 * "invited_internal" checks below still also match "invited_public" so a
 * meeting that reached that status before this change (or gets there via
 * the API directly) isn't left without resend/open-meeting controls. */
export default function InviteActions({
  meeting,
  onChanged,
}: {
  meeting: Meeting;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmingOpen, setConfirmingOpen] = useState(false);
  const [alfonReminderOpen, setAlfonReminderOpen] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    api.listParticipants().then(setParticipants).catch(() => setParticipants([]));
  }, []);

  const hasInvitees = meeting.invites.length > 0;
  // The open-meeting majority is over COMMITTEE MEMBERS only — אלפון contacts
  // flagged 'חבר ועד' (edit_permission) who were invited. Other invitees /
  // public אלפון recipients don't count.
  const committeeIds = new Set(participants.filter((p) => p.edit_permission).map((p) => p.id));
  const committeeInvites = meeting.invites.filter(
    (i) => i.invitee_kind === "participant" && committeeIds.has(i.invitee_id),
  );
  const confirmedCount = committeeInvites.filter((i) => i.status === "confirmed_attend").length;
  const total = committeeInvites.length;
  // "רוב" = half or more (≥50%), so exactly half counts too.
  const majorityConfirmed = total > 0 && confirmedCount * 2 >= total;
  const isInvited = meeting.status === "invited_internal" || meeting.status === "invited_public";

  function openMeeting() {
    setConfirmingOpen(false);
    run(() => api.updateMeeting(meeting.id, { status: "active" }));
  }

  function proceedOpen() {
    // A majority confirmed (or no invitees) — open straight away; otherwise
    // ask for confirmation before opening without the committee majority.
    if (total === 0 || majorityConfirmed) openMeeting();
    else setConfirmingOpen(true);
  }

  function requestOpen() {
    // If the public אלפון invitation was never sent, remind first.
    if (isInvited && !meeting.invite_sent_public_at) {
      setAlfonReminderOpen(true);
      return;
    }
    proceedOpen();
  }

  async function run(action: () => Promise<Meeting>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6">
      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {hasInvitees && (
          <button
            onClick={() => setPreviewOpen(true)}
            className="rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-line"
          >
            👁 תצוגה מקדימה
          </button>
        )}

        {meeting.status === "draft" && (
          <button
            onClick={() => run(() => api.sendInternalInvites(meeting.id))}
            disabled={busy || !hasInvitees}
            title={hasInvitees ? undefined : "יש להוסיף מוזמנים תחילה"}
            className="rounded bg-accent-dark px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            ✈ שלח לחברי הועד לאישור הפגישה
          </button>
        )}

        {(meeting.status === "invited_internal" || meeting.status === "invited_public") && (
          <button
            onClick={() => run(() => api.sendInternalInvites(meeting.id))}
            disabled={busy || !hasInvitees}
            className="rounded bg-accent-dark px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            ✈ שלח שוב לחברי ועד
          </button>
        )}

        {isInvited && (
          <button
            onClick={() => run(() => api.distributeAlfonInvite(meeting.id))}
            disabled={busy}
            className="rounded bg-accent-dark px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            ✉ {meeting.invite_sent_public_at ? "הפץ שוב הזמנה לאלפון" : "הפץ הזמנה לאלפון"}
          </button>
        )}

        {isInvited && (
          <button
            onClick={requestOpen}
            disabled={busy}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            → פתח ישיבה
          </button>
        )}
      </div>

      {isInvited && (
        <p className="mt-2 text-xs text-ink-soft">
          אישרו הגעה: {confirmedCount} מתוך {total} חברי ועד
          {!majorityConfirmed && " · אפשר לפתוח את הישיבה גם ללא רוב אישורים"}
          {meeting.invite_sent_public_at && " · ✓ הזמנה הופצה לאלפון"}
        </p>
      )}

      {previewOpen && (
        <InvitePreviewModal
          meetingId={meeting.id}
          inviteeCount={meeting.invites.length}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {confirmingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm border border-ink bg-surface p-5 text-center">
            <h2 className="mb-2 text-base font-semibold">פתיחת הישיבה</h2>
            <p className="mb-1 text-sm">
              אישרו הגעה: <strong>{confirmedCount}</strong> מתוך <strong>{total}</strong> חברי ועד.
            </p>
            <p className="mb-4 text-sm text-ink-soft">
              לא כל חברי הועד אישרו, האם לפתוח את הפגישה בכל זאת?
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setConfirmingOpen(false)}
                disabled={busy}
                className="rounded border border-line-strong px-4 py-2 text-sm hover:bg-line disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={openMeeting}
                disabled={busy}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                פתח בכל זאת
              </button>
            </div>
          </div>
        </div>
      )}

      {alfonReminderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm border border-ink bg-surface p-5 text-center">
            <h2 className="mb-2 text-base font-semibold">הזמנה לאלפון לא נשלחה</h2>
            <p className="mb-4 text-sm text-ink-soft">
              עדיין לא הופצה הזמנה לאלפון. לשלוח עכשיו, או להמשיך ולפתוח את הישיבה בכל זאת?
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={() => setAlfonReminderOpen(false)}
                disabled={busy}
                className="rounded border border-line-strong px-4 py-2 text-sm hover:bg-line disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={async () => {
                  await run(() => api.distributeAlfonInvite(meeting.id));
                  setAlfonReminderOpen(false);
                }}
                disabled={busy}
                className="rounded bg-accent-dark px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "שולח…" : "✉ שלח הזמנה לאלפון"}
              </button>
              <button
                onClick={() => {
                  setAlfonReminderOpen(false);
                  proceedOpen();
                }}
                disabled={busy}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                פתח בכל זאת
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

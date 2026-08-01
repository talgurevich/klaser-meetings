import { useState } from "react";
import { api, apiErrorMessage, type Meeting } from "../lib/api";
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

  const hasInvitees = meeting.invites.length > 0;
  const confirmedCount = meeting.invites.filter((i) => i.status === "confirmed_attend").length;
  const total = meeting.invites.length;
  const majorityConfirmed = total > 0 && confirmedCount * 2 > total;
  const isInvited = meeting.status === "invited_internal" || meeting.status === "invited_public";
  const everyoneConfirmed = total > 0 && confirmedCount === total;

  function openMeeting() {
    setConfirmingOpen(false);
    run(() => api.updateMeeting(meeting.id, { status: "active" }));
  }

  function requestOpen() {
    // Everyone confirmed (or no invitees) — open straight away; otherwise
    // ask for confirmation showing how many have confirmed.
    if (total === 0 || everyoneConfirmed) openMeeting();
    else setConfirmingOpen(true);
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
            ✈ שלח לחברי ועד
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
          אישרו הגעה: {confirmedCount} מתוך {total} מוזמנים
          {!majorityConfirmed && " · אפשר לפתוח את הישיבה גם ללא רוב אישורים"}
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
              אישרו הגעה: <strong>{confirmedCount}</strong> מתוך <strong>{total}</strong> מוזמנים.
            </p>
            <p className="mb-4 text-sm text-ink-soft">
              עדיין לא כל המוזמנים אישרו הגעה. לפתוח את הישיבה בכל זאת?
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
    </div>
  );
}

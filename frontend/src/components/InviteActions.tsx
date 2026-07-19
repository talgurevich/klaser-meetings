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

  const hasInvitees = meeting.invites.length > 0;

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

        {(meeting.status === "invited_internal" || meeting.status === "invited_public") && (
          <button
            onClick={() => run(() => api.updateMeeting(meeting.id, { status: "active" }))}
            disabled={busy}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            → פתח ישיבה
          </button>
        )}
      </div>

      {previewOpen && (
        <InvitePreviewModal
          meetingId={meeting.id}
          inviteeCount={meeting.invites.length}
          onClose={() => setPreviewOpen(false)}
        />
      )}
    </div>
  );
}

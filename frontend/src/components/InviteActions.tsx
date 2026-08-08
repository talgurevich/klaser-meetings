import { useState } from "react";
import { api, apiErrorMessage, type Meeting } from "../lib/api";
import InvitePreviewModal from "./InvitePreviewModal";
import { ArrowCircleLeft, DsButton, DsModal, SearchIcon, SendIcon } from "./klaser-ds";

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
    <div className="mb-8">
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {hasInvitees && (
          <DsButton
            variant="secondary"
            size="compact"
            className="border"
            onClick={() => setPreviewOpen(true)}
            icon={<SearchIcon />}
          >
            תצוגה מקדימה
          </DsButton>
        )}

        {meeting.status === "draft" && (
          <DsButton
            size="compact"
            onClick={() => run(() => api.sendInternalInvites(meeting.id))}
            disabled={busy || !hasInvitees}
            title={hasInvitees ? undefined : "יש להוסיף מוזמנים תחילה"}
            icon={<SendIcon />}
          >
            שלח לחברי ועד
          </DsButton>
        )}

        {(meeting.status === "invited_internal" || meeting.status === "invited_public") && (
          <DsButton
            size="compact"
            onClick={() => run(() => api.sendInternalInvites(meeting.id))}
            disabled={busy || !hasInvitees}
            icon={<SendIcon />}
          >
            שלח שוב לחברי ועד
          </DsButton>
        )}

        {isInvited && (
          <button
            onClick={requestOpen}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-success px-4 font-rubik text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            <span>פתח ישיבה</span>
            <ArrowCircleLeft />
          </button>
        )}
      </div>

      {isInvited && (
        <p className="mt-2 font-rubik text-xs text-ink-soft">
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
        <DsModal
          size="sm"
          title="פתיחת הישיבה"
          onClose={() => setConfirmingOpen(false)}
          actions={
            <>
              <button
                onClick={openMeeting}
                disabled={busy}
                className="inline-flex h-10 items-center rounded-md bg-success px-4 font-rubik text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
              >
                פתח בכל זאת
              </button>
              <DsButton
                variant="ghost"
                size="compact"
                onClick={() => setConfirmingOpen(false)}
                disabled={busy}
              >
                ביטול
              </DsButton>
            </>
          }
        >
          <p className="mb-1 text-sm">
            אישרו הגעה: <strong>{confirmedCount}</strong> מתוך <strong>{total}</strong> מוזמנים.
          </p>
          <p className="text-sm text-ink-soft">
            עדיין לא כל המוזמנים אישרו הגעה. לפתוח את הישיבה בכל זאת?
          </p>
        </DsModal>
      )}
    </div>
  );
}

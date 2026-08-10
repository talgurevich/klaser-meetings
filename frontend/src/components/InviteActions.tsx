import { useEffect, useState } from "react";
import {
  api,
  apiErrorMessage,
  type InvalidRecipient,
  type Meeting,
  type Participant,
  type TenantSettings,
} from "../lib/api";
import InvitePreviewModal from "./InvitePreviewModal";
import InvalidEmailsModal from "./InvalidEmailsModal";
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
  const [alfonReminderOpen, setAlfonReminderOpen] = useState(false);
  const [alfonMajorityOpen, setAlfonMajorityOpen] = useState(false);
  const [invalidEmails, setInvalidEmails] = useState<InvalidRecipient[] | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [settings, setSettings] = useState<TenantSettings | null>(null);

  useEffect(() => {
    api.listParticipants().then(setParticipants).catch(() => setParticipants([]));
    api.getTenantSettings().then(setSettings).catch(() => setSettings(null));
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
  const isAssembly = meeting.kind === "assembly";
  const kindNoun = isAssembly ? "האסיפה" : "הפגישה";
  const approvedVerb = isAssembly ? "אישרו את האסיפה" : "אישרו הגעה";
  // Per-kind setting: does distributing the public אלפון invitation wait for a
  // committee majority to approve first? (see TenantSettings / the Settings page)
  const requireApprovalBeforeInvite = settings
    ? isAssembly
      ? settings.assembly_require_approval_before_invite
      : settings.meeting_require_approval_before_invite
    : false;

  function openMeeting() {
    setConfirmingOpen(false);
    run(() => api.updateMeeting(meeting.id, { status: "active" }));
  }

  // Run a send action that reports back any invalid-email recipients, and
  // surface them to the organiser.
  async function runSend(action: () => Promise<{ invalid_recipients: InvalidRecipient[] }>) {
    setBusy(true);
    setError(null);
    try {
      const res = await action();
      onChanged();
      if (res.invalid_recipients.length > 0) setInvalidEmails(res.invalid_recipients);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function sendInternal() {
    return runSend(() => api.sendInternalInvites(meeting.id));
  }

  function distributeAlfon() {
    setAlfonMajorityOpen(false);
    return runSend(() => api.distributeAlfonInvite(meeting.id));
  }

  function requestDistributeAlfon() {
    // When the tenant requires committee approval before the public invite,
    // warn if the majority hasn't approved yet — the organiser can still
    // proceed. Otherwise distribute straight away.
    if (requireApprovalBeforeInvite && total > 0 && !majorityConfirmed) {
      setAlfonMajorityOpen(true);
      return;
    }
    distributeAlfon();
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
            onClick={sendInternal}
            disabled={busy || !hasInvitees}
            title={hasInvitees ? undefined : "יש להוסיף מוזמנים תחילה"}
            icon={<SendIcon />}
          >
            שלח לחברי הועד לאישור {meeting.kind === "assembly" ? "האסיפה" : "הפגישה"}
          </DsButton>
        )}

        {(meeting.status === "invited_internal" || meeting.status === "invited_public") && (
          <DsButton
            size="compact"
            onClick={sendInternal}
            disabled={busy || !hasInvitees}
            icon={<SendIcon />}
          >
            שלח שוב לחברי ועד
          </DsButton>
        )}

        {isInvited && (
          <DsButton
            size="compact"
            onClick={requestDistributeAlfon}
            disabled={busy}
            icon={<SendIcon />}
          >
            {meeting.invite_sent_public_at ? "הפץ שוב הזמנה לאלפון" : "הפץ הזמנה לאלפון"}
          </DsButton>
        )}

        {isInvited && (
          <button
            onClick={requestOpen}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-success px-4 font-rubik text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
          >
            <span>פתח {isAssembly ? "אסיפה" : "ישיבה"}</span>
            <ArrowCircleLeft />
          </button>
        )}
      </div>

      {isInvited && (
        <p className="mt-2 font-rubik text-xs text-ink-soft">
          {approvedVerb}: {confirmedCount} מתוך {total} חברי ועד
          {!majorityConfirmed && ` · אפשר לפתוח את ${kindNoun} גם ללא רוב אישורים`}
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
        <DsModal
          size="sm"
          title={`פתיחת ${isAssembly ? "האסיפה" : "הישיבה"}`}
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

      {alfonReminderOpen && (
        <DsModal
          size="sm"
          title="הזמנה לאלפון לא נשלחה"
          onClose={() => setAlfonReminderOpen(false)}
          actions={
            <>
              <button
                onClick={async () => {
                  setAlfonReminderOpen(false);
                  await distributeAlfon();
                }}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-turquoise px-4 font-rubik text-sm font-bold text-white transition hover:bg-turquoise-dark disabled:opacity-50"
              >
                <span>{busy ? "שולח…" : "שלח הזמנה לאלפון"}</span>
                <SendIcon />
              </button>
              <button
                onClick={() => {
                  setAlfonReminderOpen(false);
                  proceedOpen();
                }}
                disabled={busy}
                className="inline-flex h-10 items-center rounded-md bg-success px-4 font-rubik text-sm font-bold text-white transition hover:brightness-95 disabled:opacity-50"
              >
                פתח בכל זאת
              </button>
              <DsButton
                variant="ghost"
                size="compact"
                onClick={() => setAlfonReminderOpen(false)}
                disabled={busy}
              >
                ביטול
              </DsButton>
            </>
          }
        >
          <p className="text-sm text-ink-soft">
            עדיין לא הופצה הזמנה לאלפון. לשלוח עכשיו, או להמשיך ולפתוח את {kindNoun} בכל זאת?
          </p>
        </DsModal>
      )}

      {alfonMajorityOpen && (
        <DsModal
          size="sm"
          title="הפצה לאלפון"
          onClose={() => setAlfonMajorityOpen(false)}
          actions={
            <>
              <button
                onClick={distributeAlfon}
                disabled={busy}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-turquoise px-4 font-rubik text-sm font-bold text-white transition hover:bg-turquoise-dark disabled:opacity-50"
              >
                <span>{busy ? "שולח…" : "הפץ בכל זאת"}</span>
                <SendIcon />
              </button>
              <DsButton
                variant="ghost"
                size="compact"
                onClick={() => setAlfonMajorityOpen(false)}
                disabled={busy}
              >
                ביטול
              </DsButton>
            </>
          }
        >
          <p className="mb-1 text-sm">
            {approvedVerb}: <strong>{confirmedCount}</strong> מתוך <strong>{total}</strong> חברי ועד.
          </p>
          <p className="text-sm text-ink-soft">
            לא כל חברי הועד אישרו את {kindNoun}. האם להפיץ הזמנה לאלפון בכל זאת?
          </p>
        </DsModal>
      )}

      {invalidEmails && (
        <InvalidEmailsModal recipients={invalidEmails} onClose={() => setInvalidEmails(null)} />
      )}
    </div>
  );
}

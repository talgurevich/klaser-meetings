import { useEffect, useState, type ReactNode } from "react";
import { api, apiErrorMessage, type Member, type MeetingInvite, type Participant } from "../lib/api";
import {
  Chip,
  CloseIcon,
  DsButton,
  DsCard,
  DsCheckbox,
  DsTag,
  SectionHeader,
  StatusPill,
  type StatusVariant,
} from "./klaser-ds";

const RSVP_LABELS: Record<MeetingInvite["status"], string> = {
  pending: "ממתין",
  confirmed_attend: "מאשר/ת ומגיע/ה",
  confirmed_absent: "מאשר/ת קבלה ולא מגיע/ה",
};

const RSVP_VARIANTS: Record<MeetingInvite["status"], StatusVariant> = {
  pending: "neutral",
  confirmed_attend: "success",
  confirmed_absent: "warning",
};

/** "מוזמנים" + "אישורי השתתפות" — who's invited to this meeting (from
 * either the member roster or the Participants directory, two different
 * id-spaces, see backend/app/models.py's MeetingInvite docstring) and
 * their RSVP status. Adding/removing invitees is editor-only, mirroring
 * the backend's gating (this is the organizer's job, not a member
 * action — contrast with the Participant-attach checkboxes elsewhere,
 * which are deliberately open to everyone). */
export default function InviteesPanel({
  meetingId,
  invites,
  editable,
  showRsvp,
  actions,
  onChanged,
}: {
  meetingId: string;
  invites: MeetingInvite[];
  editable: boolean;
  // RSVP-status block appears only once invites have actually been sent
  // (after "שלח לחברי ועד") — there's nothing to confirm before that.
  showRsvp: boolean;
  // Rendered between the invitees list and the RSVP block (the send/preview
  // actions live here).
  actions?: ReactNode;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The picker is always visible when editable — no "+ הוסף מוזמנים"
  // toggle to click through first — so fetch the candidate lists as soon
  // as that's true, not gated behind a picker-open flag anymore.
  useEffect(() => {
    if (!editable) return;
    api.listMembers().then(setMembers).catch(() => setMembers([]));
    api.listParticipants().then(setParticipants).catch(() => setParticipants([]));
  }, [editable]);

  const invitedMemberIds = new Set(invites.filter((i) => i.invitee_kind === "member").map((i) => i.invitee_id));
  const invitedParticipantIds = new Set(
    invites.filter((i) => i.invitee_kind === "participant").map((i) => i.invitee_id)
  );
  const availableMembers = (members || []).filter((m) => !invitedMemberIds.has(m.id));
  const availableParticipants = (participants || []).filter((p) => !invitedParticipantIds.has(p.id));

  function toggleSelected(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function addSelected() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      const invitees = Array.from(selected).map((key) => {
        const [kind, id] = key.split(":") as ["member" | "participant", string];
        return { kind, id };
      });
      await api.addInvites(meetingId, invitees);
      setSelected(new Set());
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeInvite(inviteId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.removeInvite(meetingId, inviteId);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const confirmedCount = invites.filter((i) => i.status === "confirmed_attend").length;

  return (
    <DsCard interactive={false} className="mb-4 p-4">
      <SectionHeader>מוזמנים ({invites.length})</SectionHeader>

      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      {editable && (
        <div className="mb-4 rounded-md border border-line p-4">
          <p className="mb-2 font-rubik text-xs font-medium text-turquoise">הוסף מוזמנים</p>
          {!members || !participants ? (
            <p className="text-sm text-ink-soft">טוען…</p>
          ) : availableMembers.length === 0 && availableParticipants.length === 0 ? (
            <p className="text-sm text-ink-soft">כל החברים והמשתתפים כבר מוזמנים.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {availableMembers.map((m) => {
                const key = `member:${m.id}`;
                const label = m.display_name || m.email;
                return (
                  <div
                    key={key}
                    onClick={() => toggleSelected(key)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition hover:bg-turquoise/5"
                  >
                    <DsCheckbox
                      checked={selected.has(key)}
                      onChange={() => toggleSelected(key)}
                      ariaLabel={label}
                    />
                    <span>{label}</span>
                  </div>
                );
              })}
              {availableParticipants.map((p) => {
                const key = `participant:${p.id}`;
                return (
                  <div
                    key={key}
                    onClick={() => toggleSelected(key)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm transition hover:bg-turquoise/5"
                  >
                    <DsCheckbox
                      checked={selected.has(key)}
                      onChange={() => toggleSelected(key)}
                      ariaLabel={p.full_name}
                    />
                    <span className="flex items-center gap-2">
                      <span>{p.full_name}</span>
                      <DsTag>משתתף/ת</DsTag>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <DsButton size="micro" onClick={addSelected} disabled={busy || selected.size === 0}>
              הוסף ({selected.size})
            </DsButton>
            {selected.size > 0 && (
              <DsButton
                variant="ghost"
                size="micro"
                onClick={() => setSelected(new Set())}
                disabled={busy}
              >
                נקה בחירה
              </DsButton>
            )}
          </div>
        </div>
      )}

      {invites.length === 0 ? (
        <p className="text-sm text-ink-soft">אין עדיין מוזמנים.</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {invites.map((inv) =>
            editable ? (
              <Chip
                key={inv.id}
                onClick={() => removeInvite(inv.id)}
                disabled={busy}
                title="הסר מוזמן"
              >
                <span>{inv.display_name || inv.email}</span>
                <CloseIcon />
              </Chip>
            ) : (
              <DsTag key={inv.id}>{inv.display_name || inv.email}</DsTag>
            )
          )}
        </div>
      )}

      {actions}

      {showRsvp && invites.length > 0 && (
        <div className="rounded-md border border-line p-4">
          <p className="mb-2 text-sm font-medium">
            אישורי השתתפות: {confirmedCount} מאשרים מתוך {invites.length} מוזמנים
          </p>
          <div className="flex flex-col gap-1">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-4 text-sm">
                <span>{inv.display_name || inv.email}</span>
                <StatusPill variant={RSVP_VARIANTS[inv.status]}>
                  {RSVP_LABELS[inv.status]}
                </StatusPill>
              </div>
            ))}
          </div>
        </div>
      )}
    </DsCard>
  );
}

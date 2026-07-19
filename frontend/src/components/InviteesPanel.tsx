import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Member, type MeetingInvite, type Participant } from "../lib/api";

const RSVP_LABELS: Record<MeetingInvite["status"], string> = {
  pending: "ממתין",
  confirmed_attend: "מאשר/ת ומגיע/ה",
  confirmed_absent: "מאשר/ת קבלה ולא מגיע/ה",
};

const RSVP_COLORS: Record<MeetingInvite["status"], string> = {
  pending: "text-ink-soft",
  confirmed_attend: "text-emerald-700",
  confirmed_absent: "text-amber-700",
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
  onChanged,
}: {
  meetingId: string;
  invites: MeetingInvite[];
  editable: boolean;
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
    <div className="mb-4 rounded border border-line bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink-soft">מוזמנים ({invites.length})</h3>

      {error && <p className="mb-2 text-xs text-red-700">{error}</p>}

      {editable && (
        <div className="mb-3 rounded border border-line bg-surface p-3">
          <p className="mb-2 text-xs font-medium text-ink-soft">הוסף מוזמנים</p>
          {!members || !participants ? (
            <p className="text-sm text-ink-soft">טוען…</p>
          ) : availableMembers.length === 0 && availableParticipants.length === 0 ? (
            <p className="text-sm text-ink-soft">כל החברים והמשתתפים כבר מוזמנים.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {availableMembers.map((m) => {
                const key = `member:${m.id}`;
                return (
                  <label key={key} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-line">
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleSelected(key)}
                      className="rounded"
                    />
                    <span>{m.display_name || m.email}</span>
                  </label>
                );
              })}
              {availableParticipants.map((p) => {
                const key = `participant:${p.id}`;
                return (
                  <label key={key} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-line">
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleSelected(key)}
                      className="rounded"
                    />
                    <span>
                      {p.full_name}
                      <span className="mr-1 rounded bg-line px-1 py-0.5 text-[10px] text-ink-soft">משתתף/ת</span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              onClick={addSelected}
              disabled={busy || selected.size === 0}
              className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-dark disabled:opacity-50"
            >
              הוסף ({selected.size})
            </button>
            {selected.size > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                disabled={busy}
                className="text-xs text-ink-soft hover:underline"
              >
                נקה בחירה
              </button>
            )}
          </div>
        </div>
      )}

      {invites.length === 0 ? (
        <p className="text-sm text-ink-soft">אין עדיין מוזמנים.</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          {invites.map((inv) => (
            <span
              key={inv.id}
              className="flex items-center gap-1 rounded-full bg-line px-2 py-1 text-xs text-ink"
            >
              {editable && (
                <button
                  onClick={() => removeInvite(inv.id)}
                  disabled={busy}
                  className="text-ink-soft hover:text-red-700"
                  aria-label="הסר מוזמן"
                >
                  ✕
                </button>
              )}
              {inv.display_name || inv.email}
            </span>
          ))}
        </div>
      )}

      {invites.length > 0 && (
        <div className="rounded border border-line bg-surface p-3">
          <p className="mb-2 text-sm font-medium">
            אישורי השתתפות: {confirmedCount} מאשרים מתוך {invites.length} מוזמנים
          </p>
          <div className="space-y-1">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between text-xs">
                <span>{inv.display_name || inv.email}</span>
                <span className={RSVP_COLORS[inv.status]}>{RSVP_LABELS[inv.status]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

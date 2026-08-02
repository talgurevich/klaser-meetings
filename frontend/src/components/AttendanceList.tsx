import { useEffect, useState } from "react";
import { api, apiErrorMessage, type MeetingInvite, type Participant } from "../lib/api";

const NAME_MAX_LENGTH = 16;

function truncateName(name: string): string {
  return name.length > NAME_MAX_LENGTH ? `${name.slice(0, NAME_MAX_LENGTH)}…` : name;
}

/** Meeting attendance. "מוזמנים לפגישה" lists only the committee members
 * actually invited to THIS meeting (from meeting.invites), each with a
 * present checkbox. "נוכחים מהאלפון" lists the אלפון contacts attached to
 * the meeting, with a picker to add more from the directory (or create a
 * brand-new contact). */
export default function AttendanceList({
  meetingId,
  invites,
  presentIds,
  editable,
  participantIds,
  participantsEditable,
  collapsible = false,
  onChanged,
}: {
  meetingId: string;
  invites: MeetingInvite[];
  presentIds: string[];
  editable: boolean;
  participantIds: string[];
  participantsEditable: boolean;
  collapsible?: boolean;
  onChanged: () => void;
}) {
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // When collapsible (live meeting), the whole body hides behind the header
  // bar and starts collapsed; otherwise it's always shown.
  const [open, setOpen] = useState(false);

  const [addingOpen, setAddingOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  function loadParticipants() {
    api
      .listParticipants()
      .then(setParticipants)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(() => {
    loadParticipants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(memberId: string, present: boolean) {
    setBusyId(memberId);
    setError(null);
    try {
      if (present) await api.markAttendeeAbsent(meetingId, memberId);
      else await api.markAttendeePresent(meetingId, memberId);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function toggleParticipant(participantId: string, attached: boolean) {
    setBusyId(participantId);
    setError(null);
    try {
      if (attached) await api.removeParticipantFromMeeting(meetingId, participantId);
      else await api.addParticipantToMeeting(meetingId, participantId);
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function createAndAttach(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setAddBusy(true);
    setError(null);
    try {
      const participant = await api.createParticipant({
        full_name: newName.trim(),
        phone: newPhone.trim() || null,
        email: newEmail.trim() || null,
      });
      await api.addParticipantToMeeting(meetingId, participant.id);
      setNewName("");
      setNewPhone("");
      setNewEmail("");
      setAddingOpen(false);
      loadParticipants();
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setAddBusy(false);
    }
  }

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!participants) return <p className="text-sm text-ink-soft">טוען נוכחות…</p>;

  const presentSet = new Set(presentIds);
  const attachedSet = new Set(participantIds);
  const invitedParticipantIds = new Set(
    invites.filter((i) => i.invitee_kind === "participant").map((i) => i.invitee_id),
  );

  type Cell = { id: string; name: string; checked: boolean; onToggle: () => void; rowEditable: boolean };

  // "מוזמנים לפגישה" = every invitee. Present-marking differs by kind:
  // committee/אלפון invitees are participant-kind (present ⇔ attached), and
  // legacy member invitees use attendees_present.
  const isInvitePresent = (i: MeetingInvite) =>
    i.invitee_kind === "member" ? presentSet.has(i.invitee_id) : attachedSet.has(i.invitee_id);

  const committeeCells: Cell[] = invites.map((i) => {
    const present = isInvitePresent(i);
    return {
      id: i.invitee_id,
      name: i.display_name || i.email,
      checked: present,
      rowEditable: editable,
      onToggle: () =>
        i.invitee_kind === "member"
          ? toggle(i.invitee_id, present)
          : toggleParticipant(i.invitee_id, present),
    };
  });
  const committeePresent = invites.filter(isInvitePresent).length;

  // "נוכחים מהאלפון" = attached אלפון contacts who were NOT invitees (added
  // ad-hoc during the meeting); the picker offers everyone else.
  const attachedExtra = participants.filter(
    (p) => attachedSet.has(p.id) && !invitedParticipantIds.has(p.id),
  );
  const unattached = participants.filter(
    (p) => !attachedSet.has(p.id) && !invitedParticipantIds.has(p.id),
  );

  const totalPresent = committeePresent + attachedExtra.length;
  const totalCount = invites.length + attachedExtra.length;

  const externalCells: Cell[] = attachedExtra.map((p) => ({
    id: p.id,
    name: p.full_name,
    checked: true,
    rowEditable: participantsEditable,
    onToggle: () => toggleParticipant(p.id, true),
  }));

  function grid(cells: Cell[]) {
    if (cells.length === 0) return <p className="mb-2 text-sm text-ink-soft">—</p>;
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {cells.map((c) => (
          <label
            key={c.id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              c.checked ? "border-accent bg-accent/5" : "border-line"
            } ${c.rowEditable ? "cursor-pointer hover:bg-surface" : ""}`}
          >
            <input
              type="checkbox"
              checked={c.checked}
              disabled={!c.rowEditable || busyId === c.id}
              onChange={c.onToggle}
              className="shrink-0 rounded"
            />
            <span title={c.name} className={`min-w-0 truncate ${c.checked ? "text-ink" : "text-ink-soft"}`}>
              {truncateName(c.name)}
            </span>
          </label>
        ))}
      </div>
    );
  }

  const showBody = !collapsible || open;

  return (
    <div className="rounded border border-line bg-surface p-4">
      {collapsible ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-semibold text-ink-soft"
        >
          <span className="flex items-center gap-1.5">
            <span aria-hidden>👥</span> נוכחות: {totalPresent}/{totalCount}
          </span>
          <span className="text-xs font-normal">{open ? "▾ הסתר" : "▸ הצג"}</span>
        </button>
      ) : (
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
          <span aria-hidden>👥</span> נוכחות: {totalPresent}/{totalCount}
        </h3>
      )}

      {showBody && (
        <>
          <p className="mb-2 mt-3 text-xs font-semibold text-ink-soft">
            מוזמנים לפגישה ({committeePresent}/{invites.length})
          </p>
          {grid(committeeCells)}

          <p className="mb-2 mt-4 text-xs font-semibold text-ink-soft">
            נוכחים מהאלפון ({attachedExtra.length})
          </p>
          {grid(externalCells)}
        </>
      )}

      {showBody && participantsEditable && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <select
            value=""
            disabled={unattached.length === 0}
            onChange={(e) => {
              if (e.target.value) toggleParticipant(e.target.value, false);
            }}
            className="rounded border border-line-strong px-2 py-1 text-sm disabled:opacity-50"
          >
            <option value="">
              {unattached.length === 0 ? "כל האלפון כבר נוסף" : "+ הוסף מהאלפון…"}
            </option>
            {unattached.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>

          {!addingOpen && (
            <button onClick={() => setAddingOpen(true)} className="text-xs text-accent-dark hover:underline">
              + איש קשר חדש
            </button>
          )}
        </div>
      )}

      {showBody && participantsEditable && addingOpen && (
        <form onSubmit={createAndAttach} className="mt-2 flex flex-wrap items-end gap-2">
          <input
            type="text"
            placeholder="שם מלא"
            required
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="rounded border border-line-strong px-2 py-1 text-sm"
          />
          <input
            type="tel"
            placeholder="טלפון (אופציונלי)"
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            className="rounded border border-line-strong px-2 py-1 text-sm"
            dir="ltr"
          />
          <input
            type="email"
            placeholder="אימייל (אופציונלי)"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="rounded border border-line-strong px-2 py-1 text-sm"
            dir="ltr"
          />
          <button
            type="submit"
            disabled={addBusy || !newName.trim()}
            className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            הוסף וצרף
          </button>
          <button
            type="button"
            onClick={() => setAddingOpen(false)}
            disabled={addBusy}
            className="text-xs text-ink-soft hover:underline"
          >
            ביטול
          </button>
        </form>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Member, type Participant } from "../lib/api";

const NAME_MAX_LENGTH = 16;

function truncateName(name: string): string {
  return name.length > NAME_MAX_LENGTH ? `${name.slice(0, NAME_MAX_LENGTH)}…` : name;
}

export default function AttendanceList({
  meetingId,
  presentIds,
  editable,
  participantIds,
  participantsEditable,
  onChanged,
}: {
  meetingId: string;
  presentIds: string[];
  editable: boolean;
  participantIds: string[];
  participantsEditable: boolean;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    api
      .listMembers()
      .then(setMembers)
      .catch((err) => setError(apiErrorMessage(err)));
    loadParticipants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(memberId: string, present: boolean) {
    setBusyId(memberId);
    setError(null);
    try {
      if (present) {
        await api.markAttendeeAbsent(meetingId, memberId);
      } else {
        await api.markAttendeePresent(meetingId, memberId);
      }
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
      if (attached) {
        await api.removeParticipantFromMeeting(meetingId, participantId);
      } else {
        await api.addParticipantToMeeting(meetingId, participantId);
      }
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

  if (error) {
    return <p className="text-sm text-red-700">{error}</p>;
  }
  if (!members || !participants) {
    return <p className="text-sm text-ink-soft">טוען נוכחות…</p>;
  }

  const presentSet = new Set(presentIds);
  const attachedSet = new Set(participantIds);

  // Members and directory Participants are two different id-spaces, but for
  // the purposes of the attendance grid they're just "people who might be
  // here" — merged into one list so the header count and chip grid match
  // the single "נוכחות: X/Y" the active-meeting screen shows.
  type Row = { key: string; id: string; name: string; checked: boolean; rowEditable: boolean; onToggle: () => void };

  const memberRows: Row[] = members.map((m) => {
    const present = presentSet.has(m.id);
    return {
      key: `m:${m.id}`,
      id: m.id,
      name: m.display_name || m.email,
      checked: present,
      rowEditable: editable,
      onToggle: () => toggle(m.id, present),
    };
  });

  const participantRows: Row[] = participants.map((p) => {
    const attached = attachedSet.has(p.id);
    return {
      key: `p:${p.id}`,
      id: p.id,
      name: p.full_name,
      checked: attached,
      rowEditable: participantsEditable,
      onToggle: () => toggleParticipant(p.id, attached),
    };
  });

  const allRows = [...memberRows, ...participantRows];
  const totalChecked = presentIds.length + participantIds.length;
  const totalCount = members.length + participants.length;

  return (
    <div className="rounded border border-line bg-white p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
        <span aria-hidden>👥</span> נוכחות: {totalChecked}/{totalCount}
      </h3>

      {allRows.length === 0 ? (
        <p className="mb-2 text-sm text-ink-soft">אין עדיין אנשים לסימון נוכחות.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {allRows.map((row) => (
            <label
              key={row.key}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                row.checked ? "border-accent bg-accent/5" : "border-line"
              } ${row.rowEditable ? "cursor-pointer hover:bg-surface" : ""}`}
            >
              <input
                type="checkbox"
                checked={row.checked}
                disabled={!row.rowEditable || busyId === row.id}
                onChange={row.onToggle}
                className="shrink-0 rounded"
              />
              <span
                title={row.name}
                className={`min-w-0 truncate ${row.checked ? "text-ink" : "text-ink-soft"}`}
              >
                {truncateName(row.name)}
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="mt-4 border-t border-line pt-3">
        {participantsEditable && !addingOpen && (
          <button
            onClick={() => setAddingOpen(true)}
            className="mt-2 text-xs text-accent-dark hover:underline"
          >
            + הוסף משתתף/ת חדש/ה
          </button>
        )}

        {participantsEditable && addingOpen && (
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
    </div>
  );
}

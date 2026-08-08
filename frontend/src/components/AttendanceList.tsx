import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Member, type Participant } from "../lib/api";
import {
  DsButton,
  DsCard,
  DsCheckbox,
  DsInput,
  PlusIcon,
  SectionHeader,
} from "./klaser-ds";

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
    return <p className="text-sm text-danger">{error}</p>;
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

  const totalChecked = presentIds.length + participantIds.length;
  const totalCount = members.length + participants.length;

  function grid(rows: Row[]) {
    if (rows.length === 0) {
      return <p className="mb-2 text-sm text-ink-soft">—</p>;
    }
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {rows.map((row) => (
          <div
            key={row.key}
            onClick={() => {
              if (row.rowEditable && busyId !== row.id) row.onToggle();
            }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
              row.checked ? "border-turquoise bg-turquoise/5" : "border-line"
            } ${row.rowEditable ? "cursor-pointer hover:bg-turquoise/5" : ""}`}
          >
            <DsCheckbox
              checked={row.checked}
              disabled={!row.rowEditable || busyId === row.id}
              onChange={row.onToggle}
              ariaLabel={row.name}
            />
            <span
              title={row.name}
              className={`min-w-0 truncate ${row.checked ? "text-ink" : "text-ink-soft"}`}
            >
              {truncateName(row.name)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DsCard interactive={false} className="p-4">
      <SectionHeader>
        נוכחות: {totalChecked}/{totalCount}
      </SectionHeader>

      <p className="mb-2 font-rubik text-xs font-medium text-turquoise">
        מוזמנים לפגישה ({presentIds.length}/{members.length})
      </p>
      {grid(memberRows)}

      <p className="mb-2 mt-4 font-rubik text-xs font-medium text-turquoise">
        מוזמנים חיצוניים ({participantIds.length}/{participants.length})
      </p>
      {grid(participantRows)}

      <div className="mt-4 border-t border-line pt-4">
        {participantsEditable && !addingOpen && (
          <button
            onClick={() => setAddingOpen(true)}
            className="inline-flex items-center gap-1.5 font-rubik text-sm font-medium text-turquoise transition hover:text-turquoise-dark"
          >
            <span>הוסף משתתף/ת חדש/ה</span>
            <PlusIcon />
          </button>
        )}

        {participantsEditable && addingOpen && (
          <form onSubmit={createAndAttach} className="flex flex-wrap items-end gap-2">
            <div className="w-44">
              <DsInput placeholder="שם מלא" required value={newName} onChange={setNewName} />
            </div>
            <div className="w-44">
              <DsInput
                type="tel"
                placeholder="טלפון (אופציונלי)"
                value={newPhone}
                onChange={setNewPhone}
                dir="ltr"
              />
            </div>
            <div className="w-52">
              <DsInput
                type="email"
                placeholder="אימייל (אופציונלי)"
                value={newEmail}
                onChange={setNewEmail}
                dir="ltr"
              />
            </div>
            <DsButton type="submit" size="compact" disabled={addBusy || !newName.trim()}>
              הוסף וצרף
            </DsButton>
            <DsButton
              variant="ghost"
              size="compact"
              onClick={() => setAddingOpen(false)}
              disabled={addBusy}
            >
              ביטול
            </DsButton>
          </form>
        )}
      </div>
    </DsCard>
  );
}

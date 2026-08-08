import { useEffect, useState } from "react";
import { api, apiErrorMessage, type MeetingInvite, type Participant } from "../lib/api";
import {
  DsButton,
  DsCard,
  DsCheckbox,
  DsInput,
  DsSelect,
  PlusIcon,
} from "./klaser-ds";

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

  if (error) return <p className="text-sm text-danger">{error}</p>;
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
          <div
            key={c.id}
            onClick={() => {
              if (c.rowEditable && busyId !== c.id) c.onToggle();
            }}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
              c.checked ? "border-turquoise bg-turquoise/5" : "border-line"
            } ${c.rowEditable ? "cursor-pointer hover:bg-turquoise/5" : ""}`}
          >
            <DsCheckbox
              checked={c.checked}
              disabled={!c.rowEditable || busyId === c.id}
              onChange={c.onToggle}
              ariaLabel={c.name}
            />
            <span title={c.name} className={`min-w-0 truncate ${c.checked ? "text-ink" : "text-ink-soft"}`}>
              {truncateName(c.name)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  const showBody = !collapsible || open;

  return (
<DsCard interactive={false} className="p-4">
      {collapsible ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between font-rubik text-base font-bold tracking-[0.15em] text-turquoise"
        >
          <span>
            נוכחות: {totalPresent}/{totalCount}
          </span>
          <span className="font-rubik text-xs font-normal text-ink-soft">
            {open ? "▾ הסתר" : "▸ הצג"}
          </span>
        </button>
      ) : (
        <h3 className="flex items-center gap-3 font-rubik text-base font-bold tracking-[0.15em] text-turquoise">
          <span>
            נוכחות: {totalPresent}/{totalCount}
          </span>
          <span className="h-px flex-1 bg-line" />
        </h3>
      )}

      {showBody && (
        <>
          <p className="mb-2 mt-4 font-rubik text-xs font-medium text-turquoise">
            מוזמנים לפגישה ({committeePresent}/{invites.length})
          </p>
          {grid(committeeCells)}

          <p className="mb-2 mt-4 font-rubik text-xs font-medium text-turquoise">
            נוכחים מהאלפון ({attachedExtra.length})
          </p>
          {grid(externalCells)}
        </>
      )}

      {showBody && participantsEditable && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <div className="w-56">
            <DsSelect
              value=""
              disabled={unattached.length === 0}
              onChange={(v) => {
                if (v) toggleParticipant(v, false);
              }}
            >
              <option value="">
                {unattached.length === 0 ? "כל האלפון כבר נוסף" : "+ הוסף מהאלפון…"}
              </option>
              {unattached.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </DsSelect>
          </div>

          {!addingOpen && (
            <button
              onClick={() => setAddingOpen(true)}
              className="inline-flex items-center gap-1.5 font-rubik text-sm font-medium text-turquoise transition hover:text-turquoise-dark"
            >
              <span>איש קשר חדש</span>
              <PlusIcon />
            </button>
          )}
        </div>
      )}

      {showBody && participantsEditable && addingOpen && (
        <form onSubmit={createAndAttach} className="mt-2 flex flex-wrap items-end gap-2">
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
    </DsCard>
  );
}

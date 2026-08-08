import { useEffect, useMemo, useState } from "react";
import { api, type Member, type Participant } from "../lib/api";
import { Chip, DsSelect } from "./klaser-ds";

/** Shared "אחראי" (responsible person) picker for follow-up tasks. Offers
 * the meeting's attendees as quick picks first, with a collapsed dropdown
 * to take any name from the אלפון. Value is a plain name string. */
export default function OwnerPicker({
  value,
  onChange,
  presentMemberIds,
  presentParticipantIds,
}: {
  value: string;
  onChange: (owner: string) => void;
  presentMemberIds: string[];
  presentParticipantIds: string[];
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [dirOpen, setDirOpen] = useState(false);

  useEffect(() => {
    api.listMembers().then(setMembers).catch(() => {});
    api.listParticipants().then(setParticipants).catch(() => {});
  }, []);

  // "מי שהיה בפגישה" — present committee members + attached participants.
  const attendees = useMemo(() => {
    const mIds = new Set(presentMemberIds);
    const pIds = new Set(presentParticipantIds);
    const names = [
      ...members.filter((m) => mIds.has(m.id)).map((m) => m.display_name || m.email),
      ...participants.filter((p) => pIds.has(p.id)).map((p) => p.full_name),
    ];
    return [...new Set(names.filter(Boolean))];
  }, [members, participants, presentMemberIds, presentParticipantIds]);

  const directory = useMemo(
    () =>
      [...new Set(participants.map((p) => p.full_name).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "he"),
      ),
    [participants],
  );

  return (
    <div className="text-sm">
      <div className="mb-2 flex items-baseline gap-2 font-rubik text-xs font-medium text-turquoise">
        <span>אחראי</span>
        {value && <span className="font-normal text-ink-soft">· {value}</span>}
      </div>
      {attendees.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attendees.map((name) => {
            const on = value === name;
            return (
              <Chip
                key={name}
                variant={on ? "active" : "grey"}
                onClick={() => onChange(on ? "" : name)}
              >
                {name}
              </Chip>
            );
          })}
        </div>
      ) : (
        <p className="font-rubik text-xs text-ink-soft">
          אין נוכחים מסומנים — אפשר לבחור מהאלפון.
        </p>
      )}

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setDirOpen((o) => !o)}
          className="font-rubik text-xs font-medium text-turquoise transition hover:text-turquoise-dark"
        >
          {dirOpen ? "▾" : "▸"} בחר מהאלפון
        </button>
        {dirOpen && (
          <div className="mt-2">
            <DsSelect
              value={directory.includes(value) ? value : ""}
              onChange={onChange}
            >
              <option value="">— בחר איש קשר —</option>
              {directory.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </DsSelect>
          </div>
        )}
      </div>
    </div>
  );
}

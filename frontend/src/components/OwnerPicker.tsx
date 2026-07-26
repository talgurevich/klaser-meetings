import { useEffect, useMemo, useState } from "react";
import { api, type Member, type Participant } from "../lib/api";

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
      <span className="mb-1 block font-medium text-ink-soft">
        אחראי{value && <span className="text-ink"> · {value}</span>}
      </span>
      {attendees.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {attendees.map((name) => {
            const on = value === name;
            return (
              <button
                type="button"
                key={name}
                onClick={() => onChange(on ? "" : name)}
                className={`rounded-full px-3 py-1 text-xs ${
                  on ? "bg-accent-dark text-white" : "border border-line-strong text-ink hover:bg-line"
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-ink-soft">אין נוכחים מסומנים — אפשר לבחור מהאלפון.</p>
      )}

      <div className="mt-2">
        <button
          type="button"
          onClick={() => setDirOpen((o) => !o)}
          className="text-xs text-accent-dark hover:underline"
        >
          {dirOpen ? "▾" : "▸"} בחר מהאלפון
        </button>
        {dirOpen && (
          <select
            value={directory.includes(value) ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            className="mt-2 w-full rounded border border-line-strong px-3 py-2 text-sm"
          >
            <option value="">— בחר איש קשר —</option>
            {directory.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

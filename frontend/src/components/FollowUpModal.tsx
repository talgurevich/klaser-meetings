import { useEffect, useMemo, useState } from "react";
import { api, type Member, type Participant } from "../lib/api";

/** Lightweight sibling to CloseTopicModal — adds/updates a follow-up
 * (action_item) on a topic WITHOUT closing it. The topic keeps whatever
 * status it already had (pending/in_progress); this is purely "note a
 * to-do for later" while discussion continues.
 *
 * Also captures who's responsible (owner): attendees who were at the
 * meeting are offered first as quick picks, with a collapsed picker to
 * take any name from the אלפון. */
export default function FollowUpModal({
  topicTitle,
  initialValue,
  initialOwner,
  presentMemberIds,
  presentParticipantIds,
  onCancel,
  onSubmit,
}: {
  topicTitle: string;
  initialValue: string;
  initialOwner: string;
  presentMemberIds: string[];
  presentParticipantIds: string[];
  onCancel: () => void;
  onSubmit: (actionItem: string, owner: string) => void | Promise<void>;
}) {
  const [actionItem, setActionItem] = useState(initialValue);
  const [owner, setOwner] = useState(initialOwner);
  const [submitting, setSubmitting] = useState(false);
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
    () => [...new Set(participants.map((p) => p.full_name).filter(Boolean))].sort((a, b) => a.localeCompare(b, "he")),
    [participants],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionItem.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(actionItem.trim(), owner.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-line bg-white shadow-lg"
      >
        <div className="p-5">
          <h2 className="mb-1 font-display text-lg font-semibold">יצירת מעקב</h2>
          <p className="mb-4 text-sm text-ink-soft">{topicTitle}</p>

          <label className="mb-4 block text-sm">
            <span className="mb-1 block font-medium text-ink-soft">משימת המשך</span>
            <textarea
              value={actionItem}
              onChange={(e) => setActionItem(e.target.value)}
              rows={3}
              autoFocus
              className="w-full rounded border border-line-strong px-3 py-2 text-sm"
              placeholder="מה צריך לעקוב אחריו?"
            />
          </label>

          <div className="mb-2 text-sm">
            <span className="mb-1 block font-medium text-ink-soft">
              אחראי{owner && <span className="text-ink"> · {owner}</span>}
            </span>
            {attendees.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {attendees.map((name) => {
                  const on = owner === name;
                  return (
                    <button
                      type="button"
                      key={name}
                      onClick={() => setOwner(on ? "" : name)}
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
          </div>

          <div className="text-sm">
            <button
              type="button"
              onClick={() => setDirOpen((o) => !o)}
              className="text-xs text-accent-dark hover:underline"
            >
              {dirOpen ? "▾" : "▸"} בחר מהאלפון
            </button>
            {dirOpen && (
              <select
                value={directory.includes(owner) ? owner : ""}
                onChange={(e) => setOwner(e.target.value)}
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

          <p className="mt-4 text-xs text-ink-soft">הנושא יישאר פתוח — זו רק הוספת משימת מעקב.</p>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded border border-line-strong px-4 py-2 text-sm hover:bg-line"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={submitting || !actionItem.trim()}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "שומר…" : "שמור מעקב"}
          </button>
        </div>
      </form>
    </div>
  );
}

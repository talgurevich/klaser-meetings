import { useState } from "react";
import OwnerPicker from "./OwnerPicker";

/** Lightweight sibling to CloseTopicModal — adds/updates a follow-up
 * (action_item) on a topic WITHOUT closing it. The topic keeps whatever
 * status it already had (pending/in_progress); this is purely "note a
 * to-do for later" while discussion continues. Also captures who's
 * responsible (owner) via the shared OwnerPicker. */
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
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden border border-ink bg-surface"
      >
        <div className="overflow-y-auto p-5">
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

          {actionItem.trim() && (
            <OwnerPicker
              value={owner}
              onChange={setOwner}
              presentMemberIds={presentMemberIds}
              presentParticipantIds={presentParticipantIds}
            />
          )}

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

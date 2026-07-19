import { useState } from "react";

/** Lightweight sibling to CloseTopicModal — adds/updates a follow-up
 * (action_item) on a topic WITHOUT closing it. The topic keeps whatever
 * status it already had (pending/in_progress); this is purely "note a
 * to-do for later" while discussion continues. */
export default function FollowUpModal({
  topicTitle,
  initialValue,
  onCancel,
  onSubmit,
}: {
  topicTitle: string;
  initialValue: string;
  onCancel: () => void;
  onSubmit: (actionItem: string) => void | Promise<void>;
}) {
  const [actionItem, setActionItem] = useState(initialValue);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!actionItem.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit(actionItem.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-lg rounded-lg border border-line bg-white p-5 shadow-lg"
      >
        <h2 className="mb-1 font-display text-lg font-semibold">יצירת מעקב</h2>
        <p className="mb-4 text-sm text-ink-soft">{topicTitle}</p>

        <label className="mb-2 block text-sm">
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
        <p className="mb-4 text-xs text-ink-soft">הנושא יישאר פתוח — זו רק הוספת משימת מעקב.</p>

        <div className="flex justify-end gap-2">
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

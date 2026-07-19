import { useState } from "react";

export type CloseTopicValues = {
  decision_text: string | null;
  action_item: string | null;
  topic_notes: string | null;
};

export default function CloseTopicModal({
  topicTitle,
  onCancel,
  onSubmit,
}: {
  topicTitle: string;
  onCancel: () => void;
  onSubmit: (values: CloseTopicValues) => void | Promise<void>;
}) {
  const [decisionText, setDecisionText] = useState("");
  const [actionItem, setActionItem] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        decision_text: decisionText.trim() || null,
        action_item: actionItem.trim() || null,
        topic_notes: notes.trim() || null,
      });
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
        <h2 className="mb-1 font-display text-lg font-semibold">סיום נושא</h2>
        <p className="mb-4 text-sm text-ink-soft">{topicTitle}</p>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-ink-soft">החלטה</span>
          <textarea
            value={decisionText}
            onChange={(e) => setDecisionText(e.target.value)}
            rows={2}
            className="w-full rounded border border-line-strong px-3 py-2 text-sm"
            placeholder="מה הוחלט בנושא זה?"
          />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block font-medium text-ink-soft">משימת המשך</span>
          <textarea
            value={actionItem}
            onChange={(e) => setActionItem(e.target.value)}
            rows={2}
            className="w-full rounded border border-line-strong px-3 py-2 text-sm"
            placeholder="משימה לביצוע (אופציונלי)"
          />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block font-medium text-ink-soft">הערות</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded border border-line-strong px-3 py-2 text-sm"
          />
        </label>

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
            disabled={submitting}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "שומר…" : "סיים נושא"}
          </button>
        </div>
      </form>
    </div>
  );
}

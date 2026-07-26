import { useState } from "react";
import OwnerPicker from "./OwnerPicker";

export type CloseTopicValues = {
  decision_text: string | null;
  action_item: string | null;
  action_item_owner: string | null;
  topic_notes: string | null;
};

export default function CloseTopicModal({
  topicTitle,
  onCancel,
  onSubmit,
  initialDecision = "",
  initialActionItem = "",
  initialActionOwner = "",
  initialNotes = "",
  presentMemberIds = [],
  presentParticipantIds = [],
  heading = "סיום נושא",
  submitLabel = "סיים נושא",
}: {
  topicTitle: string;
  onCancel: () => void;
  onSubmit: (values: CloseTopicValues) => void | Promise<void>;
  initialDecision?: string;
  initialActionItem?: string;
  initialActionOwner?: string;
  initialNotes?: string;
  presentMemberIds?: string[];
  presentParticipantIds?: string[];
  heading?: string;
  submitLabel?: string;
}) {
  const [decisionText, setDecisionText] = useState(initialDecision);
  const [actionItem, setActionItem] = useState(initialActionItem);
  const [actionOwner, setActionOwner] = useState(initialActionOwner);
  const [notes, setNotes] = useState(initialNotes);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit({
        decision_text: decisionText.trim() || null,
        action_item: actionItem.trim() || null,
        action_item_owner: actionItem.trim() ? actionOwner.trim() || null : null,
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
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-line bg-white shadow-lg"
      >
        <div className="overflow-y-auto p-5">
          <h2 className="mb-1 font-display text-lg font-semibold">{heading}</h2>
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

          {actionItem.trim() && (
            <div className="mb-3">
              <OwnerPicker
                value={actionOwner}
                onChange={setActionOwner}
                presentMemberIds={presentMemberIds}
                presentParticipantIds={presentParticipantIds}
              />
            </div>
          )}

          <label className="mb-1 block text-sm">
            <span className="mb-1 block font-medium text-ink-soft">הערות</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded border border-line-strong px-3 py-2 text-sm"
            />
          </label>
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
            disabled={submitting}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "שומר…" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

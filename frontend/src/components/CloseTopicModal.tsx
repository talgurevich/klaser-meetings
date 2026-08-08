import { useState } from "react";
import OwnerPicker from "./OwnerPicker";
import { DsButton, DsModal, DsTextarea, Field } from "./klaser-ds";

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
    <DsModal
      title={heading}
      subtitle={topicTitle}
      onClose={onCancel}
      onSubmit={handleSubmit}
      actions={
        <>
          <DsButton type="submit" size="compact" disabled={submitting}>
            {submitting ? "שומר…" : submitLabel}
          </DsButton>
          <DsButton variant="ghost" size="compact" onClick={onCancel} disabled={submitting}>
            ביטול
          </DsButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="החלטה">
          <DsTextarea
            value={decisionText}
            onChange={setDecisionText}
            rows={2}
            placeholder="מה הוחלט בנושא זה?"
          />
        </Field>

        <Field label="משימת המשך">
          <DsTextarea
            value={actionItem}
            onChange={setActionItem}
            rows={2}
            placeholder="משימה לביצוע (אופציונלי)"
          />
        </Field>

        {actionItem.trim() && (
          <OwnerPicker
            value={actionOwner}
            onChange={setActionOwner}
            presentMemberIds={presentMemberIds}
            presentParticipantIds={presentParticipantIds}
          />
        )}

        <Field label="הערות">
          <DsTextarea value={notes} onChange={setNotes} rows={2} />
        </Field>
      </div>
    </DsModal>
  );
}

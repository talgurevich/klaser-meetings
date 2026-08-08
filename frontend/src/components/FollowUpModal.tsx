import { useState } from "react";
import OwnerPicker from "./OwnerPicker";
import { DsButton, DsModal, DsTextarea, Field } from "./klaser-ds";

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
    <DsModal
      title="יצירת מעקב"
      subtitle={topicTitle}
      onClose={onCancel}
      onSubmit={handleSubmit}
      actions={
        <>
          <DsButton
            type="submit"
            size="compact"
            disabled={submitting || !actionItem.trim()}
          >
            {submitting ? "שומר…" : "שמור מעקב"}
          </DsButton>
          <DsButton variant="ghost" size="compact" onClick={onCancel} disabled={submitting}>
            ביטול
          </DsButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="משימת המשך">
          <DsTextarea
            value={actionItem}
            onChange={setActionItem}
            rows={3}
            placeholder="מה צריך לעקוב אחריו?"
          />
        </Field>

        {actionItem.trim() && (
          <OwnerPicker
            value={owner}
            onChange={setOwner}
            presentMemberIds={presentMemberIds}
            presentParticipantIds={presentParticipantIds}
          />
        )}

        <p className="font-rubik text-xs text-ink-soft">
          הנושא יישאר פתוח — זו רק הוספת משימת מעקב.
        </p>
      </div>
    </DsModal>
  );
}

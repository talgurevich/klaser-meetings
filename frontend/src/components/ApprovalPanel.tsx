import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Approval, type Member } from "../lib/api";
import { CheckMarkIcon, DsButton, DsCard, StatusPill } from "./klaser-ds";

export default function ApprovalPanel({
  title,
  approvals,
  currentUserId,
  canApprove,
  onApprove,
}: {
  title: string;
  approvals: Approval[];
  currentUserId: string | undefined;
  canApprove: boolean;
  onApprove: () => Promise<void>;
}) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .listMembers()
      .then(setMembers)
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  const nameFor = (memberId: string) => {
    const m = members?.find((x) => x.id === memberId);
    return m?.display_name || m?.email || memberId;
  };

  const alreadyApproved = Boolean(currentUserId && approvals.some((a) => a.member_id === currentUserId));

  async function handleApprove() {
    setSubmitting(true);
    setError(null);
    try {
      await onApprove();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DsCard interactive={false} className="p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="font-rubik text-base font-bold tracking-[0.15em] text-turquoise">
          {title} ({approvals.length})
        </h3>
        {canApprove && !alreadyApproved && (
          <DsButton
            size="compact"
            onClick={handleApprove}
            disabled={submitting}
            icon={<CheckMarkIcon />}
          >
            {submitting ? "מאשר…" : "אשר"}
          </DsButton>
        )}
        {alreadyApproved && (
          <StatusPill variant="success">
            <CheckMarkIcon />
            <span>אישרת</span>
          </StatusPill>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-danger">{error}</p>}

      {approvals.length === 0 ? (
        <p className="text-sm text-ink-soft">אין עדיין אישורים.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {approvals.map((a) => (
            <li key={a.member_id} className="flex justify-between gap-4 text-ink-soft">
              <span>{members ? nameFor(a.member_id) : a.member_id}</span>
              <span className="font-rubik text-xs">
                {new Date(a.approved_at).toLocaleString("he-IL")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </DsCard>
  );
}

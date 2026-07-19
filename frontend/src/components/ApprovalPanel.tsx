import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Approval, type Member } from "../lib/api";

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
    <div className="rounded border border-line bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-soft">
          {title} ({approvals.length})
        </h3>
        {canApprove && !alreadyApproved && (
          <button
            onClick={handleApprove}
            disabled={submitting}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {submitting ? "מאשר…" : "אשר"}
          </button>
        )}
        {alreadyApproved && <span className="text-xs text-emerald-700">✓ אישרת</span>}
      </div>

      {error && <p className="mb-2 text-sm text-red-700">{error}</p>}

      {approvals.length === 0 ? (
        <p className="text-sm text-ink-soft">אין עדיין אישורים.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {approvals.map((a) => (
            <li key={a.member_id} className="flex justify-between text-ink-soft">
              <span>{members ? nameFor(a.member_id) : a.member_id}</span>
              <span>{new Date(a.approved_at).toLocaleString("he-IL")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

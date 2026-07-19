import { useEffect, useState } from "react";
import { api, apiErrorMessage, type InvitePreview } from "../lib/api";
import { KIND_LABELS } from "../lib/meetingLabels";

/** "תצוגה מקדימה של ההזמנה" — renders the exact structured content the
 * invitation email carries, for one sample invitee, before actually
 * sending anything. Rendered natively (not raw email HTML) so it matches
 * the app's own styling and needs no dangerouslySetInnerHTML. */
export default function InvitePreviewModal({
  meetingId,
  inviteeCount,
  onClose,
}: {
  meetingId: string;
  inviteeCount: number;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .previewInvite(meetingId)
      .then(setPreview)
      .catch((err) => setError(apiErrorMessage(err)));
  }, [meetingId]);

  const timeRange =
    preview?.time_start && preview?.time_end
      ? `${preview.time_start}–${preview.time_end}`
      : preview?.time_start || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 print:static print:bg-white print:p-0">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded border border-line bg-white p-6 print:max-h-none print:overflow-visible print:border-0 print:shadow-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <button
            onClick={() => window.print()}
            className="rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-line"
          >
            🖶 הדפס מסמך
          </button>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold">✉️ תצוגה מקדימה של ההזמנה</h2>
            <button onClick={onClose} className="rounded px-2 py-1 text-ink-soft hover:bg-line" aria-label="סגור">
              ✕
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-700">{error}</p>}
        {!preview && !error && <p className="text-sm text-ink-soft">טוען…</p>}

        {preview && (
          <>
            <div className="mb-4 rounded bg-surface p-3 text-sm print:hidden">
              <p>
                <strong>נמען לדוגמה:</strong> {preview.recipient_name}
              </p>
              <p>
                <strong>נושא:</strong> הזמנה ל{KIND_LABELS[preview.meeting_kind]}
                {preview.meeting_number && ` מספר ${preview.meeting_number}`} — {preview.meeting_date}
              </p>
              <p className="text-xs text-ink-soft">המייל יישלח ל-{inviteeCount} מוזמנים</p>
            </div>

            <div className="rounded border border-line p-5">
              <p className="mb-1">שלום {preview.recipient_name},</p>
              <p className="mb-1 font-medium">
                מוזמן/ת ל{KIND_LABELS[preview.meeting_kind]}
                {preview.meeting_number && ` מספר ${preview.meeting_number}`}
              </p>
              <p className="mb-1">
                תאריך: {preview.meeting_date}
                {timeRange && ` | שעה: ${timeRange}`}
              </p>
              {preview.location && <p className="mb-3">מקום: {preview.location}</p>}

              {preview.topics.length > 0 && (
                <>
                  <p className="mb-1 font-medium">סדר יום:</p>
                  <ol className="mb-3 list-decimal pr-5 text-sm">
                    {preview.topics.map((t, i) => (
                      <li key={i}>
                        {t.title}
                        {t.duration_minutes ? ` — ${t.duration_minutes} דקות` : ""}
                      </li>
                    ))}
                  </ol>
                </>
              )}

              <p className="mb-2 text-sm">אנא אשר/י קבלת ההזמנה:</p>
              <div className="flex gap-2 print:hidden">
                <button
                  disabled
                  className="rounded bg-amber-600 px-3 py-2 text-xs font-medium text-white opacity-90"
                >
                  מאשר/ת קבלה ולא אוכל להגיע
                </button>
                <button
                  disabled
                  className="rounded bg-emerald-600 px-3 py-2 text-xs font-medium text-white opacity-90"
                >
                  מאשר/ת ומגיע/ה
                </button>
              </div>

              <p className="mt-4 border-t border-line pt-2 text-xs text-ink-soft">
                {preview.tenant_name} · Klaser
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

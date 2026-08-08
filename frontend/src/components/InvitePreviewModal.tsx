import { useEffect, useState } from "react";
import { api, apiErrorMessage, type InvitePreview } from "../lib/api";
import { KIND_LABELS } from "../lib/meetingLabels";
import { CloseIcon, DsButton } from "./klaser-ds";

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
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    api
      .previewInvite(meetingId)
      .then(setPreview)
      .catch((err) => setError(apiErrorMessage(err)));
  }, [meetingId]);

  // The actual PDF that will be attached to the invitation email, shown so
  // the sender sees exactly what goes out. Object URL revoked on unmount.
  useEffect(() => {
    let url: string | null = null;
    api
      .getInvitePdf(meetingId)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setPdfUrl(url);
      })
      .catch(() => setPdfUrl(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [meetingId]);

  const timeRange =
    preview?.time_start && preview?.time_end
      ? `${preview.time_start}–${preview.time_end}`
      : preview?.time_start || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 print:static print:bg-white print:p-0">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-white p-8 shadow-[0px_2px_0_rgba(0,0,0,0.05),0px_4px_25px_0px_rgba(0,0,0,0.08)] print:max-h-none print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
        {/* Title first in DOM → right; close last → left (DS §4.6). */}
        <div className="mb-8 flex items-start justify-between gap-4 print:hidden">
          <h2 className="font-rubik text-2xl font-bold text-ink">תצוגה מקדימה של ההזמנה</h2>
          <div className="flex shrink-0 items-center gap-2">
            <DsButton variant="secondary" size="micro" className="border" onClick={() => window.print()}>
              הדפס מסמך
            </DsButton>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-ink-soft transition hover:bg-line hover:text-ink"
              aria-label="סגור"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {!preview && !error && <p className="text-sm text-ink-soft">טוען…</p>}

        {preview && (
          <>
            <div className="mb-8 rounded-md bg-surface p-4 text-sm print:hidden">
              <p>
                <strong>נמען לדוגמה:</strong> {preview.recipient_name}
              </p>
              <p>
                <strong>נושא:</strong> הזמנה ל{KIND_LABELS[preview.meeting_kind]}
                {preview.meeting_number && ` מספר ${preview.meeting_number}`} — {preview.meeting_date}
              </p>
              <p className="mt-1 font-rubik text-xs text-ink-soft">
                המייל יישלח ל-{inviteeCount} מוזמנים
              </p>
            </div>

            <div className="rounded-lg border border-line p-8">
              <p className="mb-1">שלום {preview.recipient_name},</p>
              <p className="mb-1 font-medium">
                מוזמן/ת ל{KIND_LABELS[preview.meeting_kind]}
                {preview.meeting_number && ` מספר ${preview.meeting_number}`}
              </p>
              <p className="mb-1">
                תאריך: {preview.meeting_date}
                {timeRange && ` | שעה: ${timeRange}`}
              </p>
              {preview.location && <p className="mb-4">מקום: {preview.location}</p>}

              {preview.topics.length > 0 && (
                <>
                  <p className="mb-1 font-medium">סדר יום:</p>
                  <ol className="mb-4 list-decimal pr-4 text-sm">
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
                  className="rounded-md bg-warning px-3 py-2 font-rubik text-xs font-medium text-white opacity-90"
                >
                  מאשר/ת קבלה ולא אוכל להגיע
                </button>
                <button
                  disabled
                  className="rounded-md bg-success px-3 py-2 font-rubik text-xs font-medium text-white opacity-90"
                >
                  מאשר/ת ומגיע/ה
                </button>
              </div>

              <p className="mt-4 border-t border-line pt-2 font-rubik text-xs text-ink-soft">
                {preview.tenant_name} · Klaser
              </p>
            </div>

            <div className="mt-4 print:hidden">
              <p className="mb-1 text-sm font-medium">מסמך ההזמנה (PDF שיצורף למייל)</p>
              {pdfUrl ? (
                <iframe
                  title="invite-pdf"
                  src={pdfUrl}
                  className="h-96 w-full rounded border border-line bg-white"
                />
              ) : (
                <p className="text-xs text-ink-soft">טוען PDF…</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

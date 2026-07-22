import { useEffect, useState } from "react";
import { api, apiErrorMessage, type PublishPreview } from "../lib/api";

/** Preview-and-confirm dialog for "פרסם לציבור והעבר לפורסם". Fetches the
 * exact summary email + recipient list the server would send, shows it, and
 * only on explicit confirm does it send the emails and move the meeting to
 * "published". */
export default function PublishModal({
  meetingId,
  onCancel,
  onPublished,
}: {
  meetingId: string;
  onCancel: () => void;
  onPublished: () => void;
}) {
  const [preview, setPreview] = useState<PublishPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getPublishPreview(meetingId)
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(apiErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  async function confirm() {
    setSending(true);
    setError(null);
    try {
      await api.publishMeeting(meetingId);
      onPublished();
    } catch (err) {
      setError(apiErrorMessage(err));
      setSending(false);
    }
  }

  const recipientCount = preview?.recipients.length ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-line bg-white shadow-lg">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">פרסום לציבור</h2>
          <p className="mt-1 text-xs text-ink-soft">
            סיכום הישיבה וההחלטות יישלח לכל הנמענים המפורטים למטה, והישיבה תעבור לסטטוס "פורסם".
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loadError && <p className="text-sm text-red-700">{loadError}</p>}
          {!preview && !loadError && <p className="text-sm text-ink-soft">טוען תצוגה מקדימה…</p>}

          {preview && (
            <>
              <div className="mb-4">
                <p className="mb-1 text-sm font-medium">נמענים ({recipientCount})</p>
                {recipientCount === 0 ? (
                  <p className="text-xs text-amber-700">
                    אין נמענים עם כתובת אימייל — לא יישלחו מיילים, אך ניתן עדיין לפרסם.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {preview.recipients.map((r) => (
                      <span
                        key={r.email}
                        className="rounded-full bg-line px-2 py-1 text-xs text-ink"
                        title={r.email}
                      >
                        {r.name}
                      </span>
                    ))}
                  </div>
                )}
                {preview.recipients_without_email.length > 0 && (
                  <p className="mt-2 text-xs text-ink-soft">
                    ללא אימייל (לא יקבלו): {preview.recipients_without_email.join(", ")}
                  </p>
                )}
              </div>

              <div>
                <p className="mb-1 text-sm font-medium">תצוגה מקדימה של המייל</p>
                <p className="mb-2 text-xs text-ink-soft">נושא: {preview.subject}</p>
                <iframe
                  title="preview"
                  srcDoc={preview.html}
                  className="h-80 w-full rounded border border-line bg-white"
                />
              </div>

              {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button
            onClick={onCancel}
            disabled={sending}
            className="rounded border border-line-strong px-4 py-2 text-sm text-ink-soft hover:bg-line disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            onClick={confirm}
            disabled={sending || !preview}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {sending ? "שולח ומפרסם…" : "אשר, שלח ופרסם"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { api, apiErrorMessage, type PublishPreview } from "../lib/api";
import {
  DsButton,
  DsModal,
  DsTag,
  SectionHeader,
  SendIcon,
  StatusPill,
} from "./klaser-ds";

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
    <DsModal
      size="lg"
      title="פרסום לציבור"
      subtitle='סיכום הישיבה וההחלטות יישלח לכל הנמענים המפורטים למטה, והישיבה תעבור לסטטוס "פורסם".'
      onClose={onCancel}
      actions={
        <>
          <DsButton
            size="compact"
            onClick={confirm}
            disabled={sending || !preview}
            icon={<SendIcon />}
          >
            {sending ? "שולח ומפרסם…" : "אשר, שלח ופרסם"}
          </DsButton>
          <DsButton variant="ghost" size="compact" onClick={onCancel} disabled={sending}>
            ביטול
          </DsButton>
        </>
      }
    >
      {loadError && <p className="text-sm text-danger">{loadError}</p>}
      {!preview && !loadError && <p className="text-sm text-ink-soft">טוען תצוגה מקדימה…</p>}

      {preview && (
        <>
          <div className="mb-8">
            <SectionHeader>נמענים ({recipientCount})</SectionHeader>
            {recipientCount === 0 ? (
              <StatusPill variant="warning">
                אין נמענים עם כתובת אימייל — לא יישלחו מיילים, אך ניתן עדיין לפרסם.
              </StatusPill>
            ) : (
              <div className="flex flex-wrap gap-2">
                {preview.recipients.map((r) => (
                  <span key={r.email} title={r.email}>
                    <DsTag>{r.name}</DsTag>
                  </span>
                ))}
              </div>
            )}
            {preview.recipients_without_email.length > 0 && (
              <p className="mt-2 font-rubik text-xs text-ink-soft">
                ללא אימייל (לא יקבלו): {preview.recipients_without_email.join(", ")}
              </p>
            )}
          </div>

          <div>
            <SectionHeader>תצוגה מקדימה של המייל</SectionHeader>
            <p className="mb-2 font-rubik text-xs text-ink-soft">נושא: {preview.subject}</p>
            <iframe
              title="preview"
              srcDoc={preview.html}
              className="h-80 w-full rounded-md border border-line bg-white"
            />
          </div>

          {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        </>
      )}
    </DsModal>
  );
}

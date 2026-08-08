import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage, type MeetingDocument } from "../lib/api";

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** Files attached to a meeting/assembly. Addable at every stage up to
 * publication (canEdit); view-only afterwards. Bytes stream from the backend
 * and open in a new tab for viewing/download. */
export default function DocumentsPanel({
  meetingId,
  canEdit,
}: {
  meetingId: string;
  canEdit: boolean;
}) {
  const [docs, setDocs] = useState<MeetingDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    api
      .listDocuments(meetingId)
      .then(setDocs)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await api.uploadDocument(meetingId, file);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function view(doc: MeetingDocument) {
    setError(null);
    try {
      const blob = await api.getDocumentBlob(meetingId, doc.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function remove(doc: MeetingDocument) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteDocument(meetingId, doc.id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink-soft">
          <span aria-hidden>📎</span> מסמכים {docs ? `(${docs.length})` : ""}
        </h3>
        {canEdit && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-line disabled:opacity-50"
            >
              {busy ? "מעלה…" : "⬆ הוסף מסמך"}
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={onFilePicked} />
          </>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {docs && docs.length === 0 && <p className="mt-2 text-sm text-ink-soft">אין מסמכים.</p>}
      {docs && docs.length > 0 && (
        <ul className="mt-2 space-y-1">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded bg-white px-2.5 py-1.5 text-sm"
            >
              <span className="min-w-0 truncate" title={d.filename}>
                {d.filename}
                <span className="text-ink-soft"> · {fmtSize(d.size_bytes)}</span>
              </span>
              <span className="flex items-center gap-3">
                <button onClick={() => view(d)} className="font-rubik text-xs font-medium text-turquoise transition hover:text-turquoise-dark hover:underline">
                  צפה / הורד
                </button>
                {canEdit && (
                  <button
                    onClick={() => remove(d)}
                    disabled={busy}
                    className="font-rubik text-xs font-medium text-danger transition hover:underline disabled:opacity-50"
                  >
                    מחק
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, apiErrorMessage, type RsvpMeeting } from "../lib/api";
import { KIND_LABELS } from "../lib/meetingLabels";

type LoadState =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "ready"; meeting: RsvpMeeting };

/** Public, no-login page reached from the "אישור קבלת פרוטוקול" email link.
 * Possession of the token is the whole auth model (mirrors Rsvp.tsx). The
 * receipt is confirmed automatically on load — one click in the email is
 * enough — with a manual button as a fallback. */
export default function ProtocolReceipt() {
  const { token } = useParams<{ token: string }>();
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoad({ kind: "invalid", message: "קישור לא תקין." });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // Confirm receipt on load (idempotent server-side).
        const meeting = await api.confirmProtocolReceipt(token);
        if (!cancelled) setLoad({ kind: "ready", meeting });
      } catch (err) {
        if (!cancelled) setLoad({ kind: "invalid", message: apiErrorMessage(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function confirmAgain() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const meeting = await api.confirmProtocolReceipt(token);
      setLoad({ kind: "ready", meeting });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6 text-ink">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-8">
        <h1 className="text-center font-display text-2xl font-bold">אישור קבלת פרוטוקול</h1>

        {load.kind === "loading" && <p className="mt-8 text-center text-sm text-ink-soft">טוען…</p>}

        {load.kind === "invalid" && (
          <div className="mt-8 flex flex-col gap-2 text-center">
            <p className="text-sm">{load.message}</p>
            <p className="text-xs text-ink-soft">הקישור אולי אינו תקין. פנה למארגן הישיבה.</p>
          </div>
        )}

        {load.kind === "ready" && (
          <>
            <p className="mt-4 text-center text-sm leading-relaxed text-ink-soft">
              שלום {load.meeting.recipient_name},
              <br />
              {KIND_LABELS[load.meeting.meeting_kind]}
              {load.meeting.meeting_number && ` מספר ${load.meeting.meeting_number}`}
            </p>
            <p className="mt-2 text-center text-sm">{load.meeting.meeting_date}</p>

            <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-sm font-semibold text-emerald-800">✓ אישור הקבלה נקלט</p>
              <p className="mt-1 text-xs text-emerald-700">תודה — אישרת שקיבלת את הפרוטוקול.</p>
            </div>

            {!load.meeting.protocol_receipt_confirmed && (
              <button
                onClick={confirmAgain}
                disabled={busy}
                className="mt-4 w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                אישור קבלת הפרוטוקול
              </button>
            )}

            {error && (
              <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
                {error}
              </div>
            )}

            <p className="mt-6 text-center text-xs text-ink-soft">{load.meeting.tenant_name} · Klaser</p>
          </>
        )}
      </div>
    </div>
  );
}

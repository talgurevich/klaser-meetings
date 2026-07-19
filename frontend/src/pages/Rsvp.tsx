import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, apiErrorMessage, type RsvpMeeting } from "../lib/api";
import { KIND_LABELS } from "../lib/meetingLabels";

type LoadState =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "ready"; meeting: RsvpMeeting };

const STATUS_LABELS: Record<RsvpMeeting["status"], string> = {
  pending: "טרם השבת/ה",
  confirmed_attend: "אישרת הגעה",
  confirmed_absent: "אישרת קבלה, ללא הגעה",
};

/** Public, no-login RSVP page — reached from a link in the invitation
 * email (see backend/app/services/mail.py). Possession of the token in
 * the URL is the entire auth model; this route lives outside AuthGate
 * (see App.tsx) since the recipient never signs in. If the email link
 * carried ?response=..., that choice is auto-submitted on load so a
 * single click in the email is enough — the buttons below just let
 * someone change their mind afterward. */
export default function Rsvp() {
  const { token } = useParams<{ token: string }>();
  const [params] = useSearchParams();
  const autoResponse = params.get("response");

  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSubmitted, setAutoSubmitted] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoad({ kind: "invalid", message: "קישור לא תקין." });
      return;
    }
    let cancelled = false;

    async function run() {
      try {
        let meeting: RsvpMeeting;
        if (
          !autoSubmitted &&
          (autoResponse === "confirmed_attend" || autoResponse === "confirmed_absent")
        ) {
          meeting = await api.submitRsvp(token!, autoResponse);
          setAutoSubmitted(true);
        } else {
          meeting = await api.getRsvp(token!);
        }
        if (!cancelled) setLoad({ kind: "ready", meeting });
      } catch (err) {
        if (!cancelled) setLoad({ kind: "invalid", message: apiErrorMessage(err) });
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function respond(response: "confirmed_attend" | "confirmed_absent") {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const meeting = await api.submitRsvp(token, response);
      setLoad({ kind: "ready", meeting });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6 text-ink">
      <div className="w-full max-w-md rounded-lg border border-line bg-white p-8">
        <h1 className="text-center font-display text-2xl font-bold">אישור הגעה</h1>

        {load.kind === "loading" && (
          <p className="mt-8 text-center text-sm text-ink-soft">טוען…</p>
        )}

        {load.kind === "invalid" && (
          <div className="mt-8 flex flex-col gap-2 text-center">
            <p className="text-sm">{load.message}</p>
            <p className="text-xs text-ink-soft">
              הקישור אולי אינו תקין. פנה למארגן הישיבה לקבלת הזמנה מחדש.
            </p>
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
            <p className="mt-2 text-center text-sm">
              {load.meeting.meeting_date}
              {load.meeting.time_start &&
                ` | ${load.meeting.time_start}${load.meeting.time_end ? `–${load.meeting.time_end}` : ""}`}
            </p>
            {load.meeting.location && (
              <p className="text-center text-sm text-ink-soft">{load.meeting.location}</p>
            )}

            {load.meeting.topics.length > 0 && (
              <div className="mt-4 rounded bg-surface p-3">
                <p className="mb-1 text-sm font-medium">סדר יום:</p>
                <ol className="list-decimal pr-5 text-sm">
                  {load.meeting.topics.map((t, i) => (
                    <li key={i}>
                      {t.title}
                      {t.duration_minutes ? ` — ${t.duration_minutes} דקות` : ""}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            <p className="mt-6 text-center text-sm font-medium">
              סטטוס נוכחי: {STATUS_LABELS[load.meeting.status]}
            </p>

            <div className="mt-3 flex justify-center gap-3">
              <button
                onClick={() => respond("confirmed_absent")}
                disabled={busy}
                className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                מאשר/ת קבלה ולא אוכל להגיע
              </button>
              <button
                onClick={() => respond("confirmed_attend")}
                disabled={busy}
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                מאשר/ת ומגיע/ה
              </button>
            </div>

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

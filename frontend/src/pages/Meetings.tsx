import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiErrorMessage, type MeetingListItem, type MeetingStatus } from "../lib/api";
import { KIND_LABELS, STATUS_COLORS, STATUS_LABELS, todayIso } from "../lib/meetingLabels";
import { useIsAdmin, useIsEditor } from "../components/Layout";

export default function Meetings() {
  const editor = useIsEditor();
  const admin = useIsAdmin();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState<MeetingListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Two-step confirm inline in the row (click ✕ -> row switches to
  // "למחוק לצמיתות? מחק / ביטול") rather than window.confirm —
  // admin-only + irreversible + any status (including a published
  // protocol), so this deserves an explicit in-page step, not an
  // easy-to-reflex-dismiss native dialog.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Filters
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const hasFilters = Boolean(status || dateFrom || dateTo);

  function load() {
    api
      .listMeetings({
        status: (status || undefined) as MeetingStatus | undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      .then(setMeetings)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dateFrom, dateTo]);

  // Instant-create + redirect straight to the meeting's setup screen —
  // same pattern as Home.tsx's create buttons, see that file for why.
  async function createAndGo() {
    setCreating(true);
    setError(null);
    try {
      const meeting = await api.createMeeting({ kind: "meeting", date: todayIso() });
      navigate(`/meetings/${meeting.id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
      setCreating(false);
    }
  }

  async function confirmDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteMeeting(id);
      setConfirmId(null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">ישיבות ואסיפות</h1>
        {editor && (
          <button
            onClick={createAndGo}
            disabled={creating}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            + ישיבה חדשה
          </button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">סטטוס</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded border border-line-strong px-3 py-2 text-sm"
          >
            <option value="">כל הסטטוסים</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">מתאריך</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-line-strong px-3 py-2 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-ink-soft">עד תאריך</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-line-strong px-3 py-2 text-sm"
          />
        </label>
        {hasFilters && (
          <button
            onClick={() => {
              setStatus("");
              setDateFrom("");
              setDateTo("");
            }}
            className="py-2 text-sm text-ink-soft hover:underline"
          >
            נקה סינון
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {meetings === null && !error && <p className="text-ink-soft">טוען…</p>}

      {meetings && meetings.length === 0 && (
        <p className="text-ink-soft">
          {hasFilters
            ? "לא נמצאו ישיבות התואמות לסינון."
            : `אין עדיין ישיבות. ${editor ? 'לחצו על "ישיבה חדשה" כדי להתחיל.' : ""}`}
        </p>
      )}

      {meetings && meetings.length > 0 && (
        <div className="overflow-hidden rounded border border-line bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface text-ink-soft">
              <tr>
                <th className="px-4 py-2 font-medium">מספר</th>
                <th className="px-4 py-2 font-medium">כותרת</th>
                <th className="px-4 py-2 font-medium">סוג</th>
                <th className="px-4 py-2 font-medium">תאריך</th>
                <th className="px-4 py-2 font-medium">סטטוס</th>
                {admin && <th className="px-4 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id} className="border-t border-line hover:bg-surface">
                  <td className="px-4 py-2">
                    <Link to={`/meetings/${m.id}`} className="text-accent-dark hover:underline">
                      {m.number || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{m.title || "(ללא כותרת)"}</td>
                  <td className="px-4 py-2">{KIND_LABELS[m.kind]}</td>
                  <td className="px-4 py-2">{m.date}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[m.status]}`}
                    >
                      {STATUS_LABELS[m.status]}
                    </span>
                  </td>
                  {admin && (
                    <td className="px-4 py-2 text-left">
                      {confirmId === m.id ? (
                        <span className="flex items-center justify-end gap-2 whitespace-nowrap text-xs">
                          <span className="text-red-700">למחוק לצמיתות?</span>
                          <button
                            onClick={() => confirmDelete(m.id)}
                            disabled={deletingId === m.id}
                            className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deletingId === m.id ? "מוחק…" : "מחק"}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            disabled={deletingId === m.id}
                            className="rounded border border-line-strong px-2 py-1 hover:bg-line"
                          >
                            ביטול
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmId(m.id)}
                          className="rounded px-2 py-1 text-ink-soft hover:bg-line"
                          aria-label="מחק ישיבה"
                          title="מחק ישיבה"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

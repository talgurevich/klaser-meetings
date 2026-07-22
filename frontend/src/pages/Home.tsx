import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  apiErrorMessage,
  type DashboardData,
  type DecisionSearchResult,
  type MeetingKind,
} from "../lib/api";
import { KIND_LABELS, STATUS_COLORS, STATUS_LABELS } from "../lib/meetingLabels";
import { useIsEditor } from "../components/Layout";
import { useAuth } from "../lib/auth";

export default function Home() {
  const navigate = useNavigate();
  const editor = useIsEditor();
  const { state } = useAuth();
  const user = state.kind === "signed_in" ? state.user : null;

  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [addingDate, setAddingDate] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newDateKind, setNewDateKind] = useState<MeetingKind>("meeting");
  const [newDateNote, setNewDateNote] = useState("");

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DecisionSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  function load() {
    api
      .getDashboard()
      .then(setData)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  // Instant-create: rather than a separate mini-wizard, "+ ישיבה חדשה" /
  // "אסיפה חדשה" create a bare draft immediately and drop straight onto
  // the meeting's own setup screen, which already covers everything a
  // separate creation form would (and more: invitees, send actions). No
  // date is sent — the backend seeds date/time/location from the tenant's
  // per-kind defaults (settings page), all freely editable afterwards.
  async function createAndGo(kind: MeetingKind) {
    setBusy(true);
    setError(null);
    try {
      const meeting = await api.createMeeting({ kind });
      navigate(`/meetings/${meeting.id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  async function addSavedDate(e: React.FormEvent) {
    e.preventDefault();
    if (!newDate) return;
    setBusy(true);
    setError(null);
    try {
      await api.createSavedDate({ kind: newDateKind, date: newDate, note: newDateNote.trim() || null });
      setNewDate("");
      setNewDateNote("");
      setAddingDate(false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeSavedDate(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteSavedDate(id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function convertSavedDate(id: string) {
    setBusy(true);
    setError(null);
    try {
      const meeting = await api.convertSavedDate(id);
      navigate(`/meetings/${meeting.id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const found = await api.searchDecisions(query.trim());
      setResults(found);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {editor && (
            <>
              <button
                onClick={() => createAndGo("meeting")}
                disabled={busy}
                className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
              >
                + ישיבה חדשה
              </button>
              <button
                onClick={() => createAndGo("assembly")}
                disabled={busy}
                className="rounded border border-line-strong px-4 py-2 text-sm hover:bg-line disabled:opacity-50"
              >
                אסיפה חדשה
              </button>
            </>
          )}
        </div>
        <p className="font-display text-lg font-bold">
          שלום {user?.display_name || user?.email} 👋
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!data && !error && <p className="text-ink-soft">טוען…</p>}

      {data && (
        <>
          {data.continuing_meeting && (
            <Link
              to={`/meetings/${data.continuing_meeting.id}`}
              className="mb-4 flex items-center justify-between rounded border border-line bg-surface px-4 py-3 hover:bg-line"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-accent-dark">
                המשך לישיבה ←
              </span>
              <span className="flex items-center gap-3">
                <span className="font-medium">
                  {KIND_LABELS[data.continuing_meeting.kind]} {data.continuing_meeting.display_number} בעבודה
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[data.continuing_meeting.status]}`}
                >
                  {STATUS_LABELS[data.continuing_meeting.status]}
                </span>
              </span>
            </Link>
          )}

          <h2 className="mb-3 font-display text-lg font-semibold">ישיבות עתידיות</h2>
          <div className="mb-4 rounded border border-line bg-white p-8 text-center">
            {data.upcoming_meeting ? (
              <Link to={`/meetings/${data.upcoming_meeting.id}`} className="block hover:opacity-80">
                <p className="font-medium">
                  {KIND_LABELS[data.upcoming_meeting.kind]}
                  {data.upcoming_meeting.title && ` · ${data.upcoming_meeting.title}`}
                </p>
                <p className="text-sm text-ink-soft">
                  {data.upcoming_meeting.date}
                  {data.upcoming_meeting.time_start && ` ${data.upcoming_meeting.time_start}`}
                  {data.upcoming_meeting.location && ` · ${data.upcoming_meeting.location}`}
                </p>
              </Link>
            ) : (
              <p className="text-ink-soft">אין ישיבה קרובה</p>
            )}
          </div>

          <div className="mb-6 rounded border border-line bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-soft">תאריכים שמורים</h2>
              {editor && !addingDate && (
                <button
                  onClick={() => setAddingDate(true)}
                  className="text-sm text-accent-dark hover:underline"
                >
                  + הוסף תאריך
                </button>
              )}
            </div>

            {addingDate && (
              <form onSubmit={addSavedDate} className="mb-3 flex flex-wrap items-end gap-2">
                <input
                  type="date"
                  required
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="rounded border border-line-strong px-2 py-1 text-sm"
                />
                <select
                  value={newDateKind}
                  onChange={(e) => setNewDateKind(e.target.value as MeetingKind)}
                  className="rounded border border-line-strong px-2 py-1 text-sm"
                >
                  <option value="meeting">ישיבת ועד</option>
                  <option value="assembly">אסיפה</option>
                </select>
                <input
                  type="text"
                  placeholder="הערה (אופציונלי)"
                  value={newDateNote}
                  onChange={(e) => setNewDateNote(e.target.value)}
                  className="rounded border border-line-strong px-2 py-1 text-sm"
                />
                <button
                  type="submit"
                  disabled={busy || !newDate}
                  className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                >
                  שמור
                </button>
                <button
                  type="button"
                  onClick={() => setAddingDate(false)}
                  disabled={busy}
                  className="text-xs text-ink-soft hover:underline"
                >
                  ביטול
                </button>
              </form>
            )}

            {data.saved_dates.length === 0 ? (
              <p className="text-sm text-ink-soft">אין תאריכים שמורים קרובים</p>
            ) : (
              <div className="space-y-1">
                {data.saved_dates.map((sd) => (
                  <div
                    key={sd.id}
                    className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-surface"
                  >
                    <span>
                      {sd.date} · {KIND_LABELS[sd.kind]}
                      {sd.note && ` · ${sd.note}`}
                    </span>
                    {editor && (
                      <span className="flex gap-3">
                        <button
                          onClick={() => convertSavedDate(sd.id)}
                          disabled={busy}
                          className="text-xs text-accent-dark hover:underline disabled:opacity-50"
                        >
                          הפוך לישיבה
                        </button>
                        <button
                          onClick={() => removeSavedDate(sd.id)}
                          disabled={busy}
                          className="text-xs text-red-700 hover:underline disabled:opacity-50"
                        >
                          הסר
                        </button>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className="rounded border border-emerald-200 bg-emerald-50 p-4 text-center hover:bg-emerald-100"
            >
              <p className="font-display text-lg font-bold">חפש</p>
              <p className="text-xs text-ink-soft">חיפוש בהחלטות</p>
            </button>
            <div className="rounded border border-line bg-surface p-4 text-center">
              <p className="font-display text-2xl font-bold">{data.protocols_count}</p>
              <p className="text-xs text-ink-soft">פרוטוקולים</p>
            </div>
            <Link
              to="/action-items"
              className="rounded border border-amber-200 bg-amber-50 p-4 text-center hover:bg-amber-100"
            >
              <p className="font-display text-2xl font-bold">{data.open_action_items_count}</p>
              <p className="text-xs text-ink-soft">פריטי ביצוע פתוחים</p>
            </Link>
          </div>

          {searchOpen && (
            <div className="mb-6 rounded border border-line bg-white p-4">
              <form onSubmit={runSearch} className="mb-3 flex gap-2">
                <input
                  type="text"
                  placeholder="חיפוש בהחלטות…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 rounded border border-line-strong px-3 py-2 text-sm"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={searching || !query.trim()}
                  className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
                >
                  חפש
                </button>
              </form>
              {results === null && <p className="text-sm text-ink-soft">הקלידו טקסט לחיפוש בהחלטות שהתקבלו.</p>}
              {results !== null && results.length === 0 && (
                <p className="text-sm text-ink-soft">לא נמצאו החלטות תואמות.</p>
              )}
              {results !== null && results.length > 0 && (
                <div className="space-y-2">
                  {results.map((r) => (
                    <Link
                      key={r.topic_id}
                      to={`/meetings/${r.meeting_id}`}
                      className="block rounded border border-line px-3 py-2 hover:bg-surface"
                    >
                      <p className="text-xs text-ink-soft">
                        {KIND_LABELS[r.meeting_kind]}
                        {r.meeting_number && ` · מס׳ ${r.meeting_number}`} · {r.meeting_date} ·{" "}
                        {r.topic_title}
                      </p>
                      <p className="text-sm">{r.decision_text}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mb-3 flex items-center justify-between">
            <Link to="/meetings" className="text-sm text-accent-dark hover:underline">
              כל הפרוטוקולים
            </Link>
            <h2 className="font-display text-lg font-semibold">פרוטוקולים אחרונים</h2>
          </div>

          {data.recent_protocols.length === 0 ? (
            <p className="text-sm text-ink-soft">אין עדיין פרוטוקולים.</p>
          ) : (
            <div className="space-y-2">
              {data.recent_protocols.map((m) => (
                <Link
                  key={m.id}
                  to={`/meetings/${m.id}`}
                  className="flex items-center justify-between rounded border border-line bg-white px-4 py-3 hover:bg-surface"
                >
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[m.status]}`}
                  >
                    {STATUS_LABELS[m.status]}
                  </span>
                  <span className="text-sm">
                    {KIND_LABELS[m.kind]} {m.number}
                    <span className="mr-2 text-ink-soft">{m.date}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

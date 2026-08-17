import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  api,
  apiErrorMessage,
  type DashboardData,
  type DecisionSearchResult,
  type MeetingKind,
} from "../lib/api";
import { KIND_LABELS, STATUS_LABELS, STATUS_VARIANTS } from "../lib/meetingLabels";
import { useIsEditor } from "../components/Layout";
import { useAuth } from "../lib/auth";
import {
  ArrowCircleLeft,
  DsButton,
  DsCard,
  DsInput,
  DsSelect,
  PageHeader,
  PlusIcon,
  SearchIcon,
  SectionHeader,
  StatusPill,
} from "../components/klaser-ds";

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
      <PageHeader
        title={`שלום ${user?.display_name || user?.email || ""}`}
        actions={
          editor && (
            <>
              <DsButton onClick={() => createAndGo("meeting")} disabled={busy} size="compact">
                ישיבה חדשה
              </DsButton>
              <DsButton
                onClick={() => createAndGo("assembly")}
                disabled={busy}
                variant="secondary"
                size="compact"
              >
                אסיפה חדשה
              </DsButton>
            </>
          )
        }
      />

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {!data && !error && <p className="animate-pulse text-sm text-ink-soft">טוען…</p>}

      {data && (
        <>
          {data.continuing_meeting && (
            <Link
              to={`/meetings/${data.continuing_meeting.id}`}
              className="mb-8 flex items-center justify-between gap-4 rounded-lg border border-turquoise/30 bg-turquoise/5 px-4 py-3 transition hover:bg-turquoise/10"
            >
              <span className="flex items-center gap-3">
                <span className="font-medium">
                  {KIND_LABELS[data.continuing_meeting.kind]} {data.continuing_meeting.display_number} בעבודה
                </span>
                <StatusPill variant={STATUS_VARIANTS[data.continuing_meeting.status]}>
                  {STATUS_LABELS[data.continuing_meeting.status]}
                </StatusPill>
              </span>
              {/* Icon DOM-last → renders on the visual left (DS §2.5). */}
              <span className="flex shrink-0 items-center gap-2 font-rubik text-sm font-bold text-turquoise">
                <span>המשך לישיבה</span>
                <ArrowCircleLeft />
              </span>
            </Link>
          )}

          <SectionHeader>ישיבות עתידיות</SectionHeader>
          <DsCard className="mb-8 p-8 text-center" interactive={!!data.upcoming_meeting}>
            {data.upcoming_meeting ? (
              <Link to={`/meetings/${data.upcoming_meeting.id}`} className="block transition hover:opacity-80">
                <p className="font-rubik font-bold text-ink">
                  {KIND_LABELS[data.upcoming_meeting.kind]}
                  {data.upcoming_meeting.title && ` · ${data.upcoming_meeting.title}`}
                </p>
                <p className="mt-2 font-rubik text-sm text-ink-soft">
                  {data.upcoming_meeting.date}
                  {data.upcoming_meeting.time_start && ` ${data.upcoming_meeting.time_start}`}
                  {data.upcoming_meeting.location && ` · ${data.upcoming_meeting.location}`}
                </p>
              </Link>
            ) : (
              <p className="text-ink-soft">אין ישיבה קרובה</p>
            )}
          </DsCard>

          <SectionHeader>תאריכים שמורים</SectionHeader>
          <DsCard className="mb-8 p-4" interactive={false}>
            {editor && !addingDate && (
              <div className="mb-4 flex">
                <button
                  onClick={() => setAddingDate(true)}
                  className="inline-flex items-center gap-1.5 font-rubik text-sm font-medium text-turquoise transition hover:text-turquoise-dark"
                >
                  <span>הוסף תאריך</span>
                  <PlusIcon />
                </button>
              </div>
            )}

            {addingDate && (
              <form onSubmit={addSavedDate} className="mb-4 flex flex-wrap items-end gap-4">
                <div className="w-40">
                  <DsInput type="date" required value={newDate} onChange={setNewDate} />
                </div>
                <div className="w-40">
                  <DsSelect
                    value={newDateKind}
                    onChange={(v) => setNewDateKind(v as MeetingKind)}
                  >
                    <option value="meeting">ישיבת ועד</option>
                    <option value="assembly">אסיפה</option>
                  </DsSelect>
                </div>
                <div className="min-w-[12rem] flex-1">
                  <DsInput
                    placeholder="הערה (אופציונלי)"
                    value={newDateNote}
                    onChange={setNewDateNote}
                  />
                </div>
                <DsButton type="submit" size="compact" disabled={busy || !newDate}>
                  שמור
                </DsButton>
                <DsButton
                  variant="ghost"
                  size="compact"
                  onClick={() => setAddingDate(false)}
                  disabled={busy}
                >
                  ביטול
                </DsButton>
              </form>
            )}

            {data.saved_dates.length === 0 ? (
              <p className="text-sm text-ink-soft">אין תאריכים שמורים קרובים</p>
            ) : (
              <div className="flex flex-col gap-1">
                {data.saved_dates.map((sd) => (
                  <div
                    key={sd.id}
                    className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm transition hover:bg-turquoise/5"
                  >
                    <span>
                      {sd.date} · {KIND_LABELS[sd.kind]}
                      {sd.note && ` · ${sd.note}`}
                    </span>
                    {editor && (
                      <span className="flex shrink-0 gap-2">
                        <DsButton
                          variant="secondary"
                          size="micro"
                          onClick={() => convertSavedDate(sd.id)}
                          disabled={busy}
                          className="border"
                        >
                          הפוך לישיבה
                        </DsButton>
                        <DsButton
                          variant="destructive"
                          size="micro"
                          onClick={() => removeSavedDate(sd.id)}
                          disabled={busy}
                        >
                          הסר
                        </DsButton>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </DsCard>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className={`rounded-lg border p-4 text-center transition ${
                searchOpen
                  ? "border-turquoise bg-turquoise/10"
                  : "border-line bg-white hover:border-turquoise/40 hover:bg-turquoise/5"
              }`}
            >
              <p className="flex items-center justify-center gap-2 font-rubik text-lg font-bold text-turquoise">
                <SearchIcon />
                <span>חפש</span>
              </p>
              <p className="mt-1 font-rubik text-xs text-ink-soft">חיפוש בהחלטות</p>
            </button>
            <DsCard className="p-4 text-center" interactive={false}>
              <p className="font-rubik text-2xl font-bold text-ink">{data.protocols_count}</p>
              <p className="mt-1 font-rubik text-xs text-ink-soft">פרוטוקולים</p>
            </DsCard>
            <Link
              to="/action-items"
              className="rounded-lg border border-line bg-white p-4 text-center transition hover:border-turquoise/40 hover:bg-turquoise/5"
            >
              <p className="font-rubik text-2xl font-bold text-warning-dark">
                {data.open_action_items_count}
              </p>
              <p className="mt-1 font-rubik text-xs text-ink-soft">פריטי ביצוע פתוחים</p>
            </Link>
          </div>

          {searchOpen && (
            <DsCard className="mb-8 p-4" interactive={false}>
              <form onSubmit={runSearch} className="mb-4 flex gap-2">
                <div className="flex-1">
                  <DsInput
                    placeholder="חיפוש בהחלטות…"
                    value={query}
                    onChange={setQuery}
                  />
                </div>
                <DsButton
                  type="submit"
                  size="compact"
                  disabled={searching || !query.trim()}
                  icon={<SearchIcon />}
                >
                  חפש
                </DsButton>
              </form>
              {results === null && (
                <p className="text-sm text-ink-soft">הקלידו טקסט לחיפוש בהחלטות שהתקבלו.</p>
              )}
              {results !== null && results.length === 0 && (
                <p className="text-sm text-ink-soft">לא נמצאו החלטות תואמות.</p>
              )}
              {results !== null && results.length > 0 && (
                <div className="flex flex-col gap-2">
                  {results.map((r) => (
                    <Link
                      key={r.topic_id}
                      to={`/meetings/${r.meeting_id}`}
                      className="block rounded-md border border-line px-3 py-2 transition hover:border-turquoise/40 hover:bg-turquoise/5"
                    >
                      <p className="font-rubik text-xs text-ink-soft">
                        {KIND_LABELS[r.meeting_kind]}
                        {r.meeting_number && ` · מס׳ ${r.meeting_number}`} · {r.meeting_date} ·{" "}
                        {r.topic_title}
                      </p>
                      <p className="mt-1 text-sm">{r.decision_text}</p>
                    </Link>
                  ))}
                </div>
              )}
            </DsCard>
          )}

          <SectionHeader>פרוטוקולים אחרונים</SectionHeader>

          {data.recent_protocols.length === 0 ? (
            <p className="text-sm text-ink-soft">אין עדיין פרוטוקולים.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {data.recent_protocols.map((m) => (
                <Link
                  key={m.id}
                  to={`/meetings/${m.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg border border-line bg-white px-4 py-3 transition hover:border-turquoise/40 hover:bg-turquoise/5"
                >
                  <span className="text-sm">
                    {KIND_LABELS[m.kind]} {m.number}
                    <span className="mr-2 text-ink-soft">{m.date}</span>
                  </span>
                  <StatusPill variant={STATUS_VARIANTS[m.status]}>
                    {STATUS_LABELS[m.status]}
                  </StatusPill>
                </Link>
              ))}
            </div>
          )}

          <div className="mt-4">
            <Link
              to="/meetings"
              className="font-rubik text-sm font-medium text-turquoise transition hover:text-turquoise-dark"
            >
              כל הפרוטוקולים ←
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

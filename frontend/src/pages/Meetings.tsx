import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, apiErrorMessage, type MeetingListItem, type MeetingStatus } from "../lib/api";
import { KIND_LABELS, STATUS_LABELS, STATUS_VARIANTS } from "../lib/meetingLabels";
import { useIsAdmin, useIsEditor } from "../components/Layout";
import {
  DsButton,
  DsInput,
  DsSelect,
  Field,
  PageHeader,
  StatusPill,
  TrashIcon,
} from "../components/klaser-ds";

/** Shared list page for both the ישיבות area (board meetings) and the אסיפות
 * area (assemblies) — same flow, different kind. `section` selects which
 * kind(s) the page shows and creates. */
export default function Meetings({ section = "board" }: { section?: "board" | "assembly" }) {
  const isAssembly = section === "assembly";
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
        kind: isAssembly ? "assembly" : undefined,
        status: (status || undefined) as MeetingStatus | undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      })
      // The board list shows only ישיבות (assemblies live in their own area);
      // the assembly list is already kind-filtered server-side.
      .then((list) => setMeetings(isAssembly ? list : list.filter((m) => m.kind !== "assembly")))
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, dateFrom, dateTo, section]);

  // Instant-create + redirect straight to the meeting's setup screen —
  // same pattern as Home.tsx's create buttons, see that file for why.
  async function createAndGo() {
    setCreating(true);
    setError(null);
    try {
      const meeting = await api.createMeeting({ kind: isAssembly ? "assembly" : "meeting" });
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
<PageHeader
        title={isAssembly ? "אסיפות" : "ישיבות"}
        actions={
          editor && (
            <DsButton onClick={createAndGo} disabled={creating} size="compact">
              {isAssembly ? "אסיפה חדשה" : "ישיבה חדשה"}
            </DsButton>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="w-48">
          <Field label="סטטוס">
            <DsSelect value={status} onChange={setStatus}>
              <option value="">כל הסטטוסים</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </DsSelect>
          </Field>
        </div>
        <div className="w-40">
          <Field label="מתאריך">
            <DsInput type="date" value={dateFrom} onChange={setDateFrom} />
          </Field>
        </div>
        <div className="w-40">
          <Field label="עד תאריך">
            <DsInput type="date" value={dateTo} onChange={setDateTo} />
          </Field>
        </div>
        {hasFilters && (
          <DsButton
            variant="ghost"
            size="compact"
            onClick={() => {
              setStatus("");
              setDateFrom("");
              setDateTo("");
            }}
          >
            נקה סינון
          </DsButton>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {meetings === null && !error && <p className="animate-pulse text-sm text-ink-soft">טוען…</p>}

      {meetings && meetings.length === 0 && (
        <p className="text-ink-soft">
          {hasFilters
            ? `לא נמצאו ${isAssembly ? "אסיפות" : "ישיבות"} התואמות לסינון.`
            : isAssembly
              ? `אין עדיין אסיפות. ${editor ? 'לחצו על "אסיפה חדשה" כדי להתחיל.' : ""}`
              : `אין עדיין ישיבות. ${editor ? 'לחצו על "ישיבה חדשה" כדי להתחיל.' : ""}`}
        </p>
      )}

      {meetings && meetings.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-[0px_1px_0_rgba(0,0,0,0.03),0px_4px_16px_-4px_rgba(0,0,0,0.06)]">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface font-rubik text-xs uppercase tracking-[0.1em] text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">מספר</th>
                <th className="px-4 py-3 font-medium">כותרת</th>
                <th className="px-4 py-3 font-medium">סוג</th>
                <th className="px-4 py-3 font-medium">תאריך</th>
                <th className="px-4 py-3 font-medium">סטטוס</th>
                {admin && <th className="px-4 py-3 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id} className="border-t border-line transition hover:bg-turquoise/5">
                  <td className="px-4 py-3">
                    <Link
                      to={`/meetings/${m.id}`}
                      className="font-medium text-turquoise hover:text-turquoise-dark hover:underline"
                    >
                      {m.number || "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{m.title || "(ללא כותרת)"}</td>
                  <td className="px-4 py-3">{KIND_LABELS[m.kind]}</td>
                  <td className="px-4 py-3">{m.date}</td>
                  <td className="px-4 py-3">
                    <StatusPill variant={STATUS_VARIANTS[m.status]}>
                      {STATUS_LABELS[m.status]}
                    </StatusPill>
                  </td>
                  {admin && (
                    <td className="px-4 py-3 text-left">
                      {confirmId === m.id ? (
                        <span className="flex items-center gap-2 whitespace-nowrap font-rubik text-xs">
                          <span className="text-danger">למחוק לצמיתות?</span>
                          <DsButton
                            variant="destructive"
                            size="micro"
                            onClick={() => confirmDelete(m.id)}
                            disabled={deletingId === m.id}
                          >
                            {deletingId === m.id ? "מוחק…" : "מחק"}
                          </DsButton>
                          <DsButton
                            variant="ghost"
                            size="micro"
                            onClick={() => setConfirmId(null)}
                            disabled={deletingId === m.id}
                          >
                            ביטול
                          </DsButton>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmId(m.id)}
                          className="rounded-md p-2 text-ink-soft transition hover:bg-danger/10 hover:text-danger"
                          aria-label="מחק ישיבה"
                          title="מחק ישיבה"
                        >
                          <TrashIcon />
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

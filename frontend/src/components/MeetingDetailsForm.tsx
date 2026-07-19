import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Meeting } from "../lib/api";

/** Editable "פרטי ישיבה" block — number/date/times/location/online link/
 * notes. Only rendered during the prep phase (draft/invited_*) for
 * editors; a manual "שמור" button rather than per-field autosave, so a
 * half-edited set of fields never partially applies mid-typing. */
export default function MeetingDetailsForm({
  meeting,
  onSaved,
}: {
  meeting: Meeting;
  onSaved: () => void;
}) {
  const [number, setNumber] = useState(meeting.number || "");
  const [title, setTitle] = useState(meeting.title || "");
  const [date, setDate] = useState(meeting.date);
  const [timeStart, setTimeStart] = useState(meeting.time_start || "");
  const [timeEnd, setTimeEnd] = useState(meeting.time_end || "");
  const [location, setLocation] = useState(meeting.location || "");
  const [onlineUrl, setOnlineUrl] = useState(meeting.online_meeting_url || "");
  const [notes, setNotes] = useState(meeting.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    number !== (meeting.number || "") ||
    title !== (meeting.title || "") ||
    date !== meeting.date ||
    timeStart !== (meeting.time_start || "") ||
    timeEnd !== (meeting.time_end || "") ||
    location !== (meeting.location || "") ||
    onlineUrl !== (meeting.online_meeting_url || "") ||
    notes !== (meeting.notes || "");

  // Re-sync local fields whenever a fresh `meeting` prop comes in — BUT
  // only if there's nothing unsaved. Without the `dirty` guard, typing a
  // number (or any field) and then clicking literally any other action
  // on the page before hitting "שמור" (send invites, add a topic, open
  // the meeting...) triggers a reload elsewhere, hands this component a
  // new `meeting` object, and this effect used to blindly overwrite the
  // in-progress typed value back to whatever the server still had —
  // silently discarding it. Skipping the resync while dirty means the
  // user's unsaved edits survive until they explicitly save or navigate
  // away (which remounts the component fresh via the `meeting.id` key).
  useEffect(() => {
    if (dirty) return;
    setNumber(meeting.number || "");
    setTitle(meeting.title || "");
    setDate(meeting.date);
    setTimeStart(meeting.time_start || "");
    setTimeEnd(meeting.time_end || "");
    setLocation(meeting.location || "");
    setOnlineUrl(meeting.online_meeting_url || "");
    setNotes(meeting.notes || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meeting]);

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await api.updateMeeting(meeting.id, {
        number: number.trim() || null,
        title: title.trim() || null,
        date,
        time_start: timeStart || null,
        time_end: timeEnd || null,
        location: location.trim() || null,
        online_meeting_url: onlineUrl.trim() || null,
        notes: notes.trim() || null,
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-soft">פרטי ישיבה</h2>
        <div className="flex items-center gap-2">
          {saved && !dirty && <span className="text-xs text-emerald-700">נשמר</span>}
          <button
            onClick={save}
            disabled={busy || !dirty}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            שמור
          </button>
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-red-700">{error}</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-soft">מספר ישיבה</span>
          <input
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="ייקבע אוטומטית בעת הפרסום אם יישאר ריק"
            className="w-full rounded border border-line-strong px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-soft">תאריך *</span>
          <input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded border border-line-strong px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-soft">שעת התחלה</span>
          <input
            type="time"
            value={timeStart}
            onChange={(e) => setTimeStart(e.target.value)}
            className="w-full rounded border border-line-strong px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-soft">שעת סיום</span>
          <input
            type="time"
            value={timeEnd}
            onChange={(e) => setTimeEnd(e.target.value)}
            className="w-full rounded border border-line-strong px-3 py-2"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-ink-soft">כותרת (אופציונלי)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-line-strong px-3 py-2"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-ink-soft">מקום</span>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded border border-line-strong px-3 py-2"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-ink-soft">קישור לפגישה מקוונת (אופציונלי)</span>
          <input
            type="text"
            value={onlineUrl}
            onChange={(e) => setOnlineUrl(e.target.value)}
            placeholder="https://zoom.us/... או https://meet.google.com/..."
            className="w-full rounded border border-line-strong px-3 py-2"
            dir="ltr"
          />
          <span className="mt-1 block text-xs text-ink-soft">הקישור יישלח אוטומטית בהזמנת המייל למוזמנים</span>
        </label>
        <label className="text-sm sm:col-span-2">
          <span className="mb-1 block font-medium text-ink-soft">הערות</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded border border-line-strong px-3 py-2"
          />
        </label>
      </div>
    </div>
  );
}

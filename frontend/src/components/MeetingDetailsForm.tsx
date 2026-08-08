import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Meeting } from "../lib/api";
import {
  DsButton,
  DsCard,
  DsInput,
  DsTextarea,
  Field,
  SectionHeader,
  StatusPill,
} from "./klaser-ds";

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
    <DsCard interactive={false} className="mb-8 p-4">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex-1">
          <SectionHeader className="mb-0">פרטי ישיבה</SectionHeader>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {saved && !dirty && <StatusPill variant="success">נשמר</StatusPill>}
          <DsButton size="compact" onClick={save} disabled={busy || !dirty}>
            שמור
          </DsButton>
        </div>
      </div>

      {error && <p className="mb-4 text-sm text-danger">{error}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="מספר ישיבה">
          <DsInput
            value={number}
            onChange={setNumber}
            placeholder="ייקבע אוטומטית בעת הפרסום אם יישאר ריק"
          />
        </Field>
        <Field label="תאריך *">
          <DsInput type="date" required value={date} onChange={setDate} />
        </Field>
        <Field label="שעת התחלה">
          <DsInput type="time" value={timeStart} onChange={setTimeStart} />
        </Field>
        <Field label="שעת סיום">
          <DsInput type="time" value={timeEnd} onChange={setTimeEnd} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="כותרת (אופציונלי)">
            <DsInput value={title} onChange={setTitle} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="מקום">
            <DsInput value={location} onChange={setLocation} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field
            label="קישור לפגישה מקוונת (אופציונלי)"
            hint="יישלח אוטומטית בהזמנת המייל למוזמנים"
          >
            <DsInput
              value={onlineUrl}
              onChange={setOnlineUrl}
              placeholder="https://zoom.us/... או https://meet.google.com/..."
              dir="ltr"
            />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="הערות">
            <DsTextarea value={notes} onChange={setNotes} rows={2} />
          </Field>
        </div>
      </div>
    </DsCard>
  );
}

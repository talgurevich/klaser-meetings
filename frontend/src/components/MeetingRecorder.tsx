import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage, type MeetingRecording } from "../lib/api";

function fmtDuration(sec: number | null): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** "הקלטה וסיכום AI" — records the meeting via the browser mic (desktop or
 * phone) or accepts an uploaded audio file, saving it to the meeting. The
 * transcription + per-topic summary layer will build on the stored audio
 * later; for now this captures and lists the recordings. */
export default function MeetingRecorder({ meetingId }: { meetingId: string }) {
  const [recordings, setRecordings] = useState<MeetingRecording[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function load() {
    api
      .listRecordings(meetingId)
      .then(setRecordings)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(() => {
    load();
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  async function startRecording() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("הדפדפן לא תומך בהקלטה. אפשר להעלות קובץ אודיו במקום.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const seconds = Math.round((Date.now() - startedAtRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        await uploadBlob(blob, "mic", seconds, `הקלטת-ישיבה-${Date.now()}.webm`);
      };
      mediaRef.current = rec;
      startedAtRef.current = Date.now();
      rec.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(
        () => setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000)),
        1000,
      );
    } catch {
      setError("אין גישה למיקרופון. יש לאשר הרשאה בדפדפן, או להעלות קובץ אודיו.");
    }
  }

  function stopRecording() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setRecording(false);
    mediaRef.current?.stop();
  }

  async function uploadBlob(blob: Blob, source: "mic" | "upload", seconds: number | null, filename: string) {
    setBusy(true);
    setError(null);
    try {
      await api.uploadRecording(meetingId, blob, { filename, durationSeconds: seconds, source });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadBlob(file, "upload", null, file.name);
  }

  async function play(rec: MeetingRecording) {
    if (playingId === rec.id) {
      setPlayingId(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      return;
    }
    setError(null);
    try {
      const blob = await api.getRecordingAudioBlob(meetingId, rec.id);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(blob));
      setPlayingId(rec.id);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function remove(rec: MeetingRecording) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteRecording(meetingId, rec.id);
      if (playingId === rec.id) {
        setPlayingId(null);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50/60 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 font-display text-base font-bold text-violet-800">
            <span aria-hidden>✨</span> הקלטה וסיכום AI
          </h3>
          <p className="mt-1 text-sm text-violet-900/70">
            הקלט את הישיבה — המערכת תתמלל ותכין טיוטות סיכום לכל נושא לאישורך לפני שייכנסו לפרוטוקול.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!recording && (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-white px-4 py-2 text-sm font-medium hover:bg-line disabled:opacity-50"
            >
              ⬆ העלה קובץ אודיו
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={onFilePicked}
          />
          {recording ? (
            <button
              onClick={stopRecording}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
              עצור הקלטה · {fmtDuration(elapsed)}
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              🎙 התחל הקלטה
            </button>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {busy && !recording && <p className="mt-3 text-sm text-violet-900/70">מעלה…</p>}

      {recordings && recordings.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-violet-200 pt-3">
          {recordings.map((rec) => (
            <li
              key={rec.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <span className="font-medium">
                  {rec.source === "mic" ? "🎙 הקלטה" : "📁 קובץ"} ·{" "}
                  {new Date(rec.created_at).toLocaleString("he-IL")}
                </span>
                <span className="text-ink-soft">
                  {" "}
                  · {fmtSize(rec.size_bytes)}
                  {rec.duration_seconds != null ? ` · ${fmtDuration(rec.duration_seconds)}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => play(rec)} className="text-xs text-accent-dark hover:underline">
                  {playingId === rec.id ? "סגור" : "▶ נגן"}
                </button>
                <button
                  onClick={() => remove(rec)}
                  disabled={busy}
                  className="text-xs text-red-700 hover:underline disabled:opacity-50"
                >
                  מחק
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {playingId && audioUrl && (
        <audio src={audioUrl} controls autoPlay className="mt-3 w-full" />
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage, type MeetingRecording } from "../lib/api";
import { DsButton, MicIcon, StopIcon, TrashIcon, UploadCloudIcon } from "./klaser-ds";

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

/** Per-topic audio recorder. Records via the browser mic (desktop/phone) or
 * accepts an uploaded file, tagged to this topic and named after it. The
 * recordings list stays visible in the topic card so a finished recording is
 * always accessible for playback/download. */
export default function TopicRecorder({
  meetingId,
  topicId,
  topicTitle,
  recordings,
  canRecord,
  onChanged,
}: {
  meetingId: string;
  topicId: string;
  topicTitle: string;
  recordings: MeetingRecording[];
  canRecord: boolean;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseName = (topicTitle || "הקלטה").trim().replace(/[\\/:*?"<>|]/g, "-").slice(0, 60);

  async function uploadBlob(blob: Blob, source: "mic" | "upload", seconds: number | null, ext: string) {
    setBusy(true);
    setError(null);
    try {
      await api.uploadRecording(meetingId, blob, {
        filename: `${baseName}.${ext}`,
        durationSeconds: seconds,
        source,
        topicId,
      });
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

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
        await uploadBlob(blob, "mic", seconds, "webm");
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

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop() || "audio";
    await uploadBlob(file, "upload", null, ext);
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
      onChanged();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-turquoise/30 bg-turquoise/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-rubik text-xs font-bold text-turquoise">הקלטת הנושא</span>
        {canRecord &&
          (recording ? (
            <button
              onClick={stopRecording}
              className="inline-flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 font-rubik text-xs font-medium text-white transition hover:brightness-95"
            >
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
              <span>עצור · {fmtDuration(elapsed)}</span>
              <StopIcon />
            </button>
          ) : (
            <button
              onClick={startRecording}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-danger px-3 py-1.5 font-rubik text-xs font-medium text-white transition hover:brightness-95 disabled:opacity-50"
            >
              <span>התחל הקלטה</span>
              <MicIcon />
            </button>
          ))}
        {canRecord && !recording && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-turquoise bg-white px-3 py-1.5 font-rubik text-xs font-medium text-turquoise transition hover:bg-turquoise hover:text-white disabled:opacity-50"
            >
              <span>העלה קובץ</span>
              <UploadCloudIcon />
            </button>
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={onFilePicked} />
          </>
        )}
        {busy && !recording && <span className="font-rubik text-xs text-ink-soft">מעלה…</span>}
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {recordings.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {recordings.map((rec) => (
            <li
              key={rec.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-white px-3 py-1.5 font-rubik text-xs"
            >
              <span className="min-w-0 truncate text-ink-soft">
                {new Date(rec.created_at).toLocaleString("he-IL")} · {fmtSize(rec.size_bytes)}
                {rec.duration_seconds != null ? ` · ${fmtDuration(rec.duration_seconds)}` : ""}
              </span>
              <span className="flex items-center gap-3">
                <DsButton variant="ghost" size="micro" onClick={() => play(rec)}>
                  {playingId === rec.id ? "סגור" : "▶ נגן"}
                </DsButton>
                {canRecord && (
                  <DsButton
                    variant="destructive"
                    size="micro"
                    onClick={() => remove(rec)}
                    disabled={busy}
                    icon={<TrashIcon />}
                  >
                    מחק
                  </DsButton>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {playingId && audioUrl && <audio src={audioUrl} controls autoPlay className="mt-2 w-full" />}
    </div>
  );
}

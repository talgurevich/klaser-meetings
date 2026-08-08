import { useEffect, useState } from "react";
import type { MeetingRecording, Topic } from "../lib/api";
import TopicRecorder from "./TopicRecorder";
import { TOPIC_STATUS_LABELS, TOPIC_STATUS_VARIANTS } from "../lib/meetingLabels";
import {
  ArrowCircleLeft,
  CheckMarkIcon,
  CloseIcon,
  DsButton,
  DsCard,
  DsTag,
  DsTextarea,
  ExternalLinkIcon,
  PencilIcon,
  StatusPill,
} from "./klaser-ds";

function formatElapsed(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function LiveTopicCard({
  topic,
  index,
  editable,
  isTiming,
  timerStartedAt,
  busy,
  onStartDiscussion,
  onPauseTimer,
  onReset,
  onOpenClose,
  onSaveNotes,
  onDefer,
  onUndoDefer,
  onCancel,
  onEdit,
  prevProtocol,
  sendToAssembly,
  meetingId,
  recordings,
  canRecord,
  onRecordingsChanged,
}: {
  topic: Topic;
  index: number;
  editable: boolean;
  isTiming: boolean;
  timerStartedAt: number | null;
  busy: boolean;
  onStartDiscussion: () => void;
  onPauseTimer: () => void;
  onReset: () => void;
  onOpenClose: (notes: string) => void;
  onSaveNotes: (notes: string) => void;
  onDefer: () => void;
  onUndoDefer: () => void;
  onCancel: () => void;
  onEdit: () => void;
  prevProtocol?: { label: string; busy: boolean; onOpen: () => void } | null;
  sendToAssembly?: { sent: boolean; busy: boolean; onSend: () => void } | null;
  meetingId: string;
  recordings: MeetingRecording[];
  canRecord: boolean;
  onRecordingsChanged: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [notes, setNotes] = useState(topic.topic_notes || "");

  useEffect(() => {
    if (!isTiming) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [isTiming]);

  const baseElapsed = topic.timer_elapsed || 0;
  const liveExtra =
    isTiming && timerStartedAt ? Math.floor((Date.now() - timerStartedAt) / 1000) : 0;
  void tick; // re-render trigger only

  const displayElapsed = baseElapsed + liveExtra;
  const finished = ["done", "deferred", "skipped", "cancelled"].includes(topic.status);

  // The timer is "tuned to" the topic's planned discussion time (set in
  // the prep list) — shown as elapsed/planned and flagged once elapsed
  // passes it, rather than just an anonymous stopwatch.
  const plannedSeconds = topic.duration_minutes ? topic.duration_minutes * 60 : null;
  const overBudget = plannedSeconds !== null && displayElapsed > plannedSeconds;

  return (
    <DsCard interactive={false} className="p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {index}. {topic.title}
            </p>
            <StatusPill variant={TOPIC_STATUS_VARIANTS[topic.status]}>
              {TOPIC_STATUS_LABELS[topic.status]}
            </StatusPill>
            {topic.is_private && <DsTag>פרטי</DsTag>}
            {topic.from_committee_meeting && (
              <StatusPill variant="teal">הועבר מפגישת הועד</StatusPill>
            )}
          </div>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "הרחב" : "כווץ"}
          className="shrink-0 rounded-md px-2 py-1 text-ink-soft transition hover:bg-turquoise/10 hover:text-turquoise"
        >
          {collapsed ? "︿" : "﹀"}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="mt-4 flex items-center gap-2">
            {editable && !finished && (
              <>
                <button
                  onClick={onReset}
                  disabled={busy}
                  title="איפוס טיימר"
                  aria-label="איפוס טיימר"
                  className="rounded-md border border-line px-2 py-1 text-sm text-ink-soft transition hover:border-turquoise hover:text-turquoise disabled:opacity-50"
                >
                  ↺
                </button>
                {isTiming ? (
                  <button
                    onClick={onPauseTimer}
                    disabled={busy}
                    title="השהה טיימר"
                    aria-label="השהה טיימר"
                    className="rounded-md border border-line px-2 py-1 text-sm text-ink-soft transition hover:border-turquoise hover:text-turquoise disabled:opacity-50"
                  >
                    ⏸
                  </button>
                ) : (
                  <button
                    onClick={onStartDiscussion}
                    disabled={busy}
                    title={topic.status === "pending" ? "התחל דיון" : "המשך טיימר"}
                    aria-label="התחל טיימר"
                    className="rounded-md border border-line px-2 py-1 text-sm text-ink-soft transition hover:border-turquoise hover:text-turquoise disabled:opacity-50"
                  >
                    ▶
                  </button>
                )}
              </>
            )}
            <span className="font-mono text-lg tabular-nums">
              <span className={overBudget ? "font-bold text-danger" : "text-ink-soft"}>
                {formatElapsed(displayElapsed)}
              </span>
              {plannedSeconds !== null && (
                <span className="text-ink-soft"> / {formatElapsed(plannedSeconds)}</span>
              )}
            </span>
            {overBudget && <StatusPill variant="danger">חריגה מהזמן המתוכנן</StatusPill>}
          </div>

          {prevProtocol && (
            <div className="mt-4">
              <DsButton
                variant="secondary"
                size="micro"
                className="border"
                onClick={prevProtocol.onOpen}
                disabled={prevProtocol.busy}
                icon={<ExternalLinkIcon />}
              >
                {prevProtocol.busy ? "טוען…" : prevProtocol.label}
              </DsButton>
            </div>
          )}

          {finished && (
            <div className="mt-4 flex flex-col gap-2 rounded-md bg-surface p-4 text-sm">
              {topic.decision_text && (
                <p>
                  <span className="font-medium text-ink-soft">החלטה: </span>
                  {topic.decision_text}
                </p>
              )}
              {topic.action_item && (
                <p>
                  <span className="font-medium text-ink-soft">משימת המשך: </span>
                  {topic.action_item}
                </p>
              )}
              {topic.status === "deferred" && (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink-soft">נדחה לישיבה הבאה.</p>
                  {editable && (
                    <DsButton
                      variant="ghost"
                      size="micro"
                      className="shrink-0"
                      onClick={onUndoDefer}
                      disabled={busy}
                    >
                      ↺ בטל דחייה
                    </DsButton>
                  )}
                </div>
              )}
              {topic.status === "cancelled" && <p className="text-ink-soft">הנושא בוטל.</p>}
              {editable && topic.status === "done" && (
                // DS §2.5 — `justify-end` places this on the visual LEFT.
                <div className="flex justify-end pt-1">
                  <DsButton
                    variant="ghost"
                    size="micro"
                    onClick={onEdit}
                    disabled={busy}
                    icon={<PencilIcon />}
                  >
                    ערוך החלטה
                  </DsButton>
                </div>
              )}
            </div>
          )}

          {editable && !finished && (
            <div className="mt-4">
              <label className="mb-2 block font-rubik text-xs font-medium text-turquoise">
                הערות
              </label>
              <DsTextarea
                value={notes}
                onChange={setNotes}
                onBlur={() => {
                  if (notes !== (topic.topic_notes || "")) onSaveNotes(notes);
                }}
                rows={2}
                placeholder="הערות לנושא — יתווספו לסגירת הנושא"
              />
            </div>
          )}

          {editable && !finished && (
            <div className="mt-4 flex flex-wrap gap-2">
              <DsButton
                size="micro"
                onClick={() => onOpenClose(notes)}
                disabled={busy}
                icon={<CheckMarkIcon />}
              >
                סגור נושא
              </DsButton>
              <button
                onClick={onDefer}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md border border-warning bg-white px-3 py-1.5 font-rubik text-xs font-medium text-warning-dark transition hover:bg-warning hover:text-white disabled:opacity-50"
              >
                <span>העבר לישיבה הבאה</span>
                <span aria-hidden>←</span>
              </button>
              <DsButton
                variant="destructive"
                size="micro"
                onClick={onCancel}
                disabled={busy}
                icon={<CloseIcon />}
              >
                בטל נושא
              </DsButton>
            </div>
          )}

          {sendToAssembly && (
            <div className="mt-3">
              {sendToAssembly.sent ? (
                <StatusPill variant="teal">
                  <CheckMarkIcon />
                  <span>נשלח לאסיפה</span>
                </StatusPill>
              ) : (
                <button
                  onClick={sendToAssembly.onSend}
                  disabled={sendToAssembly.busy}
                  className="inline-flex items-center gap-1.5 rounded-md border border-turquoise bg-white px-3 py-1.5 font-rubik text-xs font-medium text-turquoise transition hover:bg-turquoise hover:text-white disabled:opacity-50"
                >
                  <span>שלח לאסיפה</span>
                  <ArrowCircleLeft />
                </button>
              )}
            </div>
          )}

          {(canRecord || recordings.length > 0) && (
            <TopicRecorder
              meetingId={meetingId}
              topicId={topic.id}
              topicTitle={topic.title}
              recordings={recordings}
              canRecord={canRecord}
              onChanged={onRecordingsChanged}
            />
          )}
        </>
      )}
    </DsCard>
  );
}

import { useEffect, useState } from "react";
import type { Topic } from "../lib/api";
import { TOPIC_STATUS_COLORS, TOPIC_STATUS_LABELS } from "../lib/meetingLabels";

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
  onCreateFollowUp,
  onSkip,
  onDefer,
  onUndoDefer,
  onCancel,
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
  onOpenClose: () => void;
  onCreateFollowUp: () => void;
  onSkip: () => void;
  onDefer: () => void;
  onUndoDefer: () => void;
  onCancel: () => void;
}) {
  const [tick, setTick] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

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
    <div className="rounded border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {index}. {topic.title}
            </p>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${TOPIC_STATUS_COLORS[topic.status]}`}
            >
              {TOPIC_STATUS_LABELS[topic.status]}
            </span>
            {topic.is_private && (
              <span className="rounded bg-line px-1.5 py-0.5 text-xs text-ink-soft">פרטי</span>
            )}
          </div>
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "הרחב" : "כווץ"}
          className="rounded px-1.5 py-0.5 text-ink-soft hover:bg-line"
        >
          {collapsed ? "︿" : "﹀"}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="mt-3 flex items-center gap-2">
            {editable && !finished && (
              <>
                <button
                  onClick={onReset}
                  disabled={busy}
                  title="איפוס טיימר"
                  aria-label="איפוס טיימר"
                  className="rounded border border-line-strong px-2 py-1 text-sm hover:bg-line disabled:opacity-50"
                >
                  ↺
                </button>
                {isTiming ? (
                  <button
                    onClick={onPauseTimer}
                    disabled={busy}
                    title="השהה טיימר"
                    aria-label="השהה טיימר"
                    className="rounded border border-line-strong px-2 py-1 text-sm hover:bg-line disabled:opacity-50"
                  >
                    ⏸
                  </button>
                ) : (
                  <button
                    onClick={onStartDiscussion}
                    disabled={busy}
                    title={topic.status === "pending" ? "התחל דיון" : "המשך טיימר"}
                    aria-label="התחל טיימר"
                    className="rounded border border-line-strong px-2 py-1 text-sm hover:bg-line disabled:opacity-50"
                  >
                    ▶
                  </button>
                )}
              </>
            )}
            <span className="font-mono text-lg tabular-nums">
              <span className={overBudget ? "font-bold text-red-600" : "text-ink-soft"}>
                {formatElapsed(displayElapsed)}
              </span>
              {plannedSeconds !== null && (
                <span className="text-ink-soft"> / {formatElapsed(plannedSeconds)}</span>
              )}
            </span>
            {overBudget && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                חריגה מהזמן המתוכנן
              </span>
            )}
          </div>

          {finished && (
            <div className="mt-3 space-y-1 rounded bg-surface p-3 text-sm">
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
                    <button
                      onClick={onUndoDefer}
                      disabled={busy}
                      className="shrink-0 text-xs text-accent-dark hover:underline disabled:opacity-50"
                    >
                      ↺ בטל דחייה
                    </button>
                  )}
                </div>
              )}
              {topic.status === "cancelled" && <p className="text-ink-soft">הנושא בוטל.</p>}
            </div>
          )}

          {editable && !finished && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={onOpenClose}
                disabled={busy}
                className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                ✓ סגור נושא
              </button>
              <button
                onClick={onCreateFollowUp}
                disabled={busy}
                className="rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-line disabled:opacity-50"
              >
                ☑ צור מעקב
              </button>
              <button
                onClick={onSkip}
                disabled={busy}
                className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-line disabled:opacity-50"
              >
                ⏭ דלג
              </button>
              <button
                onClick={onDefer}
                disabled={busy}
                className="rounded border border-amber-300 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              >
                → העבר לישיבה הבאה
              </button>
              <button
                onClick={onCancel}
                disabled={busy}
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                ✕ בטל נושא
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

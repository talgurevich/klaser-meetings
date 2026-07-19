import type { MeetingStatus } from "../lib/api";
import { STATUS_DESCRIPTIONS, STATUS_LABELS, STATUS_ORDER } from "../lib/meetingLabels";

/** Horizontal milestone progress bar for the meeting detail page — a
 * quick "where am I in the process" overview on top of the more precise
 * status badge/actions below it. Purely visual (no click-to-jump — status
 * changes still only happen through the real actions: InviteActions,
 * the lock-meeting button, approval panels, etc). Each circle carries a
 * Hebrew tooltip (STATUS_DESCRIPTIONS) explaining what that stage means. */
export default function StatusStepper({ status }: { status: MeetingStatus }) {
  const currentIdx = STATUS_ORDER.indexOf(status);
  const n = STATUS_ORDER.length;
  const lastIdx = n - 1;
  const colWidthPct = 100 / n;
  // Progress line's right edge lands exactly at the current step's circle
  // center (each circle sits at the horizontal center of its column) —
  // except once the terminal step (archived) is reached, where there's no
  // "next" step left to point toward, so the bar fills all the way.
  const progressPct = currentIdx === lastIdx ? 100 : (currentIdx + 0.5) * colWidthPct;

  return (
    <div className="relative mb-6 pt-1" dir="rtl">
      <div className="absolute right-0 left-0 top-5 h-0.5 bg-line" />
      <div
        className="absolute right-0 top-5 h-0.5 bg-accent transition-all"
        style={{ width: `${progressPct}%` }}
      />
      <div className="relative flex">
        {STATUS_ORDER.map((s, i) => {
          const current = i === currentIdx;
          // The terminal step (archived) has nothing after it — once
          // reached, it's not "in progress," it's done, so it gets the
          // same checkmark as every earlier completed step.
          const done = i < currentIdx || (current && i === lastIdx);
          return (
            <div
              key={s}
              className="group relative flex flex-col items-center"
              style={{ width: `${colWidthPct}%` }}
            >
              <div
                className={`flex h-8 w-8 shrink-0 cursor-default items-center justify-center rounded-full border-2 text-xs font-semibold ${
                  done
                    ? "border-accent bg-accent text-white"
                    : current
                      ? "border-accent bg-white text-accent-dark"
                      : "border-line bg-white text-ink-soft"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span
                className={`mt-2 px-0.5 text-center text-[11px] leading-tight ${
                  current ? "font-semibold text-ink" : "text-ink-soft"
                }`}
              >
                {STATUS_LABELS[s]}
              </span>

              <div className="pointer-events-none absolute bottom-full z-10 mb-2 hidden w-52 rounded bg-ink px-2.5 py-1.5 text-center text-xs leading-snug text-white group-hover:block">
                {STATUS_DESCRIPTIONS[s]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

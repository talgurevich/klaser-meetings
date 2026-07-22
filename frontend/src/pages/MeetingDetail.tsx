import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, apiErrorMessage, type Meeting, type MeetingStatus, type Topic, type TopicPoolItem } from "../lib/api";
import {
  KIND_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  STATUS_ORDER,
  TOPIC_POOL_STATUS_LABELS,
} from "../lib/meetingLabels";
import { useIsEditor } from "../components/Layout";
import { useAuth } from "../lib/auth";
import AttendanceList from "../components/AttendanceList";
import LiveTopicCard from "../components/LiveTopicCard";
import CloseTopicModal, { type CloseTopicValues } from "../components/CloseTopicModal";
import FollowUpModal from "../components/FollowUpModal";
import ApprovalPanel from "../components/ApprovalPanel";
import MeetingDetailsForm from "../components/MeetingDetailsForm";
import InviteesPanel from "../components/InviteesPanel";
import InviteActions from "../components/InviteActions";
import PublishModal from "../components/PublishModal";
import StatusStepper from "../components/StatusStepper";

const PREP_STATUSES: MeetingStatus[] = ["draft", "invited_internal", "invited_public"];

/** Inline "X דק' לדיון" field on a prep-list topic row. Local text state,
 * saved on blur/Enter rather than per-keystroke — an onChange-triggered
 * save would disable the input mid-typing every time the parent's `busy`
 * flag flips true for the in-flight request, making it impossible to
 * type more than one digit at a time. */
function TopicDurationInput({
  topic,
  disabled,
  onSave,
}: {
  topic: Topic;
  disabled: boolean;
  onSave: (minutes: number | null) => void;
}) {
  const [value, setValue] = useState(topic.duration_minutes != null ? String(topic.duration_minutes) : "");

  useEffect(() => {
    setValue(topic.duration_minutes != null ? String(topic.duration_minutes) : "");
  }, [topic.duration_minutes]);

  function commit() {
    const n = Number(value);
    const minutes = value.trim() && n > 0 ? n : null;
    if (minutes !== topic.duration_minutes) onSave(minutes);
  }

  return (
    <label className="mt-1 flex items-center gap-1 text-xs text-ink-soft">
      <input
        type="number"
        min={1}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="—"
        className="w-14 rounded border border-line-strong px-1.5 py-0.5 text-center"
      />
      דק׳ לדיון
    </label>
  );
}

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const editor = useIsEditor();
  const { state: authState } = useAuth();
  const currentUserId = authState.kind === "signed_in" ? authState.user.id : undefined;
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicDuration, setNewTopicDuration] = useState("");
  const [busy, setBusy] = useState(false);

  // Live-meeting timer: only one topic can be "running" at a time. The
  // running total isn't persisted until paused/closed/skipped/deferred —
  // an accepted MVP tradeoff (a page refresh mid-timer loses the
  // in-flight segment, not previously saved time).
  const [timingTopicId, setTimingTopicId] = useState<string | null>(null);
  const [timerStartedAt, setTimerStartedAt] = useState<number | null>(null);
  const [closingTopic, setClosingTopic] = useState<Topic | null>(null);
  const [followUpTopic, setFollowUpTopic] = useState<Topic | null>(null);
  const [publishing, setPublishing] = useState(false);

  // While a meeting is active, "ערוך פרטים" toggles the same
  // MeetingDetailsForm used during prep inline — no status change, just a
  // local view toggle (per explicit product decision: no new "back to
  // prep" status transition, just show/hide the existing save form).
  const [editingActiveDetails, setEditingActiveDetails] = useState(false);

  // Topics available to pick from the topic pool (מאגר נושאים) — every
  // status is pickable (see listTopicPool() call below); the backend
  // still flips an "approved" pool item's status to in_meeting once it's
  // actually attached to a meeting.
  const [poolItems, setPoolItems] = useState<TopicPoolItem[]>([]);

  const load = useCallback(() => {
    if (!id) return;
    api
      .getMeeting(id)
      .then((m) => {
        setMeeting(m);
        setError(null);
      })
      .catch((err) => setError(apiErrorMessage(err)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // No status filter — every pool topic is pickable regardless of its
    // review status (pending_review/approved/in_meeting/used/rejected).
    // A status here is just tracking, not a gate on selection.
    api
      .listTopicPool()
      .then(setPoolItems)
      .catch(() => setPoolItems([]));
  }, []);

  async function addTopic() {
    if (!id || !newTopicTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const minutes = Number(newTopicDuration);
      await api.addTopic(id, {
        title: newTopicTitle.trim(),
        duration_minutes: newTopicDuration && minutes > 0 ? minutes : null,
      });
      setNewTopicTitle("");
      setNewTopicDuration("");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Editable straight from the prep list — the planned duration a topic
  // is "tuned to" (see LiveTopicCard's elapsed/planned timer display)
  // shouldn't require re-adding the topic to set or change.
  async function setTopicDuration(topicId: string, minutes: number | null) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateTopic(id, topicId, { duration_minutes: minutes });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function addTopicFromPool(poolId: string) {
    if (!id) return;
    const item = poolItems.find((p) => p.id === poolId);
    if (!item) return;
    setBusy(true);
    setError(null);
    try {
      await api.addTopic(id, {
        title: item.title,
        description: item.description,
        duration_minutes: item.duration_minutes,
        invited_guests: item.invited_guests,
        source_pool_id: item.id,
      });
      load();
      api.listTopicPool().then(setPoolItems).catch(() => undefined);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removeTopic(topicId: string) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteTopic(id, topicId);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function move(topicId: string, direction: -1 | 1) {
    if (!id || !meeting) return;
    const sorted = [...meeting.topics].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((t) => t.id === topicId);
    const swapWith = idx + direction;
    if (idx < 0 || swapWith < 0 || swapWith >= sorted.length) return;
    const items = sorted.map((t) => ({ id: t.id, order: t.order }));
    [items[idx].order, items[swapWith].order] = [items[swapWith].order, items[idx].order];
    setBusy(true);
    setError(null);
    try {
      await api.reorderTopics(id, items);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: MeetingStatus) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateMeeting(id, { status });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function approveInternal() {
    if (!id) return;
    await api.addInternalApproval(id);
    load();
  }

  async function approveProtocol() {
    if (!id) return;
    await api.addProtocolApproval(id);
    load();
  }

  // Persists whatever's accumulated on the running timer for `topic` (if
  // it's the one currently being timed) and clears the running state.
  // Returns the elapsed total so callers that immediately follow up with
  // another change (skip/defer/close) don't have to re-read from `meeting`.
  async function finalizeTimer(topic: Topic): Promise<number> {
    if (!id || timingTopicId !== topic.id || timerStartedAt === null) {
      return topic.timer_elapsed || 0;
    }
    const total = (topic.timer_elapsed || 0) + Math.floor((Date.now() - timerStartedAt) / 1000);
    setTimingTopicId(null);
    setTimerStartedAt(null);
    await api.updateTopic(id, topic.id, { timer_elapsed: total });
    return total;
  }

  async function startDiscussion(topic: Topic) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      if (topic.status === "pending") {
        await api.updateTopic(id, topic.id, { status: "in_progress" });
      }
      setTimingTopicId(topic.id);
      setTimerStartedAt(Date.now());
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function pauseTimer(topic: Topic) {
    setBusy(true);
    setError(null);
    try {
      await finalizeTimer(topic);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resetTimer(topic: Topic) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      if (timingTopicId === topic.id) {
        setTimingTopicId(null);
        setTimerStartedAt(null);
      }
      await api.updateTopic(id, topic.id, { timer_elapsed: 0 });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function skipTopic(topic: Topic) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await finalizeTimer(topic);
      await api.updateTopic(id, topic.id, { status: "skipped" });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function cancelTopic(topic: Topic) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await finalizeTimer(topic);
      await api.updateTopic(id, topic.id, { status: "cancelled" });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deferTopicNow(topic: Topic) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await finalizeTimer(topic);
      await api.deferTopic(id, topic.id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function undoDefer(topic: Topic) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.undoDeferTopic(id, topic.id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitClose(values: CloseTopicValues) {
    if (!id || !closingTopic) return;
    setBusy(true);
    setError(null);
    try {
      await finalizeTimer(closingTopic);
      await api.updateTopic(id, closingTopic.id, { status: "done", ...values });
      setClosingTopic(null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Standalone follow-up: adds/updates action_item without touching status
  // or the running timer — the topic stays exactly as it was.
  async function submitFollowUp(actionItem: string) {
    if (!id || !followUpTopic) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateTopic(id, followUpTopic.id, { action_item: actionItem });
      setFollowUpTopic(null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !meeting) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!meeting) return <p className="text-ink-soft">טוען…</p>;

  const sortedTopics = [...meeting.topics].sort((a, b) => a.order - b.order);
  const currentIdx = STATUS_ORDER.indexOf(meeting.status);
  // Guard against a status not present in STATUS_ORDER at all (e.g. a
  // meeting from before "invited_public" was pulled out of the flow,
  // still sitting in that exact status): indexOf gives -1, and without
  // this guard STATUS_ORDER[-1 + 1] would resolve to STATUS_ORDER[0]
  // ("draft") — offering to "advance" the meeting backwards into draft.
  // Safer to just not show an advance button at all for that edge case.
  const nextStatus = currentIdx === -1 ? undefined : STATUS_ORDER[currentIdx + 1];
  const isPrep = PREP_STATUSES.includes(meeting.status);
  const isActive = meeting.status === "active";
  const pendingApprovalIdx = STATUS_ORDER.indexOf("pending_approval");
  const approvedIdx = STATUS_ORDER.indexOf("approved");
  const showInternalApproval = currentIdx >= pendingApprovalIdx;
  const showProtocolApproval = currentIdx >= approvedIdx;
  const usedPoolIds = new Set(meeting.topics.map((t) => t.source_pool_id).filter(Boolean));
  const availablePoolItems = poolItems.filter((p) => !usedPoolIds.has(p.id));
  // Locking only requires that every topic has been *resolved* somehow —
  // closed, skipped, deferred, or cancelled — not specifically "done".
  // A meeting where every topic ended up deferred/cancelled should still
  // be lockable rather than stuck forever.
  const hasResolvedTopic = meeting.topics.some((t) =>
    ["done", "skipped", "deferred", "cancelled"].includes(t.status)
  );
  // At least one attendee (member marked present, or Participant attached
  // while active — see AttendanceList's merged "נוכחות" grid) must be
  // recorded before the meeting can be locked. Otherwise a protocol could
  // get published with literally no one on record as having attended.
  const hasAttendance =
    (meeting.attendees_present?.length || 0) > 0 || (meeting.participant_ids?.length || 0) > 0;
  const showActiveDetailsForm = isActive && editor && editingActiveDetails;

  return (
    <div className="max-w-3xl">
      <div className="mb-1 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-display text-2xl font-bold">
            {meeting.title || KIND_LABELS[meeting.kind]}
            {meeting.number && ` ${meeting.number}`}
          </h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[meeting.status]}`}>
            {STATUS_LABELS[meeting.status]}
          </span>
        </div>
        {isActive && editor && (
          <button
            onClick={() => setEditingActiveDetails((v) => !v)}
            className="rounded border border-line-strong px-3 py-1.5 text-sm hover:bg-line"
          >
            {editingActiveDetails ? "→ חזרה" : "✏ ערוך פרטים"}
          </button>
        )}
      </div>

      <StatusStepper status={meeting.status} />

      {!(isPrep && editor) && !showActiveDetailsForm && (
        <p className="mb-6 text-sm text-ink-soft">
          {KIND_LABELS[meeting.kind]}
          {meeting.number && ` · מס׳ ${meeting.number}`} · {meeting.date}
          {meeting.time_start && ` ${meeting.time_start}`}
          {meeting.location && ` · ${meeting.location}`}
        </p>
      )}

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isPrep && editor && <MeetingDetailsForm meeting={meeting} onSaved={load} />}
      {showActiveDetailsForm && (
        <MeetingDetailsForm
          meeting={meeting}
          onSaved={() => {
            load();
            setEditingActiveDetails(false);
          }}
        />
      )}

      <h2 className="mb-3 font-display text-lg font-semibold">סדר יום</h2>

      {isPrep ? (
        <div className="space-y-2">
          {sortedTopics.length === 0 && <p className="text-sm text-ink-soft">אין עדיין נושאים.</p>}
          {sortedTopics.map((t, i) => (
            <div
              key={t.id}
              className="flex items-center justify-between rounded border border-line bg-white px-4 py-3"
            >
              <div>
                <p className="font-medium">
                  {t.title}
                  {t.is_private && (
                    <span className="mr-2 rounded bg-line px-1.5 py-0.5 text-xs text-ink-soft">פרטי</span>
                  )}
                  {t.source_pool_id && (
                    <span className="mr-2 rounded bg-line px-1.5 py-0.5 text-xs text-ink-soft">ממאגר</span>
                  )}
                </p>
                {editor ? (
                  <TopicDurationInput
                    topic={t}
                    disabled={busy}
                    onSave={(minutes) => setTopicDuration(t.id, minutes)}
                  />
                ) : (
                  <p className="text-xs text-ink-soft">
                    {t.duration_minutes ? `${t.duration_minutes} דק׳` : "ללא משך מתוכנן"}
                  </p>
                )}
              </div>
              {editor && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => move(t.id, -1)}
                    disabled={busy || i === 0}
                    className="rounded px-2 py-1 text-ink-soft hover:bg-line disabled:opacity-30"
                    aria-label="הזז למעלה"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(t.id, 1)}
                    disabled={busy || i === sortedTopics.length - 1}
                    className="rounded px-2 py-1 text-ink-soft hover:bg-line disabled:opacity-30"
                    aria-label="הזז למטה"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeTopic(t.id)}
                    disabled={busy}
                    className="rounded px-2 py-1 text-ink-soft hover:bg-line"
                    aria-label="מחק נושא"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {sortedTopics.length === 0 && <p className="text-sm text-ink-soft">אין נושאים.</p>}
          {sortedTopics.map((t, i) => (
            <LiveTopicCard
              key={t.id}
              topic={t}
              index={i + 1}
              editable={editor && isActive}
              isTiming={timingTopicId === t.id}
              timerStartedAt={timingTopicId === t.id ? timerStartedAt : null}
              busy={busy}
              onStartDiscussion={() => startDiscussion(t)}
              onPauseTimer={() => pauseTimer(t)}
              onReset={() => resetTimer(t)}
              onOpenClose={async () => {
                await finalizeTimer(t);
                setClosingTopic(t);
              }}
              onCreateFollowUp={() => setFollowUpTopic(t)}
              onSkip={() => skipTopic(t)}
              onDefer={() => deferTopicNow(t)}
              onUndoDefer={() => undoDefer(t)}
              onCancel={() => cancelTopic(t)}
            />
          ))}
        </div>
      )}

      {isPrep && editor && (
        <div className="mt-4 mb-6 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTopicTitle}
              onChange={(e) => setNewTopicTitle(e.target.value)}
              placeholder="נושא חדש"
              className="flex-1 rounded border border-line-strong px-3 py-2 text-sm"
            />
            <input
              type="number"
              min={1}
              value={newTopicDuration}
              onChange={(e) => setNewTopicDuration(e.target.value)}
              placeholder="דק׳ לדיון"
              title="משך זמן מתוכנן לדיון (דקות, אופציונלי)"
              className="w-24 rounded border border-line-strong px-2 py-2 text-sm"
            />
            <button
              onClick={addTopic}
              disabled={busy || !newTopicTitle.trim()}
              className="rounded border border-line-strong px-4 py-2 text-sm hover:bg-line disabled:opacity-50"
            >
              הוסף
            </button>
          </div>
          {availablePoolItems.length > 0 && (
            <select
              value=""
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) addTopicFromPool(e.target.value);
              }}
              className="rounded border border-line-strong px-2 py-1 text-sm"
            >
              <option value="">בחר ממאגר הנושאים…</option>
              {availablePoolItems.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.status !== "approved" ? ` (${TOPIC_POOL_STATUS_LABELS[p.status]})` : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {isPrep && (
        <InviteesPanel meetingId={meeting.id} invites={meeting.invites} editable={editor} onChanged={load} />
      )}

      {isPrep && editor ? (
        <InviteActions meeting={meeting} onChanged={load} />
      ) : isActive && editor ? (
        <div className="mb-6">
          <button
            onClick={() => nextStatus && changeStatus(nextStatus)}
            disabled={busy || !hasResolvedTopic || !hasAttendance}
            className="w-full rounded-lg bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
          >
            🔒 נעל ישיבה
          </button>
          {(!hasResolvedTopic || !hasAttendance) && (
            <p className="mt-1 text-center text-xs text-ink-soft">
              {!hasResolvedTopic && !hasAttendance
                ? "נדרש לסמן נוכחות ולסיים את הטיפול בנושא אחד לפחות"
                : !hasResolvedTopic
                  ? "נדרש לסיים את הטיפול בנושא אחד לפחות (סגירה, דילוג, דחייה או ביטול)"
                  : "נדרש לסמן נוכחות של לפחות מוזמן אחד"}
            </p>
          )}
        </div>
      ) : editor && meeting.status === "approved" ? (
        <button
          onClick={() => setPublishing(true)}
          disabled={busy}
          className="mb-6 w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
        >
          פרסם לציבור והעבר לפורסם
        </button>
      ) : (
        editor &&
        nextStatus && (
          <button
            onClick={() => changeStatus(nextStatus)}
            disabled={busy}
            className="mb-6 rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            העבר לסטטוס: {STATUS_LABELS[nextStatus]}
          </button>
        )
      )}

      {(isActive || !isPrep) && (
        <div className="mb-6">
          <AttendanceList
            meetingId={meeting.id}
            presentIds={meeting.attendees_present || []}
            editable={editor && isActive}
            participantIds={meeting.participant_ids || []}
            participantsEditable={isActive}
            onChanged={load}
          />
        </div>
      )}

      {showInternalApproval && (
        <div className="mb-4">
          <ApprovalPanel
            title="אישורים פנימיים"
            approvals={meeting.internal_approvals || []}
            currentUserId={currentUserId}
            canApprove={meeting.status === "pending_approval"}
            onApprove={approveInternal}
          />
        </div>
      )}

      {showProtocolApproval && (
        <div className="mb-6">
          <ApprovalPanel
            title="אישורי פרוטוקול"
            approvals={meeting.protocol_approvals || []}
            currentUserId={currentUserId}
            canApprove={meeting.status === "approved"}
            onApprove={approveProtocol}
          />
        </div>
      )}

      {closingTopic && (
        <CloseTopicModal
          topicTitle={closingTopic.title}
          onCancel={() => setClosingTopic(null)}
          onSubmit={submitClose}
        />
      )}

      {followUpTopic && (
        <FollowUpModal
          topicTitle={followUpTopic.title}
          initialValue={followUpTopic.action_item || ""}
          onCancel={() => setFollowUpTopic(null)}
          onSubmit={submitFollowUp}
        />
      )}

      {publishing && (
        <PublishModal
          meetingId={meeting.id}
          onCancel={() => setPublishing(false)}
          onPublished={() => {
            setPublishing(false);
            load();
          }}
        />
      )}
    </div>
  );
}

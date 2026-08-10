import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  api,
  apiErrorMessage,
  type InvalidRecipient,
  type Meeting,
  type MeetingRecording,
  type MeetingStatus,
  type PreviousMeeting,
  type ProtocolReceiptStatus,
  type Topic,
  type TopicPoolItem,
} from "../lib/api";
import {
  KIND_LABELS,
  STATUS_LABELS,
  STATUS_ORDER,
  STATUS_VARIANTS,
  TOPIC_POOL_STATUS_LABELS,
} from "../lib/meetingLabels";
import { useIsEditor } from "../components/Layout";
import AttendanceList from "../components/AttendanceList";
import LiveTopicCard from "../components/LiveTopicCard";
import CloseTopicModal, { type CloseTopicValues } from "../components/CloseTopicModal";
import MeetingDetailsForm from "../components/MeetingDetailsForm";
import DocumentsPanel from "../components/DocumentsPanel";
import ConfirmDialog from "../components/ConfirmDialog";
import InviteesPanel from "../components/InviteesPanel";
import InviteActions from "../components/InviteActions";
import PublishModal from "../components/PublishModal";
import InvalidEmailsModal from "../components/InvalidEmailsModal";
import StatusStepper from "../components/StatusStepper";
import {
  DownloadIcon,
  DsButton,
  ExternalLinkIcon,
  DsCard,
  DsInput,
  DsSelect,
  DsTag,
  PencilIcon,
  SectionHeader,
  SendIcon,
  StatusPill,
  TrashIcon,
} from "../components/klaser-ds";

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
    <label className="mt-2 flex items-center gap-2 font-rubik text-xs text-ink-soft">
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
        className="w-16 rounded-md border border-line bg-white px-2 py-1 text-center font-rubik text-xs text-ink outline-none transition focus:border-turquoise focus:ring-2 focus:ring-turquoise/20 disabled:bg-line/40"
      />
      דק׳ לדיון
    </label>
  );
}

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const editor = useIsEditor();
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
  const [closeInitialNotes, setCloseInitialNotes] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [invalidEmails, setInvalidEmails] = useState<InvalidRecipient[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [prevMeeting, setPrevMeeting] = useState<PreviousMeeting | null>(null);
  const [prevPdfBusy, setPrevPdfBusy] = useState(false);
  const [receipt, setReceipt] = useState<ProtocolReceiptStatus | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  // Post-lock, the whole agenda is edited behind a single toggle rather than
  // every topic card exposing its controls at once.
  const [meetingEditing, setMeetingEditing] = useState(false);
  const [finishEditModal, setFinishEditModal] = useState(false);
  const [confirmDeleteTopic, setConfirmDeleteTopic] = useState<{ id: string; title: string } | null>(
    null,
  );

  async function distributeApproval(reset = false) {
    if (!id) return;
    setReceiptBusy(true);
    setError(null);
    try {
      setReceipt(await api.distributeProtocolApproval(id, reset));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setReceiptBusy(false);
    }
  }

  // Approve the protocol directly, without distributing it to the committee
  // or waiting for their confirmations.
  async function approveWithoutSend() {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.approveWithoutDistribution(id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Open the previous meeting's protocol PDF (for the recurring "אישור
  // פרוטוקול ישיבה קודמת" topic). Opened in a new tab for on-screen review.
  async function showPreviousProtocol() {
    if (!prevMeeting) return;
    setPrevPdfBusy(true);
    setError(null);
    try {
      const blob = await api.getProtocolPdf(prevMeeting.id);
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoke a little later so the new tab has time to load the blob.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPrevPdfBusy(false);
    }
  }

  async function downloadProtocol() {
    if (!id) return;
    setPdfBusy(true);
    setError(null);
    try {
      const blob = await api.getProtocolPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `פרוטוקול ${meeting?.number || id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPdfBusy(false);
    }
  }

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

  const [recordings, setRecordings] = useState<MeetingRecording[]>([]);
  const loadRecordings = useCallback(() => {
    if (!id) return;
    api
      .listRecordings(id)
      .then(setRecordings)
      .catch(() => setRecordings([]));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Per-topic recordings — available once the meeting is live and afterwards.
  useEffect(() => {
    if (id && meeting && !PREP_STATUSES.includes(meeting.status)) loadRecordings();
  }, [id, meeting?.status, loadRecordings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live refresh: RSVP responses and protocol-receipt confirmations arrive via
  // public email links, off-screen. Poll while the page is open so they show
  // up without a manual refresh — paused when the tab is hidden or an action
  // is in flight (so a background fetch never clobbers what the user is doing).
  const busyRef = useRef(false);
  busyRef.current = busy;
  const statusRef = useRef<MeetingStatus | undefined>(undefined);
  statusRef.current = meeting?.status;
  useEffect(() => {
    if (!id) return;
    const handle = window.setInterval(() => {
      if (document.hidden || busyRef.current) return;
      const status = statusRef.current;
      api.getMeeting(id).then(setMeeting).catch(() => {});
      if (status === "pending_approval" || status === "approved") {
        api.getProtocolReceiptStatus(id).then(setReceipt).catch(() => {});
      }
      if (status && !PREP_STATUSES.includes(status)) {
        api.listRecordings(id).then(setRecordings).catch(() => {});
      }
    }, 12000);
    return () => window.clearInterval(handle);
  }, [id]);

  // Look up the previous meeting only while active — powers the "show
  // previous protocol" button on the recurring approval topic.
  useEffect(() => {
    if (!id || meeting?.status !== "active") {
      setPrevMeeting(null);
      return;
    }
    api
      .getPreviousMeeting(id)
      .then(setPrevMeeting)
      .catch(() => setPrevMeeting(null));
  }, [id, meeting?.status]);

  // Protocol-receipt gate progress — only relevant once locked. Cleared to
  // null on every status change before the refetch so a stale "threshold met"
  // from a previous phase can't briefly re-enable the approve button after an
  // edit sends the meeting back to pending_approval.
  useEffect(() => {
    if (!id || (meeting?.status !== "pending_approval" && meeting?.status !== "approved")) {
      setReceipt(null);
      return;
    }
    setReceipt(null);
    api
      .getProtocolReceiptStatus(id)
      .then(setReceipt)
      .catch(() => setReceipt(null));
  }, [id, meeting?.status]);

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
      setConfirmDeleteTopic(null);
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

  // Live per-topic notes, saved quietly on blur so they survive a reload and
  // pre-fill the הערות field when the topic is closed.
  async function saveTopicNotes(topic: Topic, notes: string) {
    if (!id) return;
    setError(null);
    try {
      await api.updateTopic(id, topic.id, { topic_notes: notes.trim() || null });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
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

  async function sendTopicToAssemblyNow(topic: Topic) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      await api.sendTopicToAssembly(id, topic.id);
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

  if (error && !meeting) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!meeting) return <p className="animate-pulse text-sm text-ink-soft">טוען…</p>;

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
  // Assemblies (אסיפה) don't track attendance — invitations/approval still
  // apply, but there's no present-marking, and they lock without it.
  const isAssembly = meeting.kind === "assembly";
  // Locked-but-editable phases (after the meeting ends, before archive):
  // attendance AND the agenda are read-only until the single "ערוך ישיבה"
  // toggle is on. That one toggle governs both. A published assembly is fully
  // final — no more editing (meetings can still be edited post-publish, which
  // re-opens the approval cycle and records a new protocol version).
  const isLockedEditable =
    editor &&
    !isActive &&
    !isPrep &&
    meeting.status !== "archived" &&
    !(isAssembly && meeting.status === "published");
  const meetingSectionsEditable = isActive ? editor : isLockedEditable && meetingEditing;
  const topicsEditable = meetingSectionsEditable;
  const usedPoolIds = new Set(meeting.topics.map((t) => t.source_pool_id).filter(Boolean));
  const availablePoolItems = poolItems.filter((p) => !usedPoolIds.has(p.id));
  // Locking only requires that every topic has been *resolved* somehow —
  // closed, skipped, deferred, or cancelled — not specifically "done".
  // A meeting where every topic ended up deferred/cancelled should still
  // be lockable rather than stuck forever.
  const hasResolvedTopic = meeting.topics.some((t) =>
    ["done", "skipped", "deferred", "cancelled"].includes(t.status)
  );
  // Topic condition for locking: assemblies never require it; a meeting with
  // no agenda topics at all can lock (edge case); a meeting WITH topics still
  // needs at least one handled.
  const topicsReadyToLock = isAssembly || meeting.topics.length === 0 || hasResolvedTopic;
  // At least one attendee (member marked present, or Participant attached
  // while active — see AttendanceList's merged "נוכחות" grid) must be
  // recorded before the meeting can be locked. Otherwise a protocol could
  // get published with literally no one on record as having attended.
  // Assemblies don't require attendance to lock (there's no present-marking).
  const hasAttendance =
    isAssembly ||
    (meeting.attendees_present?.length || 0) > 0 ||
    (meeting.participant_ids?.length || 0) > 0;
  const showActiveDetailsForm = isActive && editor && editingActiveDetails;

  const timeHM = meeting.time_start ? meeting.time_start.slice(0, 5) : "";
  // Single detail-format header line — kind · מס׳ N · date time · location.
  const detailLine = [
    KIND_LABELS[meeting.kind],
    meeting.number ? `מס׳ ${meeting.number}` : null,
    `${meeting.date}${timeHM ? ` ${timeHM}` : ""}`,
    meeting.location || null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Attendance is shown while active and in every post-prep phase, and always
  // sits ABOVE the agenda. During the live meeting it stays fully editable but
  // is collapsed by default (a compact bar you expand); once locked it's
  // read-only until the shared "ערוך ישיבה" toggle is on (same gate as topics).
  // While the meeting is active, attendance is shown open (expanded) and
  // editable — it's the live thing being marked. Once locked it collapses to a
  // header bar you expand on demand (one box), and stays read-only until the
  // "ערוך ישיבה" toggle is on.
  const attendanceEditable = isActive ? editor : meetingSectionsEditable;
  const attendanceBlock = !isAssembly && (isActive || !isPrep) && (
    <div className="mb-6">
      <AttendanceList
        meetingId={meeting.id}
        invites={meeting.invites}
        presentIds={meeting.attendees_present || []}
        editable={attendanceEditable}
        participantIds={meeting.participant_ids || []}
        participantsEditable={attendanceEditable}
        collapsible={!isActive}
        onChanged={load}
      />
    </div>
  );

  // The single "ערוך ישיבה" toggle for the locked-but-editable phases —
  // governs both attendance and the agenda, and sits above both.
  const editMeetingToggle = isLockedEditable && (
    <div className="mb-3 flex justify-end">
      <button
        onClick={() => {
          if (!meetingEditing) {
            setMeetingEditing(true);
          } else if (meeting.status === "pending_approval" || meeting.status === "approved") {
            setFinishEditModal(true);
          } else {
            setMeetingEditing(false);
          }
        }}
        className={`inline-flex h-10 items-center gap-2 rounded-md border px-4 font-rubik text-sm font-bold transition ${
          meetingEditing
            ? "border-success bg-success/10 text-success hover:bg-success/15"
            : "border-2 border-turquoise bg-white text-turquoise hover:bg-turquoise hover:text-white"
        }`}
      >
        <span>{meetingEditing ? "סיום עריכה" : `ערוך ${isAssembly ? "אסיפה" : "ישיבה"}`}</span>
        <PencilIcon />
      </button>
    </div>
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1
            className={`font-rubik font-bold text-ink ${isActive ? "text-lg" : "text-2xl"}`}
          >
            {isActive
              ? detailLine
              : `${meeting.title || KIND_LABELS[meeting.kind]}${meeting.number ? ` ${meeting.number}` : ""}`}
          </h1>
          <StatusPill variant={STATUS_VARIANTS[meeting.status]}>
            {STATUS_LABELS[meeting.status]}
          </StatusPill>
        </div>
        {isActive && editor && (
          <DsButton
            variant="secondary"
            size="compact"
            className="shrink-0 border"
            onClick={() => setEditingActiveDetails((v) => !v)}
            icon={editingActiveDetails ? undefined : <PencilIcon />}
          >
            {editingActiveDetails ? "חזרה" : "ערוך פרטים"}
          </DsButton>
        )}
      </div>

      <StatusStepper status={meeting.status} />

      {!(isPrep && editor) && !showActiveDetailsForm && !isActive && (
        <p className="mb-6 text-sm text-ink-soft">{detailLine}</p>
      )}

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
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

      {/* Documents — available at every stage; addable up to publication,
          view-only once published/archived. */}
      <DocumentsPanel
        meetingId={meeting.id}
        canEdit={editor && meeting.status !== "published" && meeting.status !== "archived"}
      />

      {/* Active: attendance only (above the agenda). Post-lock: the single
          "ערוך ישיבה" toggle sits above both attendance and the agenda. */}
      {isActive && attendanceBlock}
      {!isActive && (
        <>
          {editMeetingToggle}
          {attendanceBlock}
        </>
      )}

      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex-1">
          <SectionHeader className="mb-0">סדר יום</SectionHeader>
        </div>
      </div>

      {isPrep ? (
        <div className="flex flex-col gap-2">
          {sortedTopics.length === 0 && <p className="text-sm text-ink-soft">אין עדיין נושאים.</p>}
          {sortedTopics.map((t, i) => (
            <DsCard
              key={t.id}
              interactive={false}
              className="flex items-center justify-between gap-4 px-4 py-3"
            >
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <span>{t.title}</span>
                  {t.is_private && <DsTag>פרטי</DsTag>}
                  {t.source_pool_id && <DsTag>ממאגר</DsTag>}
                  {t.from_committee_meeting && (
                    <StatusPill variant="teal">הועבר מפגישת הועד</StatusPill>
                  )}
                </p>
                {editor ? (
                  <TopicDurationInput
                    topic={t}
                    disabled={busy}
                    onSave={(minutes) => setTopicDuration(t.id, minutes)}
                  />
                ) : (
                  <p className="mt-1 font-rubik text-xs text-ink-soft">
                    {t.duration_minutes ? `${t.duration_minutes} דק׳` : "ללא משך מתוכנן"}
                  </p>
                )}
              </div>
              {editor && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => move(t.id, -1)}
                    disabled={busy || i === 0}
                    className="rounded-md px-2 py-1 text-ink-soft transition hover:bg-turquoise/10 hover:text-turquoise disabled:opacity-30"
                    aria-label="הזז למעלה"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(t.id, 1)}
                    disabled={busy || i === sortedTopics.length - 1}
                    className="rounded-md px-2 py-1 text-ink-soft transition hover:bg-turquoise/10 hover:text-turquoise disabled:opacity-30"
                    aria-label="הזז למטה"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => setConfirmDeleteTopic({ id: t.id, title: t.title })}
                    disabled={busy}
                    className="rounded-md p-2 text-ink-soft transition hover:bg-danger/10 hover:text-danger disabled:opacity-30"
                    aria-label="מחק נושא"
                  >
                    <TrashIcon />
                  </button>
                </div>
              )}
            </DsCard>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {sortedTopics.length === 0 && <p className="text-sm text-ink-soft">אין נושאים.</p>}
          {sortedTopics.map((t, i) => (
            <LiveTopicCard
              key={t.id}
              topic={t}
              index={i + 1}
              editable={topicsEditable}
              isTiming={timingTopicId === t.id}
              timerStartedAt={timingTopicId === t.id ? timerStartedAt : null}
              busy={busy}
              onStartDiscussion={() => startDiscussion(t)}
              onPauseTimer={() => pauseTimer(t)}
              onReset={() => resetTimer(t)}
              onOpenClose={async (notes) => {
                await finalizeTimer(t);
                setCloseInitialNotes(notes);
                setClosingTopic(t);
              }}
              onSaveNotes={(notes) => saveTopicNotes(t, notes)}
              onDefer={() => deferTopicNow(t)}
              onUndoDefer={() => undoDefer(t)}
              onCancel={() => cancelTopic(t)}
              onEdit={() => {
                setCloseInitialNotes(t.topic_notes || "");
                setClosingTopic(t);
              }}
              prevProtocol={
                prevMeeting && (t.is_default_first || /פרוט/.test(t.title))
                  ? {
                      label: `הצג פרוטוקול ${
                        prevMeeting.number ? `מס׳ ${prevMeeting.number}` : "ישיבה קודמת"
                      }`,
                      busy: prevPdfBusy,
                      onOpen: showPreviousProtocol,
                    }
                  : null
              }
              sendToAssembly={
                editor && meeting.kind !== "assembly"
                  ? {
                      sent: t.sent_to_assembly_at !== null,
                      busy,
                      onSend: () => sendTopicToAssemblyNow(t),
                    }
                  : null
              }
              meetingId={meeting.id}
              recordings={recordings.filter((r) => r.topic_id === t.id)}
              canRecord={isActive && editor}
              onRecordingsChanged={loadRecordings}
            />
          ))}
        </div>
      )}

      {isPrep && editor && (
        <div className="mb-8 mt-4 flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <DsInput
                value={newTopicTitle}
                onChange={setNewTopicTitle}
                placeholder="נושא חדש"
              />
            </div>
            <div className="w-28">
              <DsInput
                type="number"
                min={1}
                value={newTopicDuration}
                onChange={setNewTopicDuration}
                placeholder="דק׳ לדיון"
              />
            </div>
            <DsButton
              size="compact"
              onClick={addTopic}
              disabled={busy || !newTopicTitle.trim()}
            >
              הוסף
            </DsButton>
          </div>
          {availablePoolItems.length > 0 && (
            <div className="w-64">
              <DsSelect
                value=""
                disabled={busy}
                onChange={(v) => {
                  if (v) addTopicFromPool(v);
                }}
              >
                <option value="">בחר ממאגר הנושאים…</option>
                {availablePoolItems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                    {p.status !== "approved" ? ` (${TOPIC_POOL_STATUS_LABELS[p.status]})` : ""}
                  </option>
                ))}
              </DsSelect>
            </div>
          )}
        </div>
      )}

      {isPrep && (
        <InviteesPanel
          meetingId={meeting.id}
          invites={meeting.invites}
          editable={editor}
          showRsvp={meeting.status !== "draft"}
          actions={editor ? <InviteActions meeting={meeting} onChanged={load} /> : undefined}
          onChanged={load}
        />
      )}

      {isPrep ? null : isActive && editor ? (
        <div className="mb-8">
          {/* Destructive-ish milestone: DS `danger` fill, not an off-palette rose. */}
          <button
            onClick={() => nextStatus && changeStatus(nextStatus)}
            disabled={busy || !topicsReadyToLock || !hasAttendance}
            className="w-full rounded-md bg-danger px-4 py-3 font-rubik text-base font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
          >
            נעל ישיבה
          </button>
          {(!topicsReadyToLock || !hasAttendance) && (
            <p className="mt-2 text-center font-rubik text-xs text-ink-soft">
              {!topicsReadyToLock && !hasAttendance
                ? "נדרש לסמן נוכחות ולסיים את הטיפול בנושא אחד לפחות"
                : !topicsReadyToLock
                  ? "נדרש לסיים את הטיפול בנושא אחד לפחות (סגירה, דילוג, דחייה או ביטול)"
                  : "נדרש לסמן נוכחות של לפחות מוזמן אחד"}
            </p>
          )}
        </div>
      ) : editor && meeting.status === "pending_approval" ? (
        <div className="mb-6">
          <button
            onClick={() => changeStatus("approved")}
            disabled={busy || meetingEditing || (!isAssembly && (!receipt || !receipt.threshold_met))}
            className="w-full rounded-md bg-turquoise px-4 py-3 font-rubik text-base font-bold text-white transition hover:bg-turquoise-dark disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
          >
            העבר לסטטוס: אושר
          </button>
          {meetingEditing ? (
            <p className="mt-1 text-center text-xs text-ink-soft">
              יש לסיים את עריכת סדר היום לפני מעבר לסטטוס אושר
            </p>
          ) : (
            !isAssembly &&
            (!receipt || !receipt.threshold_met) && (
              <p className="mt-1 text-center text-xs text-ink-soft">
                נדרש שלפחות מחצית מחברי הועד יאשרו את הפרוטוקול לפני מעבר לסטטוס אושר
              </p>
            )
          )}
          {!isAssembly && (
            <button
              onClick={approveWithoutSend}
              disabled={busy || meetingEditing}
              className="mt-2 w-full rounded-md border border-turquoise bg-white px-4 py-2.5 font-rubik text-sm font-semibold text-turquoise transition hover:bg-turquoise hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              אשר ללא שליחה לחברי הועד
            </button>
          )}
        </div>
      ) : editor && meeting.status === "approved" ? (
        <div className="mb-8">
          <button
            onClick={() => setPublishing(true)}
            disabled={busy}
            className="w-full rounded-md bg-turquoise px-4 py-3 font-rubik text-base font-bold text-white transition hover:bg-turquoise-dark disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
          >
            פרסם לציבור והעבר לפורסם
          </button>
        </div>
      ) : (
        editor &&
        nextStatus && (
          <div className="mb-8">
            <DsButton size="compact" onClick={() => changeStatus(nextStatus)} disabled={busy}>
              העבר לסטטוס: {STATUS_LABELS[nextStatus]}
            </DsButton>
          </div>
        )
      )}

      {!isPrep && !isActive && (
        <Link
          to={`/meetings/${meeting.id}/protocol`}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border-2 border-turquoise bg-white px-4 py-3 font-rubik text-base font-bold text-turquoise transition hover:bg-turquoise hover:text-white"
        >
          <span>צפה בפרוטוקול (כולל גרסאות)</span>
          <ExternalLinkIcon />
        </Link>
      )}

      {(meeting.status === "published" || meeting.status === "archived") && (
        <button
          onClick={downloadProtocol}
          disabled={pdfBusy}
          className="mb-8 flex w-full items-center justify-center gap-2 rounded-md border-2 border-turquoise bg-white px-4 py-3 font-rubik text-base font-bold text-turquoise transition hover:bg-turquoise hover:text-white disabled:opacity-50"
        >
          <span>{pdfBusy ? "מפיק…" : "הפק PDF (פרוטוקול)"}</span>
          <DownloadIcon />
        </button>
      )}

      {editor && !isAssembly && meeting.status === "pending_approval" && (
        <DsCard interactive={false} className="mb-8 p-4">
          <SectionHeader>אישור הפרוטוקול (חברי ועד)</SectionHeader>
          <p className="mb-4 font-rubik text-xs text-ink-soft">
            הפצת הפרוטוקול לכל חברי הועד שהוזמנו לפגישה, לאישור. יש צורך שלפחות מחצית מחברי הועד יאשרו
            את הפרוטוקול לפני מעבר לסטטוס אושר.
          </p>

          {receipt && receipt.total > 0 && (
            <div className="mb-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-ink-soft">אישרו קבלה</span>
                <span
                  className={
                    receipt.threshold_met ? "font-semibold text-success" : "font-medium"
                  }
                >
                  {receipt.confirmed} מתוך {receipt.total}
                  {receipt.threshold_met ? " · הרוב הושג ✓" : ""}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line">
                <div
                  className={`h-full ${receipt.threshold_met ? "bg-success" : "bg-turquoise"}`}
                  style={{ width: `${Math.min(100, (receipt.confirmed / receipt.total) * 100)}%` }}
                />
              </div>
            </div>
          )}
          {receipt && receipt.total === 0 && (
            <p className="mb-4 font-rubik text-xs text-ink-soft">
              אין חברי ועד מוזמנים עם כתובת אימייל להפצה.
            </p>
          )}

          <DsButton
            size="compact"
            onClick={() => distributeApproval(false)}
            disabled={receiptBusy || (receipt?.total ?? 0) === 0}
            icon={<SendIcon />}
          >
            {receiptBusy
              ? "שולח…"
              : receipt?.sent
                ? "הפץ שוב לאישור חברי הועד"
                : "הפץ פרוטוקול לאישור חברי הועד"}
          </DsButton>
        </DsCard>
      )}

      {closingTopic && (
        <CloseTopicModal
          topicTitle={closingTopic.title}
          initialOutcome={closingTopic.decision_outcome}
          initialDecision={closingTopic.decision_text || ""}
          initialActionItem={closingTopic.action_item || ""}
          initialActionOwner={closingTopic.action_item_owner || ""}
          presentMemberIds={meeting.attendees_present || []}
          presentParticipantIds={meeting.participant_ids || []}
          initialNotes={closeInitialNotes}
          heading={closingTopic.status === "done" ? "עריכת נושא" : "סיום נושא"}
          submitLabel={closingTopic.status === "done" ? "שמור" : "סיים נושא"}
          onCancel={() => setClosingTopic(null)}
          onSubmit={submitClose}
        />
      )}


      {publishing && (
        <PublishModal
          meetingId={meeting.id}
          onCancel={() => setPublishing(false)}
          onPublished={(invalid) => {
            setPublishing(false);
            load();
            if (invalid.length > 0) setInvalidEmails(invalid);
          }}
        />
      )}

      {invalidEmails && (
        <InvalidEmailsModal recipients={invalidEmails} onClose={() => setInvalidEmails(null)} />
      )}

      {finishEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-sm rounded-lg border border-line bg-white p-8 shadow-[0px_2px_0_rgba(0,0,0,0.05),0px_4px_25px_0px_rgba(0,0,0,0.08)]">
            <h2 className="mb-2 font-rubik text-2xl font-bold text-ink">סיום עריכת הפרוטוקול</h2>
            <p className="mb-8 text-sm text-ink-soft">
              לשלוח את הפרוטוקול הערוך לאישור משתתפי הפגישה? הם יקבלו את הנוסח המעודכן במייל ויתבקשו לאשר
              קבלה מחדש (אישורים קודמים יתאפסו כי הפרוטוקול עודכן).
            </p>
            {/* DS §4.6 — actions on the LEFT; row-reverse puts the primary
                (DOM-first) button on the far left. */}
            <div className="flex flex-row-reverse justify-start gap-2">
              <DsButton
                size="compact"
                onClick={async () => {
                  await distributeApproval(true);
                  setFinishEditModal(false);
                  setMeetingEditing(false);
                }}
                disabled={receiptBusy}
              >
                {receiptBusy ? "שולח…" : "כן, שלח לאישור מחדש"}
              </DsButton>
              <DsButton
                variant="ghost"
                size="compact"
                onClick={() => {
                  setFinishEditModal(false);
                  setMeetingEditing(false);
                }}
                disabled={receiptBusy}
              >
                לא, רק סיים
              </DsButton>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteTopic && (
        <ConfirmDialog
          title="מחיקת נושא"
          message={
            <>
              למחוק את הנושא "<strong>{confirmDeleteTopic.title}</strong>"? לא ניתן לשחזר.
            </>
          }
          busy={busy}
          onConfirm={() => removeTopic(confirmDeleteTopic.id)}
          onCancel={() => setConfirmDeleteTopic(null)}
        />
      )}
    </div>
  );
}

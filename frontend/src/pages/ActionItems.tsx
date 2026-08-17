import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage, type ActionItem } from "../lib/api";
import { KIND_LABELS } from "../lib/meetingLabels";
import { useIsEditor } from "../components/Layout";
import {
  DsButton,
  DsInput,
  DsModal,
  DsSelect,
  DsTag,
  PageHeader,
  SectionHeader,
  StatusPill,
  TrashIcon,
} from "../components/klaser-ds";

/** Local "today" as YYYY-MM-DD — matches the date the <input type="date">
 * picker shows the user, which toISOString() (UTC) would get wrong after
 * ~15:00 Israel time. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/** Shown right after marking a task done or deleting one — notifying the
 * meeting's invitees is opt-in per action, decided here rather than via a
 * standing checkbox on the row. */
function ConfirmNotifyModal({ onSend, onSkip }: { onSend: () => void; onSkip: () => void }) {
  return (
    <DsModal
      size="sm"
      title="עדכון משתתפים"
      onClose={onSkip}
      actions={
        <>
          <DsButton size="compact" onClick={onSend}>
            שלח עדכון
          </DsButton>
          <DsButton variant="ghost" size="compact" onClick={onSkip}>
            אין צורך
          </DsButton>
        </>
      }
    >
      <p className="text-sm">תרצה לעדכן את המשתתפים בפגישה על הפעולה?</p>
    </DsModal>
  );
}

export default function ActionItems() {
  const editor = useIsEditor();
  const [items, setItems] = useState<ActionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Awaiting the send-update/no-need choice for one action. Only marking
  // a task done or deleting it asks — reopening an already-done task
  // (unchecking it) applies straight away, no popup.
  const [pending, setPending] = useState<{ item: ActionItem; kind: "done" | "delete" } | null>(null);

  function load() {
    api
      .listActionItems()
      .then(setItems)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  async function applyDone(item: ActionItem, notify: boolean) {
    setBusyId(item.topic_id);
    setError(null);
    try {
      await api.setActionItemDone(item.topic_id, true, notify);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function reopen(item: ActionItem) {
    setBusyId(item.topic_id);
    setError(null);
    try {
      await api.setActionItemDone(item.topic_id, false);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function applyDelete(item: ActionItem, notify: boolean) {
    setBusyId(item.topic_id);
    setError(null);
    try {
      await api.deleteActionItem(item.topic_id, notify);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function onToggleDone(item: ActionItem, checked: boolean) {
    if (checked) {
      setPending({ item, kind: "done" });
    } else {
      reopen(item);
    }
  }

  // יעד לביצוע. Saves on change; "" clears the date. No notify prompt —
  // moving a date isn't something to email every invitee about.
  async function setDueDate(item: ActionItem, value: string) {
    setBusyId(item.topic_id);
    setError(null);
    try {
      await api.setActionItemDueDate(item.topic_id, value || null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function resolvePending(notify: boolean) {
    if (!pending) return;
    const { item, kind } = pending;
    setPending(null);
    if (kind === "done") applyDone(item, notify);
    else applyDelete(item, notify);
  }

  const openItems = (items || []).filter((i) => !i.action_item_done);
  const doneItems = (items || []).filter((i) => i.action_item_done);

  function Row({ item }: { item: ActionItem }) {
    const busy = busyId === item.topic_id;
    // Both sides are "YYYY-MM-DD", so a string compare is a date compare.
    const overdue =
      !item.action_item_done &&
      !!item.action_item_due_date &&
      item.action_item_due_date < todayIso();
    return (
      <div
        className={`flex items-start justify-between gap-4 rounded-lg border border-line bg-white px-4 py-3 shadow-[0px_1px_0_rgba(0,0,0,0.03),0px_4px_16px_-4px_rgba(0,0,0,0.06)] transition ${
          item.action_item_done ? "opacity-60" : "hover:border-turquoise/40"
        }`}
      >
        <div className="min-w-0 flex-1">
          <Link
            to={`/meetings/${item.meeting_id}`}
            className="block font-rubik text-xs text-ink-soft transition hover:text-turquoise hover:underline"
          >
            {KIND_LABELS[item.meeting_kind]}
            {item.meeting_number && ` · מס׳ ${item.meeting_number}`} · {item.meeting_date} ·{" "}
            {item.topic_title}
          </Link>
          <p
            className={`mt-1 flex flex-wrap items-center gap-2 ${
              item.action_item_done ? "text-ink-soft line-through" : "font-medium"
            }`}
          >
            <span>{item.action_item}</span>
            {item.action_item_owner && <DsTag>אחראי: {item.action_item_owner}</DsTag>}
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            {editor ? (
              <>
                <label className="block">
                  <span className="mb-1 block font-rubik text-xs font-medium text-ink-soft">
                    סטטוס
                  </span>
                  <DsSelect
                    className="w-32"
                    value={item.action_item_done ? "done" : "open"}
                    disabled={busy}
                    onChange={(v) => onToggleDone(item, v === "done")}
                  >
                    <option value="open">פתוחה</option>
                    <option value="done">בוצעה</option>
                  </DsSelect>
                </label>
                <label className="block">
                  <span
                    className={`mb-1 block font-rubik text-xs font-medium ${
                      overdue ? "text-danger" : "text-ink-soft"
                    }`}
                  >
                    יעד לביצוע{overdue ? " · באיחור" : ""}
                  </span>
                  <div className="w-40">
                    <DsInput
                      type="date"
                      value={item.action_item_due_date || ""}
                      disabled={busy}
                      onChange={(v) => setDueDate(item, v)}
                    />
                  </div>
                </label>
              </>
            ) : (
              <div className="flex items-center gap-2 font-rubik text-xs text-ink-soft">
                <StatusPill variant={item.action_item_done ? "neutral" : "teal"}>
                  {item.action_item_done ? "בוצעה" : "פתוחה"}
                </StatusPill>
                {item.action_item_due_date && (
                  <span className={overdue ? "text-danger" : undefined}>
                    יעד לביצוע: {item.action_item_due_date}
                    {overdue ? " · באיחור" : ""}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        {editor && (
          <button
            onClick={() => setPending({ item, kind: "delete" })}
            disabled={busy}
            className="shrink-0 rounded-md p-2 text-ink-soft transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            aria-label="מחק משימה"
          >
            <TrashIcon />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="משימות לביצוע" />

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {items === null && !error && <p className="animate-pulse text-sm text-ink-soft">טוען…</p>}

      {items && items.length === 0 && <p className="text-ink-soft">אין עדיין משימות לביצוע.</p>}

      {items && items.length > 0 && (
        <div className="flex flex-col gap-8">
          <div>
            <SectionHeader>פתוחות ({openItems.length})</SectionHeader>
            {openItems.length === 0 ? (
              <p className="text-sm text-ink-soft">אין משימות פתוחות.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {openItems.map((item) => (
                  <Row key={item.topic_id} item={item} />
                ))}
              </div>
            )}
          </div>

          {doneItems.length > 0 && (
            <div>
              <SectionHeader>הושלמו ({doneItems.length})</SectionHeader>
              <div className="flex flex-col gap-2">
                {doneItems.map((item) => (
                  <Row key={item.topic_id} item={item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {pending && (
        <ConfirmNotifyModal onSend={() => resolvePending(true)} onSkip={() => resolvePending(false)} />
      )}
    </div>
  );
}

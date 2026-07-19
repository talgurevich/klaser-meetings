import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage, type ActionItem } from "../lib/api";
import { KIND_LABELS } from "../lib/meetingLabels";
import { useIsEditor } from "../components/Layout";

/** Shown right after marking a task done or deleting one — notifying the
 * meeting's invitees is opt-in per action, decided here rather than via a
 * standing checkbox on the row. */
function ConfirmNotifyModal({ onSend, onSkip }: { onSend: () => void; onSkip: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-lg border border-line bg-white p-5 text-center shadow-lg">
        <p className="mb-4 text-sm">תרצה לעדכן את המשתתפים בפגישה על הפעולה?</p>
        <div className="flex justify-center gap-2">
          <button
            onClick={onSkip}
            className="rounded border border-line-strong px-4 py-2 text-sm hover:bg-line"
          >
            אין צורך
          </button>
          <button
            onClick={onSend}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
          >
            שלח עדכון
          </button>
        </div>
      </div>
    </div>
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
    return (
      <div
        className={`flex items-start justify-between gap-3 rounded border px-4 py-3 ${
          item.action_item_done ? "border-line bg-surface" : "border-line bg-white"
        }`}
      >
        <label className="flex flex-1 items-start gap-3">
          <input
            type="checkbox"
            checked={item.action_item_done}
            disabled={!editor || busy}
            onChange={(e) => onToggleDone(item, e.target.checked)}
            className="mt-1 rounded"
          />
          <span>
            <p className={item.action_item_done ? "text-ink-soft line-through" : "font-medium"}>
              {item.action_item}
            </p>
            <Link
              to={`/meetings/${item.meeting_id}`}
              className="mt-0.5 block text-xs text-ink-soft hover:text-accent-dark hover:underline"
            >
              {KIND_LABELS[item.meeting_kind]}
              {item.meeting_number && ` · מס׳ ${item.meeting_number}`} · {item.meeting_date} ·{" "}
              {item.topic_title}
            </Link>
          </span>
        </label>
        {editor && (
          <button
            onClick={() => setPending({ item, kind: "delete" })}
            disabled={busy}
            className="shrink-0 rounded px-2 py-1 text-sm text-ink-soft hover:bg-line disabled:opacity-50"
            aria-label="מחק משימה"
          >
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-2xl font-bold">משימות לביצוע</h1>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {items === null && !error && <p className="text-ink-soft">טוען…</p>}

      {items && items.length === 0 && <p className="text-ink-soft">אין עדיין משימות לביצוע.</p>}

      {items && items.length > 0 && (
        <div className="space-y-6">
          <div>
            <h2 className="mb-2 text-sm font-semibold text-ink-soft">פתוחות ({openItems.length})</h2>
            {openItems.length === 0 ? (
              <p className="text-sm text-ink-soft">אין משימות פתוחות.</p>
            ) : (
              <div className="space-y-2">
                {openItems.map((item) => (
                  <Row key={item.topic_id} item={item} />
                ))}
              </div>
            )}
          </div>

          {doneItems.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold text-ink-soft">הושלמו ({doneItems.length})</h2>
              <div className="space-y-2">
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

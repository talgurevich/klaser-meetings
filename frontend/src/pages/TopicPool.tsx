import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, apiErrorMessage, type TopicPoolItem } from "../lib/api";
import { KIND_LABELS } from "../lib/meetingLabels";
import { useIsEditor } from "../components/Layout";
import AddPoolTopicModal from "../components/AddPoolTopicModal";
import ConfirmDialog from "../components/ConfirmDialog";

function fmtDate(d: string): string {
  return d.split("-").reverse().join("/");
}
import {
  DsButton,
  DsCard,
  PageHeader,
  PlusIcon,
  StatusPill,
  TrashIcon,
} from "../components/klaser-ds";

export default function TopicPool() {
  const editor = useIsEditor();
  const [items, setItems] = useState<TopicPoolItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmItem, setConfirmItem] = useState<{ id: string; title: string } | null>(null);

  function load() {
    api
      .listTopicPool()
      .then(setItems)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.deleteTopicPoolItem(id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
      setConfirmItem(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="מאגר"
        title="מאגר נושאים"
        actions={
          <DsButton size="compact" onClick={() => setAdding(true)} icon={<PlusIcon />}>
            הצעה חדשה
          </DsButton>
        }
      />

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {items === null && !error && <p className="animate-pulse text-sm text-ink-soft">טוען…</p>}
      {items && items.length === 0 && <p className="text-ink-soft">אין נושאים במאגר.</p>}

      <div className="flex flex-col gap-2">
        {items?.map((item) => (
          <DsCard
            key={item.id}
            interactive={false}
            className="flex items-start justify-between gap-4 px-4 py-3"
          >
            <div>
              <p className="font-medium">{item.title}</p>
              {item.description && <p className="mt-1 text-sm text-ink-soft">{item.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2 font-rubik text-xs text-ink-soft">
                {item.duration_minutes ? <span>{item.duration_minutes} ד׳</span> : null}
                {item.invited_guests && item.invited_guests.length > 0 && (
                  <span>· {item.invited_guests.length} מוזמנים חיצוניים</span>
                )}
                {!item.scheduled_meeting && item.status === "in_meeting" && (
                  <StatusPill variant="teal">שובץ לישיבה</StatusPill>
                )}
                {item.status === "used" && <StatusPill variant="neutral">נוצל</StatusPill>}
              </div>

              {item.scheduled_meeting && (
                <div className="mt-2 font-rubik text-xs">
                  <Link
                    to={`/meetings/${item.scheduled_meeting.id}`}
                    className="font-medium text-turquoise transition hover:text-turquoise-dark hover:underline"
                  >
                    ↗ שובץ ל{KIND_LABELS[item.scheduled_meeting.kind]}
                    {item.scheduled_meeting.number ? ` ${item.scheduled_meeting.number}` : ""} ·{" "}
                    {fmtDate(item.scheduled_meeting.date)}
                  </Link>
                  {item.scheduled_decision && (
                    <p className="mt-1 text-ink-soft">
                      <span className="font-medium text-ink">החלטה:</span> {item.scheduled_decision}
                    </p>
                  )}
                  {item.scheduled_action_item && (
                    <p className="mt-0.5 text-ink-soft">
                      <span className="font-medium text-ink">משימה:</span>{" "}
                      {item.scheduled_action_item}
                    </p>
                  )}
                  {item.scheduled_notes && (
                    <p className="mt-0.5 text-ink-soft">
                      <span className="font-medium text-ink">הערות:</span> {item.scheduled_notes}
                    </p>
                  )}
                </div>
              )}
            </div>
            {editor && (
              <button
                onClick={() => setConfirmItem({ id: item.id, title: item.title })}
                disabled={busy}
                className="shrink-0 rounded-md p-2 text-ink-soft transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                aria-label="מחק"
              >
                <TrashIcon />
              </button>
            )}
          </DsCard>
        ))}
      </div>

      {adding && (
        <AddPoolTopicModal
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            load();
          }}
        />
      )}

      {confirmItem && (
        <ConfirmDialog
          title="מחיקת נושא"
          message={
            <>
              למחוק את הנושא "<strong>{confirmItem.title}</strong>"? לא ניתן לשחזר.
            </>
          }
          busy={busy}
          onConfirm={() => remove(confirmItem.id)}
          onCancel={() => setConfirmItem(null)}
        />
      )}
    </div>
  );
}

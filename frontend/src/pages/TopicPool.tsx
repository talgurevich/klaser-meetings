import { useEffect, useState } from "react";
import { api, apiErrorMessage, type TopicPoolItem } from "../lib/api";
import { useIsEditor } from "../components/Layout";
import AddPoolTopicModal from "../components/AddPoolTopicModal";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  DsButton,
  DsCard,
  DsTag,
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
      // The pool is a backlog of *candidate* topics, so once one has been
      // scheduled into a ישיבה/אסיפה it drops off this list. It still exists
      // — on its meeting and in the pool table — this only hides it here.
      .then((list) => setItems(list.filter((i) => !i.scheduled_meeting)))
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  async function setPrivate(id: string, isPrivate: boolean) {
    setBusy(true);
    try {
      await api.updateTopicPoolItem(id, { is_private: isPrivate });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

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
              <p className="flex flex-wrap items-center gap-2 font-medium">
                <span>{item.title}</span>
                {item.is_private && <DsTag>חסוי</DsTag>}
              </p>
              {item.description && <p className="mt-1 text-sm text-ink-soft">{item.description}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2 font-rubik text-xs text-ink-soft">
                {item.duration_minutes ? <span>{item.duration_minutes} ד׳</span> : null}
                {item.invited_guests && item.invited_guests.length > 0 && (
                  <span>· {item.invited_guests.length} מוזמנים חיצוניים</span>
                )}
                {item.status === "in_meeting" && (
                  <StatusPill variant="teal">שובץ לישיבה</StatusPill>
                )}
                {item.status === "used" && <StatusPill variant="neutral">נוצל</StatusPill>}
              </div>
            </div>
            {editor && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => setPrivate(item.id, !item.is_private)}
                  disabled={busy}
                  className={`rounded-md px-2 py-1 font-rubik text-xs transition disabled:opacity-50 ${
                    item.is_private
                      ? "bg-turquoise/10 text-turquoise"
                      : "text-ink-soft hover:bg-turquoise/10 hover:text-turquoise"
                  }`}
                  title={
                    item.is_private
                      ? "נושא חסוי — לחצו כדי לבטל"
                      : "סמנו כחסוי — הנושא לא יופיע בפרוטוקול המופץ כשישובץ לישיבה"
                  }
                  aria-pressed={item.is_private}
                >
                  חסוי
                </button>
                <button
                  onClick={() => setConfirmItem({ id: item.id, title: item.title })}
                  disabled={busy}
                  className="rounded-md p-2 text-ink-soft transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  aria-label="מחק"
                >
                  <TrashIcon />
                </button>
              </div>
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

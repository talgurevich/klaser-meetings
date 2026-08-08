import { useEffect, useState } from "react";
import { api, apiErrorMessage, type TopicPoolItem } from "../lib/api";
import { useIsEditor } from "../components/Layout";
import AddPoolTopicModal from "../components/AddPoolTopicModal";
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
                {item.status === "in_meeting" && <StatusPill variant="teal">שובץ לישיבה</StatusPill>}
                {item.status === "used" && <StatusPill variant="neutral">נוצל</StatusPill>}
              </div>
            </div>
            {editor && (
              <button
                onClick={() => remove(item.id)}
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
    </div>
  );
}

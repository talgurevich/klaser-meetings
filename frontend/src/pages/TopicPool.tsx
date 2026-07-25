import { useEffect, useState } from "react";
import { api, apiErrorMessage, type TopicPoolItem } from "../lib/api";
import { useIsEditor } from "../components/Layout";
import AddPoolTopicModal from "../components/AddPoolTopicModal";

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">מאגר נושאים</h1>
        <button
          onClick={() => setAdding(true)}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
        >
          + הצעה חדשה
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {items === null && !error && <p className="text-ink-soft">טוען…</p>}
      {items && items.length === 0 && <p className="text-ink-soft">אין נושאים במאגר.</p>}

      <div className="space-y-2">
        {items?.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between rounded border border-line bg-white px-4 py-3"
          >
            <div>
              <p className="font-medium">{item.title}</p>
              {item.description && <p className="mt-0.5 text-sm text-ink-soft">{item.description}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                {item.duration_minutes ? <span>{item.duration_minutes} ד׳</span> : null}
                {item.invited_guests && item.invited_guests.length > 0 && (
                  <span>· {item.invited_guests.length} מוזמנים חיצוניים</span>
                )}
                {item.status === "in_meeting" && <span className="text-blue-700">· שובץ לישיבה</span>}
                {item.status === "used" && <span>· נוצל</span>}
              </div>
            </div>
            {editor && (
              <button
                onClick={() => remove(item.id)}
                disabled={busy}
                className="shrink-0 rounded px-2 py-1 text-ink-soft hover:bg-line"
                aria-label="מחק"
              >
                ✕
              </button>
            )}
          </div>
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

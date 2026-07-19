import { useEffect, useState } from "react";
import { api, apiErrorMessage, type TopicPoolItem, type TopicPoolStatus } from "../lib/api";
import { TOPIC_POOL_STATUS_LABELS } from "../lib/meetingLabels";
import { useIsEditor } from "../components/Layout";

const STATUS_BADGE: Record<TopicPoolStatus, string> = {
  pending_review: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  in_meeting: "bg-blue-100 text-blue-800",
  used: "bg-line text-ink-soft",
  rejected: "bg-red-100 text-red-800",
};

export default function TopicPool() {
  const editor = useIsEditor();
  const [items, setItems] = useState<TopicPoolItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    api
      .listTopicPool()
      .then(setItems)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  async function submitSuggestion(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.suggestTopic({ title: title.trim(), description: description.trim() || null });
      setTitle("");
      setDescription("");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: TopicPoolStatus) {
    setBusy(true);
    try {
      await api.updateTopicPoolItem(id, { status });
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
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-2xl font-bold">מאגר נושאים</h1>

      <form onSubmit={submitSuggestion} className="mb-8 rounded border border-line bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-soft">הצעת נושא לדיון</h2>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="כותרת הנושא"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-line-strong px-3 py-2 text-sm"
          />
          <textarea
            placeholder="פירוט (אופציונלי)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded border border-line-strong px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            שלח הצעה
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
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
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status]}`}
              >
                {TOPIC_POOL_STATUS_LABELS[item.status]}
              </span>
            </div>
            {editor && item.status === "pending_review" && (
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => setStatus(item.id, "approved")}
                  disabled={busy}
                  className="rounded border border-line-strong px-3 py-1 text-xs hover:bg-line"
                >
                  אשר
                </button>
                <button
                  onClick={() => setStatus(item.id, "rejected")}
                  disabled={busy}
                  className="rounded border border-line-strong px-3 py-1 text-xs hover:bg-line"
                >
                  דחה
                </button>
              </div>
            )}
            {editor && item.status !== "pending_review" && (
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
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { api, apiErrorMessage, type Participant } from "../lib/api";

/** "הוסף נושא למאגר" — create a pool topic. Invitees who aren't committee
 * members are picked from the אלפון (contacts with an email); their ids are
 * stored on the topic so they get invited to any meeting it's added to. */
export default function AddPoolTopicModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("10");
  const [priority, setPriority] = useState("0");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const [contacts, setContacts] = useState<Participant[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listParticipants()
      .then((ps) => setContacts(ps.filter((p) => p.email)))
      .catch(() => setContacts([]));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) => c.full_name.toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q)
    );
  }, [contacts, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.suggestTopic({
        title: title.trim(),
        description: description.trim() || null,
        duration_minutes: duration ? Number(duration) : null,
        invited_guests: selected.size ? Array.from(selected) : null,
        priority: priority ? Number(priority) : null,
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded border border-line-strong px-3 py-2 text-sm";
  const selectedContacts = contacts.filter((c) => selected.has(c.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden border border-ink bg-surface"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">הוסף נושא למאגר</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="סגור">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">כותרת *</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="כותרת הנושא"
              className={inputCls}
              autoFocus
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-soft">פרטים</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="תיאור הנושא…"
              rows={3}
              className={inputCls}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-soft">זמן מוקצב (דקות)</span>
            <input
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className={inputCls}
            />
          </label>

          <div className="text-sm">
            <span className="mb-1 block font-medium text-ink-soft">מוזמנים (שאינם חברי ועד)</span>
            {selectedContacts.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {selectedContacts.map((c) => (
                  <span key={c.id} className="flex items-center gap-1 rounded-full bg-line px-2 py-0.5 text-xs">
                    {c.full_name}
                    <button type="button" onClick={() => toggle(c.id)} className="text-ink-soft hover:text-red-700">
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="חיפוש באלפון…"
              className={`${inputCls} mb-1`}
            />
            <div className="max-h-40 overflow-y-auto rounded border border-line">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-xs text-ink-soft">אין אנשי קשר עם אימייל תואמים.</p>
              ) : (
                filtered.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-line">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="rounded" />
                    <span>{c.full_name}</span>
                    <span className="text-xs text-ink-soft" dir="ltr">
                      {c.email}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-soft">עדיפות</span>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={inputCls}
            />
          </label>

          {error && <p className="text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded border border-line-strong px-4 py-2 text-sm text-ink-soft hover:bg-line disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            + הוסף
          </button>
        </div>
      </form>
    </div>
  );
}

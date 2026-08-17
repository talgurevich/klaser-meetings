import { useEffect, useMemo, useState } from "react";
import { api, apiErrorMessage, type Participant } from "../lib/api";
import {
  Chip,
  CloseIcon,
  DsButton,
  DsCheckbox,
  DsInput,
  DsModal,
  DsTextarea,
  Field,
  PlusIcon,
} from "./klaser-ds";

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
      });
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  const selectedContacts = contacts.filter((c) => selected.has(c.id));

  return (
    <DsModal
      title="הוסף נושא למאגר"
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <DsButton
            type="submit"
            size="compact"
            disabled={busy || !title.trim()}
            icon={<PlusIcon />}
          >
            הוסף
          </DsButton>
          <DsButton variant="ghost" size="compact" onClick={onClose} disabled={busy}>
            ביטול
          </DsButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="כותרת *">
          <DsInput value={title} onChange={setTitle} placeholder="כותרת הנושא" autoFocus />
        </Field>

        <Field label="פרטים">
          <DsTextarea
            value={description}
            onChange={setDescription}
            placeholder="תיאור הנושא…"
            rows={3}
          />
        </Field>

        <Field label="זמן מוקצב (דקות)">
          <DsInput type="number" min={0} value={duration} onChange={setDuration} />
        </Field>

        <div>
          <div className="mb-2 font-rubik text-xs font-medium text-turquoise">
            מוזמנים (שאינם חברי ועד)
          </div>
          {selectedContacts.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {selectedContacts.map((c) => (
                <Chip key={c.id} variant="active" onClick={() => toggle(c.id)}>
                  <span>{c.full_name}</span>
                  <CloseIcon />
                </Chip>
              ))}
            </div>
          )}
          <div className="mb-2">
            <DsInput value={query} onChange={setQuery} placeholder="חיפוש באלפון…" />
          </div>
          <div className="max-h-40 overflow-y-auto rounded-md border border-line">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 font-rubik text-xs text-ink-soft">
                אין אנשי קשר עם אימייל תואמים.
              </p>
            ) : (
              filtered.map((c) => (
                <div
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition hover:bg-turquoise/5"
                >
                  <DsCheckbox
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    ariaLabel={c.full_name}
                  />
                  <span>{c.full_name}</span>
                  <span className="font-rubik text-xs text-ink-soft" dir="ltr">
                    {c.email}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </DsModal>
  );
}

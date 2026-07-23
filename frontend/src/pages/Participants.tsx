import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Participant } from "../lib/api";
import { useIsEditor } from "../components/Layout";

/** Directory of non-login contacts (full name, phone, email) tracked for
 * meeting attendance — NOT identity Users, never authenticate. Any
 * entitled tenant member can add one here (mirrors the backend's
 * broader-than-editor gating on create/list); editing or removing an
 * existing entry is editor-only, since it may already be attached to
 * other meetings' attendance records. */
export default function Participants() {
  const editor = useIsEditor();
  const [items, setItems] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [publicSend, setPublicSend] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPublicSend, setEditPublicSend] = useState(true);

  function load() {
    api
      .listParticipants()
      .then(setItems)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.createParticipant({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        public_send: publicSend,
      });
      setFullName("");
      setPhone("");
      setEmail("");
      setPublicSend(true);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(p: Participant) {
    setEditingId(p.id);
    setEditName(p.full_name);
    setEditPhone(p.phone || "");
    setEditEmail(p.email || "");
    setEditPublicSend(p.public_send);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateParticipant(id, {
        full_name: editName.trim(),
        phone: editPhone.trim() || null,
        email: editEmail.trim() || null,
        public_send: editPublicSend,
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteParticipant(id);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-2 font-display text-2xl font-bold">אלפון</h1>
      <p className="mb-6 text-sm text-ink-soft">
        אנשי קשר שאינם משתמשי מערכת — לתיעוד נוכחות ולרשימת התפוצה הציבורית.
        אנשי קשר המסומנים "שליחה ציבורית" מקבלים את סיכום הישיבה כשמפרסמים לציבור.
      </p>

      <form onSubmit={create} className="mb-8 rounded border border-line bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-soft">הוספת משתתף/ת חדש/ה</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-ink-soft">שם מלא</span>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded border border-line-strong px-3 py-2"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-ink-soft">טלפון (אופציונלי)</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded border border-line-strong px-3 py-2"
              dir="ltr"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-ink-soft">אימייל (אופציונלי)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-line-strong px-3 py-2"
              dir="ltr"
            />
          </label>
          <button
            type="submit"
            disabled={busy || !fullName.trim()}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            הוסף
          </button>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={publicSend}
            onChange={(e) => setPublicSend(e.target.checked)}
            className="rounded"
          />
          <span className="text-ink-soft">שליחה ציבורית — לקבל את סיכום הישיבה כשמפרסמים לציבור</span>
        </label>
      </form>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {items === null && !error && <p className="text-ink-soft">טוען…</p>}
      {items && items.length === 0 && <p className="text-ink-soft">האלפון ריק.</p>}

      {items && items.length > 0 && (
        <div className="overflow-hidden rounded border border-line bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface text-ink-soft">
              <tr>
                <th className="px-4 py-2 font-medium">שם</th>
                <th className="px-4 py-2 font-medium">טלפון</th>
                <th className="px-4 py-2 font-medium">אימייל</th>
                <th className="px-4 py-2 font-medium">שליחה ציבורית</th>
                {editor && <th className="px-4 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((p) =>
                editingId === p.id ? (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full rounded border border-line-strong px-2 py-1"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        className="w-full rounded border border-line-strong px-2 py-1"
                        dir="ltr"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full rounded border border-line-strong px-2 py-1"
                        dir="ltr"
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={editPublicSend}
                        onChange={(e) => setEditPublicSend(e.target.checked)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-2 text-left">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => saveEdit(p.id)}
                          disabled={busy || !editName.trim()}
                          className="text-xs text-accent-dark hover:underline disabled:opacity-50"
                        >
                          שמור
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          disabled={busy}
                          className="text-xs text-ink-soft hover:underline"
                        >
                          ביטול
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id} className="border-t border-line">
                    <td className="px-4 py-2">{p.full_name}</td>
                    <td className="px-4 py-2" dir="ltr">
                      {p.phone || "—"}
                    </td>
                    <td className="px-4 py-2" dir="ltr">
                      {p.email || "—"}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {p.public_send ? (
                        <span className="text-emerald-700">✓</span>
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )}
                    </td>
                    {editor && (
                      <td className="px-4 py-2 text-left">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEdit(p)}
                            disabled={busy}
                            className="text-xs text-accent-dark hover:underline disabled:opacity-50"
                          >
                            ערוך
                          </button>
                          <button
                            onClick={() => remove(p.id)}
                            disabled={busy}
                            className="text-xs text-red-700 hover:underline disabled:opacity-50"
                          >
                            הסר
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

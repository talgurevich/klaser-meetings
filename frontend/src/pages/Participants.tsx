import { useEffect, useRef, useState } from "react";
import { api, apiErrorMessage, type Participant } from "../lib/api";
import { useIsEditor } from "../components/Layout";

const EMPTY = {
  firstName: "",
  lastName: "",
  nickname: "",
  phone: "",
  email: "",
  role: "",
  publicSend: true,
  editPermission: false,
};

/** אלפון — directory of non-login contacts (name, phone, email, role).
 * Contacts flagged "שליחה ציבורית" receive the meeting summary when a
 * meeting is published. "הרשאות עריכה" (system user) is derived from an
 * email match with an identity user, not set here. Supports CSV import. */
export default function Participants() {
  const editor = useIsEditor();
  const [items, setItems] = useState<Participant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ ...EMPTY });
  const [editingId, setEditingId] = useState<string | null>(null);
  // Read-only: "הרשאות עריכה" is derived (email matches a system user), not
  // settable here — shown so it's visible when editing a contact.
  const [formSystemUser, setFormSystemUser] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  function set<K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function load() {
    api
      .listParticipants()
      .then(setItems)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  function resetForm() {
    setForm({ ...EMPTY });
    setEditingId(null);
    setFormSystemUser(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.firstName.trim() && !form.lastName.trim()) return;
    setBusy(true);
    setError(null);
    const body = {
      first_name: form.firstName.trim() || null,
      last_name: form.lastName.trim() || null,
      nickname: form.nickname.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      role: form.role.trim() || null,
      public_send: form.publicSend,
      edit_permission: form.editPermission,
    };
    try {
      if (editingId) await api.updateParticipant(editingId, body);
      else await api.createParticipant(body);
      resetForm();
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function startEdit(p: Participant) {
    setEditingId(p.id);
    setForm({
      firstName: p.first_name || "",
      lastName: p.last_name || "",
      nickname: p.nickname || "",
      phone: p.phone || "",
      email: p.email || "",
      role: p.role || "",
      publicSend: p.public_send,
      editPermission: p.edit_permission,
    });
    setFormSystemUser(p.is_system_user);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteParticipant(id);
      if (editingId === id) resetForm();
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    setImportMsg(null);
    try {
      const r = await api.importParticipants(file);
      setImportMsg(`יובאו ${r.imported} אנשי קשר${r.skipped ? `, דולגו ${r.skipped} (כפילויות אימייל)` : ""}.`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded border border-line-strong px-3 py-2";
  const yesNo = (v: boolean) =>
    v ? <span className="text-emerald-700">✓</span> : <span className="text-ink-soft">—</span>;

  return (
    <div className="max-w-5xl">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">אלפון</h1>
        {editor && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded border border-line-strong px-3 py-2 text-sm hover:bg-line disabled:opacity-50"
            >
              ⬆ ייבוא CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onImportFile}
            />
          </div>
        )}
      </div>
      <p className="mb-6 text-sm text-ink-soft">
        אנשי קשר שאינם משתמשי מערכת — לתיעוד נוכחות ולרשימת התפוצה הציבורית. אנשי קשר המסומנים
        "שליחה ציבורית" מקבלים את סיכום הישיבה כשמפרסמים לציבור. "הרשאות עריכה" נקבע לפי התאמת האימייל
        למשתמש מערכת קיים.
      </p>

      {importMsg && (
        <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {importMsg}
        </div>
      )}

      <form onSubmit={submit} className="mb-8 rounded border border-line bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-soft">
          {editingId ? "עריכת איש/אשת קשר" : "הוספת איש/אשת קשר"}
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium text-ink-soft">שם פרטי</span>
            <input type="text" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-ink-soft">שם משפחה</span>
            <input type="text" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-ink-soft">כינוי (אופציונלי)</span>
            <input type="text" value={form.nickname} onChange={(e) => set("nickname", e.target.value)} className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-ink-soft">נייד</span>
            <input type="tel" dir="ltr" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-ink-soft">אימייל</span>
            <input type="email" dir="ltr" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputCls} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-ink-soft">תפקיד (אופציונלי)</span>
            <input type="text" value={form.role} onChange={(e) => set("role", e.target.value)} className={inputCls} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.publicSend} onChange={(e) => set("publicSend", e.target.checked)} className="rounded" />
            <span className="text-ink-soft">שליחה ציבורית (פעיל) — לקבל את סיכום הישיבה כשמפרסמים לציבור</span>
          </label>
          <label
            className="flex items-center gap-2 text-sm"
            title={formSystemUser ? "יש הרשאה אוטומטית לפי התאמת אימייל למשתמש מערכת" : "סימון ידני של הרשאת עריכה"}
          >
            <input
              type="checkbox"
              checked={formSystemUser || form.editPermission}
              disabled={formSystemUser}
              onChange={(e) => set("editPermission", e.target.checked)}
              className="rounded"
            />
            <span className="text-ink-soft">
              הרשאות עריכה {formSystemUser && <span className="text-xs">(לפי אימייל)</span>}
            </span>
          </label>
          <div className="ms-auto flex gap-2">
            {editingId && (
              <button type="button" onClick={resetForm} disabled={busy} className="rounded border border-line-strong px-4 py-2 text-sm text-ink-soft hover:bg-line">
                ביטול
              </button>
            )}
            <button
              type="submit"
              disabled={busy || (!form.firstName.trim() && !form.lastName.trim())}
              className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {editingId ? "שמור" : "הוסף"}
            </button>
          </div>
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {items === null && !error && <p className="text-ink-soft">טוען…</p>}
      {items && items.length === 0 && <p className="text-ink-soft">האלפון ריק.</p>}

      {items && items.length > 0 && (
        <div className="overflow-x-auto rounded border border-line bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface text-ink-soft">
              <tr>
                <th className="px-3 py-2 font-medium">שם</th>
                <th className="px-3 py-2 font-medium">כינוי</th>
                <th className="px-3 py-2 font-medium">נייד</th>
                <th className="px-3 py-2 font-medium">אימייל</th>
                <th className="px-3 py-2 font-medium">תפקיד</th>
                <th className="px-3 py-2 text-center font-medium">שליחה ציבורית</th>
                <th className="px-3 py-2 text-center font-medium">הרשאות עריכה</th>
                {editor && <th className="px-3 py-2 font-medium"></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="px-3 py-2">{p.full_name}</td>
                  <td className="px-3 py-2">{p.nickname || "—"}</td>
                  <td className="px-3 py-2" dir="ltr">{p.phone || "—"}</td>
                  <td className="px-3 py-2" dir="ltr">{p.email || "—"}</td>
                  <td className="px-3 py-2">{p.role || "—"}</td>
                  <td className="px-3 py-2 text-center">{yesNo(p.public_send)}</td>
                  <td className="px-3 py-2 text-center">{yesNo(p.is_system_user || p.edit_permission)}</td>
                  {editor && (
                    <td className="px-3 py-2 text-left">
                      <div className="flex justify-end gap-2 whitespace-nowrap">
                        <button onClick={() => startEdit(p)} disabled={busy} className="text-xs text-accent-dark hover:underline disabled:opacity-50">
                          ערוך
                        </button>
                        <button onClick={() => remove(p.id)} disabled={busy} className="text-xs text-red-700 hover:underline disabled:opacity-50">
                          הסר
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

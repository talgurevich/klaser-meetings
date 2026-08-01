import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Participant } from "../lib/api";

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
        checked ? "bg-accent-dark" : "bg-line-strong"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "-translate-x-1" : "-translate-x-5"
        }`}
      />
    </button>
  );
}

/** "חבר חדש" — create or edit an אלפון contact. עורך (committee member) is
 * auto-on and locked when the email matches a system user. */
export default function ContactModal({
  contact,
  onClose,
  onSaved,
}: {
  contact: Participant | null; // null = create
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(contact?.full_name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [phone, setPhone] = useState(contact?.phone ?? "");
  const [roles, setRoles] = useState<string[]>(contact?.roles ?? []);
  const [customRole, setCustomRole] = useState("");
  const [joinDate, setJoinDate] = useState(contact?.join_date ?? "");
  const [member, setMember] = useState(contact ? contact.public_send : true);
  const [editorFlag, setEditorFlag] = useState(contact ? contact.edit_permission : false);
  const systemUser = contact?.is_system_user ?? false;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleOptions, setRoleOptions] = useState<string[]>([]);

  useEffect(() => {
    api
      .getTenantSettings()
      .then((s) => setRoleOptions(s.role_titles))
      .catch(() => setRoleOptions([]));
  }, []);

  const valid = fullName.trim() && email.trim() && joinDate;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    const body = {
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || null,
      roles,
      join_date: joinDate || null,
      public_send: member,
      edit_permission: editorFlag,
    };
    try {
      if (contact) await api.updateParticipant(contact.id, body);
      else await api.createParticipant(body);
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err));
      setBusy(false);
    }
  }

  const inputCls = "w-full rounded border border-line-strong px-3 py-2 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={submit}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden border border-ink bg-surface"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">{contact ? "עריכת איש קשר" : "חבר חדש"}</h2>
          <button type="button" onClick={onClose} className="text-ink-soft hover:text-ink" aria-label="סגור">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">שם מלא *</span>
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} autoFocus />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">מייל *</span>
            <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-soft">טלפון</span>
            <input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} />
          </label>
          <div className="text-sm">
            <span className="mb-1 block font-medium text-ink-soft">תפקידים</span>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...roleOptions, ...roles])].map((r) => {
                const on = roles.includes(r);
                return (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRoles((prev) => (on ? prev.filter((x) => x !== r) : [...prev, r]))}
                    className={`rounded-full px-3 py-1 text-xs ${
                      on ? "bg-accent-dark text-white" : "border border-line-strong text-ink hover:bg-line"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
              {roleOptions.length === 0 && roles.length === 0 && (
                <span className="text-xs text-ink-soft">אפשר להגדיר בעלי תפקיד בהגדרות, או להוסיף כאן ידנית.</span>
              )}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={customRole}
                onChange={(e) => setCustomRole(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const v = customRole.trim();
                    if (v && !roles.includes(v)) setRoles((prev) => [...prev, v]);
                    setCustomRole("");
                  }
                }}
                placeholder="הוסף תפקיד…"
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => {
                  const v = customRole.trim();
                  if (v && !roles.includes(v)) setRoles((prev) => [...prev, v]);
                  setCustomRole("");
                }}
                className="shrink-0 rounded border border-line-strong px-3 py-2 text-sm hover:bg-line"
              >
                הוסף
              </button>
            </div>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-ink-soft">תאריך הצטרפות לתפקיד *</span>
            <input
              type="date"
              required
              value={joinDate}
              onChange={(e) => setJoinDate(e.target.value)}
              className={inputCls}
            />
          </label>

          <div className="flex items-center justify-end gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-soft">חבר</span>
              <Toggle checked={member} onChange={setMember} />
            </label>
            <label
              className="flex items-center gap-2 text-sm"
              title={systemUser ? "חבר ועד לפי התאמת אימייל — מוזמן אוטומטית לכל פגישה" : "חבר ועד — מוזמן אוטומטית לכל פגישה"}
            >
              <span className="text-ink-soft">חבר ועד {systemUser && <span className="text-xs">(לפי אימייל)</span>}</span>
              <Toggle checked={systemUser || editorFlag} disabled={systemUser} onChange={setEditorFlag} />
            </label>
          </div>

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
            disabled={busy || !valid}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            {contact ? "שמור" : "+ הוסף"}
          </button>
        </div>
      </form>
    </div>
  );
}

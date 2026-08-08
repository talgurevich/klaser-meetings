import { useEffect, useState } from "react";
import { api, apiErrorMessage, type Participant } from "../lib/api";
import {
  Chip,
  DsButton,
  DsInput,
  DsModal,
  DsToggle,
  Field,
  PlusIcon,
} from "./klaser-ds";

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

  function addCustomRole() {
    const v = customRole.trim();
    if (v && !roles.includes(v)) setRoles((prev) => [...prev, v]);
    setCustomRole("");
  }

  return (
    <DsModal
      title={contact ? "עריכת איש קשר" : "חבר חדש"}
      onClose={onClose}
      onSubmit={submit}
      actions={
        <>
          <DsButton
            type="submit"
            size="compact"
            disabled={busy || !valid}
            icon={contact ? undefined : <PlusIcon />}
          >
            {contact ? "שמור" : "הוסף"}
          </DsButton>
          <DsButton variant="ghost" size="compact" onClick={onClose} disabled={busy}>
            ביטול
          </DsButton>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="שם מלא *">
          <DsInput value={fullName} onChange={setFullName} autoFocus />
        </Field>
        <Field label="מייל *">
          <DsInput type="email" dir="ltr" value={email} onChange={setEmail} />
        </Field>
        <Field label="טלפון">
          <DsInput type="tel" dir="ltr" value={phone} onChange={setPhone} />
        </Field>

        <div>
          <div className="mb-2 font-rubik text-xs font-medium text-turquoise">תפקידים</div>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...roleOptions, ...roles])].map((r) => {
              const on = roles.includes(r);
              return (
                <Chip
                  key={r}
                  variant={on ? "active" : "grey"}
                  onClick={() =>
                    setRoles((prev) => (on ? prev.filter((x) => x !== r) : [...prev, r]))
                  }
                >
                  {r}
                </Chip>
              );
            })}
            {roleOptions.length === 0 && roles.length === 0 && (
              <span className="font-rubik text-xs text-ink-soft">
                אפשר להגדיר בעלי תפקיד בהגדרות, או להוסיף כאן ידנית.
              </span>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <div className="flex-1">
              <DsInput
                value={customRole}
                onChange={setCustomRole}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCustomRole();
                  }
                }}
                placeholder="הוסף תפקיד…"
              />
            </div>
            <DsButton variant="secondary" size="compact" className="border" onClick={addCustomRole}>
              הוסף
            </DsButton>
          </div>
        </div>

        <Field label="תאריך הצטרפות לתפקיד *">
          <DsInput type="date" required value={joinDate} onChange={setJoinDate} />
        </Field>

        {/* DS §2.5 — justify-end puts this row on the visual LEFT. */}
        <div className="flex items-center justify-end gap-8 pt-1">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-ink-soft">חבר</span>
            <DsToggle checked={member} onChange={setMember} ariaLabel="חבר" />
          </label>
          <label
            className="flex items-center gap-2 text-sm"
            title="חבר ועד — מוזמן אוטומטית לכל פגישה"
          >
            <span className="text-ink-soft">חבר ועד</span>
            <DsToggle checked={editorFlag} onChange={setEditorFlag} ariaLabel="חבר ועד" />
          </label>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </DsModal>
  );
}

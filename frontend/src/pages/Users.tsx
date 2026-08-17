import { useEffect, useState } from "react";
import { api, apiErrorMessage, type TenantUserItem } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isAdmin } from "../lib/permissions";
import {
  DsButton,
  DsCard,
  DsInput,
  DsSelect,
  Field,
  PageHeader,
  SectionHeader,
  SendIcon,
  StatusPill,
  TrashIcon,
} from "../components/klaser-ds";

const ROLE_LABELS: Record<string, string> = {
  admin: "מנהל/ת",
  user: "משתמש/ת",
  reviewer: "בודק/ת",
  secretary: "מזכיר/ה",
};

export default function Users() {
  const { state } = useAuth();
  const currentUser = state.kind === "signed_in" ? state.user : null;
  const admin = isAdmin(currentUser);

  const [users, setUsers] = useState<TenantUserItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");

  function load() {
    api
      .listTenantUsers()
      .then(setUsers)
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(() => {
    if (admin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  if (!admin) {
    return (
      <DsCard interactive={false} className="p-8 text-center text-sm text-ink-soft">
        עמוד זה זמין למנהלי הארגון בלבד.
      </DsCard>
    );
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.inviteTenantUser({
        email: email.trim(),
        role,
        display_name: displayName.trim() || null,
      });
      setEmail("");
      setDisplayName("");
      setRole("user");
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, newRole: string) {
    setBusy(true);
    setError(null);
    try {
      await api.updateTenantUser(userId, { role: newRole });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend(userId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.resendTenantUserInvite(userId);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    setBusy(true);
    setError(null);
    try {
      await api.deleteTenantUser(userId);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="משתמשים" />

      <form onSubmit={invite}>
        <DsCard interactive={false} className="mb-8 p-4">
          <SectionHeader>הזמנת משתמש חדש</SectionHeader>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[12rem] flex-1">
              <Field label="אימייל">
                <DsInput type="email" required value={email} onChange={setEmail} dir="ltr" />
              </Field>
            </div>
            <div className="min-w-[12rem] flex-1">
              <Field label="שם (אופציונלי)">
                <DsInput value={displayName} onChange={setDisplayName} />
              </Field>
            </div>
            <div className="w-40">
              <Field label="תפקיד">
                <DsSelect value={role} onChange={(v) => setRole(v as "admin" | "user")}>
                  <option value="user">משתמש/ת</option>
                  <option value="admin">מנהל/ת</option>
                </DsSelect>
              </Field>
            </div>
            <DsButton
              type="submit"
              size="compact"
              disabled={busy || !email.trim()}
              icon={<SendIcon />}
            >
              שלח הזמנה
            </DsButton>
          </div>
        </DsCard>
      </form>

      {error && (
        <div className="mb-4 rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          {error}
        </div>
      )}

      {users === null && !error && <p className="animate-pulse text-sm text-ink-soft">טוען…</p>}

      {users && (
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-[0px_1px_0_rgba(0,0,0,0.03),0px_4px_16px_-4px_rgba(0,0,0,0.06)]">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface font-rubik text-xs uppercase tracking-[0.1em] text-ink-soft">
              <tr>
                <th className="px-4 py-3 font-medium">שם</th>
                <th className="px-4 py-3 font-medium">אימייל</th>
                <th className="px-4 py-3 font-medium">תפקיד</th>
                <th className="px-4 py-3 font-medium">סטטוס</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-line transition hover:bg-turquoise/5">
                  <td className="px-4 py-3">{u.display_name || "—"}</td>
                  <td className="px-4 py-3" dir="ltr">
                    {u.email}
                  </td>
                  <td className="px-4 py-3">
                    <DsSelect
                      value={u.role}
                      disabled={busy || u.id === currentUser?.id}
                      onChange={(v) => changeRole(u.id, v)}
                      className="w-36"
                    >
                      <option value="user">משתמש/ת</option>
                      <option value="admin">מנהל/ת</option>
                      {!["user", "admin"].includes(u.role) && (
                        <option value={u.role}>{ROLE_LABELS[u.role] || u.role}</option>
                      )}
                    </DsSelect>
                  </td>
                  <td className="px-4 py-3">
                    {u.has_password ? (
                      <StatusPill variant="success">פעיל</StatusPill>
                    ) : (
                      <StatusPill variant="warning">ממתין להרשמה</StatusPill>
                    )}
                  </td>
                  <td className="px-4 py-3 text-left">
                    <div className="flex justify-end gap-2 whitespace-nowrap">
                      {!u.has_password && (
                        <DsButton
                          variant="secondary"
                          size="micro"
                          className="border"
                          onClick={() => resend(u.id)}
                          disabled={busy}
                          icon={<SendIcon />}
                        >
                          שלח הזמנה שוב
                        </DsButton>
                      )}
                      {u.id !== currentUser?.id && (
                        <DsButton
                          variant="destructive"
                          size="micro"
                          onClick={() => remove(u.id)}
                          disabled={busy}
                          icon={<TrashIcon />}
                        >
                          הסר
                        </DsButton>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

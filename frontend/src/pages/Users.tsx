import { useEffect, useState } from "react";
import { api, apiErrorMessage, type TenantUserItem } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isAdmin } from "../lib/permissions";

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
      <div className="rounded border border-line bg-white p-6 text-center text-sm text-ink-soft">
        עמוד זה זמין למנהלי הארגון בלבד.
      </div>
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
      <h1 className="mb-6 font-display text-2xl font-bold">משתמשים</h1>

      <form onSubmit={invite} className="mb-8 rounded border border-line bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-ink-soft">הזמנת משתמש חדש</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-ink-soft">אימייל</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-line-strong px-3 py-2"
            />
          </label>
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-ink-soft">שם (אופציונלי)</span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded border border-line-strong px-3 py-2"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-ink-soft">תפקיד</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "user")}
              className="rounded border border-line-strong px-3 py-2"
            >
              <option value="user">משתמש/ת</option>
              <option value="admin">מנהל/ת</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50"
          >
            שלח הזמנה
          </button>
        </div>
      </form>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {users === null && !error && <p className="text-ink-soft">טוען…</p>}

      {users && (
        <div className="overflow-hidden rounded border border-line bg-white">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface text-ink-soft">
              <tr>
                <th className="px-4 py-2 font-medium">שם</th>
                <th className="px-4 py-2 font-medium">אימייל</th>
                <th className="px-4 py-2 font-medium">תפקיד</th>
                <th className="px-4 py-2 font-medium">סטטוס</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-4 py-2">{u.display_name || "—"}</td>
                  <td className="px-4 py-2" dir="ltr">
                    {u.email}
                  </td>
                  <td className="px-4 py-2">
                    <select
                      value={u.role}
                      disabled={busy || u.id === currentUser?.id}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      className="rounded border border-line-strong bg-white px-2 py-1 text-sm"
                    >
                      <option value="user">משתמש/ת</option>
                      <option value="admin">מנהל/ת</option>
                      {!["user", "admin"].includes(u.role) && (
                        <option value={u.role}>{ROLE_LABELS[u.role] || u.role}</option>
                      )}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    {u.has_password ? (
                      <span className="text-emerald-700">פעיל</span>
                    ) : (
                      <span className="text-amber-700">ממתין להרשמה</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-left">
                    <div className="flex justify-end gap-2">
                      {!u.has_password && (
                        <button
                          onClick={() => resend(u.id)}
                          disabled={busy}
                          className="text-xs text-accent-dark hover:underline disabled:opacity-50"
                        >
                          שלח הזמנה שוב
                        </button>
                      )}
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => remove(u.id)}
                          disabled={busy}
                          className="text-xs text-red-700 hover:underline disabled:opacity-50"
                        >
                          הסר
                        </button>
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

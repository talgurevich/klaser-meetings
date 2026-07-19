import { type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isAdmin, isEditor } from "../lib/permissions";

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `rounded px-3 py-1.5 text-sm font-medium transition-colors ${
          isActive ? "bg-accent text-white" : "text-ink-soft hover:bg-line"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { state, signOut } = useAuth();
  const user = state.kind === "signed_in" ? state.user : null;
  const admin = isAdmin(user);

  return (
    <div className="min-h-screen bg-surface text-ink">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-display text-lg font-bold text-accent-dark">
              Klaser Meetings
            </span>
            <nav className="flex items-center gap-1">
              <NavItem to="/home">בית</NavItem>
              <NavItem to="/meetings">ישיבות</NavItem>
              <NavItem to="/topic-pool">מאגר נושאים</NavItem>
              <NavItem to="/participants">משתתפים</NavItem>
              <NavItem to="/action-items">משימות לביצוע</NavItem>
              {admin && <NavItem to="/users">משתמשים</NavItem>}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-ink-soft">
            {user && (
              <span>
                {user.display_name || user.email} · {user.tenant_name || "הארגון"}
              </span>
            )}
            <button
              onClick={() => signOut()}
              className="rounded border border-line-strong px-3 py-1 hover:bg-line"
            >
              התנתק
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}

// Re-exported so pages can gate editor-only UI without re-deriving it.
export function useIsEditor(): boolean {
  const { state } = useAuth();
  return isEditor(state.kind === "signed_in" ? state.user : null);
}

// Same pattern, but for admin-only UI (e.g. deleting a meeting outright —
// see Meetings.tsx) — stricter than useIsEditor, matches backend's
// require_admin (app/services/permissions.py).
export function useIsAdmin(): boolean {
  const { state } = useAuth();
  return isAdmin(state.kind === "signed_in" ? state.user : null);
}

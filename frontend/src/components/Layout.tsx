import { type ReactNode, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { isAdmin, isEditor } from "../lib/permissions";
import { CURRENT_PRODUCT_ID, PRODUCTS } from "../lib/products";

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
  const [menuOpen, setMenuOpen] = useState(false);

  // Portfolio switcher — only shown when the user is entitled to more than
  // one Klaser product. See docs/portfolio-integration.md (elrom-platform
  // repo) and Takanon's App.tsx for the reference implementation this is
  // adapted from (Meetings has no full user dropdown yet, so this is a
  // minimal one built around the existing sign-out button).
  const entitledProducts = PRODUCTS.filter((p) => (user?.entitlements || []).includes(p.id));
  const showSwitcher = entitledProducts.length >= 2;

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
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
              className="flex items-center gap-1.5 rounded px-2 py-1 text-sm text-ink-soft hover:bg-line"
            >
              {user && (
                <span>
                  {user.display_name || user.email} · {user.tenant_name || "הארגון"}
                </span>
              )}
              <span className="text-xs">▾</span>
            </button>
            {menuOpen && (
              <div className="absolute left-0 z-10 mt-2 w-56 overflow-hidden rounded-lg border border-line bg-white shadow-lg">
                {showSwitcher && (
                  <div className="border-b border-line">
                    <div className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-[0.2em] text-ink-soft uppercase">
                      מעבר בין מוצרים
                    </div>
                    {entitledProducts.map((p) =>
                      p.id === CURRENT_PRODUCT_ID ? (
                        <div key={p.id} className="flex items-center justify-between px-4 py-2 text-sm text-ink">
                          <span>{p.label}</span>
                          <span className="text-xs text-accent-dark">• פעיל</span>
                        </div>
                      ) : (
                        <a
                          key={p.id}
                          href={p.url}
                          className="block px-4 py-2 text-sm text-ink-soft hover:bg-line"
                        >
                          {p.label}
                        </a>
                      )
                    )}
                  </div>
                )}
                <button
                  onClick={() => signOut()}
                  className="block w-full px-4 py-2.5 text-sm text-ink-soft hover:bg-line"
                >
                  התנתק
                </button>
              </div>
            )}
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

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isAdmin, isEditor } from "../lib/permissions";
import { CURRENT_PRODUCT_ID, PRODUCTS } from "../lib/products";

const SIDEBAR_COLLAPSED_KEY = "klaser-meetings.sidebarCollapsed";

const Icon = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 11l8-7 8 7v9a2 2 0 0 1-2 2h-4v-6h-4v6H6a2 2 0 0 1-2-2z" />
    </svg>
  ),
  meetings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <line x1="4" y1="10" x2="20" y2="10" />
      <line x1="8" y1="3" x2="8" y2="7" />
      <line x1="16" y1="3" x2="16" y2="7" />
    </svg>
  ),
  committees: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="3" />
      <circle cx="17" cy="10" r="2.5" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M15 20a4 4 0 0 1 6.5-3.1" />
    </svg>
  ),
  topicPool: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="14" y2="18" />
      <circle cx="19" cy="18" r="1.5" />
    </svg>
  ),
  participants: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <circle cx="12" cy="10" r="2.5" />
      <path d="M8.5 17c.7-1.8 2-2.5 3.5-2.5s2.8.7 3.5 2.5" />
    </svg>
  ),
  actionItems: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <polyline points="8 12 11 15 16 9" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 20a4 4 0 0 1 6-3" />
    </svg>
  ),
} as const;

type IconKey = keyof typeof Icon;

type NavDef = { to: string; label: string; iconKey: IconKey; adminOnly?: boolean };

const ALL_NAV: NavDef[] = [
  { to: "/home", label: "בית", iconKey: "home" },
  { to: "/meetings", label: "ישיבות", iconKey: "meetings" },
  { to: "/assemblies", label: "אסיפות", iconKey: "committees" },
  { to: "/topic-pool", label: "מאגר נושאים", iconKey: "topicPool" },
  { to: "/participants", label: "אלפון", iconKey: "participants" },
  { to: "/action-items", label: "משימות לביצוע", iconKey: "actionItems" },
  { to: "/settings", label: "הגדרות", iconKey: "settings" },
  { to: "/users", label: "משתמשים", iconKey: "users", adminOnly: true },
];

function InitialAvatar({ name }: { name: string }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="flex h-8 w-8 items-center justify-center bg-ink text-sm font-bold text-surface">
      {initial}
    </div>
  );
}

function HamburgerIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="square"
    >
      {open ? (
        <>
          <line x1="5" y1="5" x2="19" y2="19" />
          <line x1="19" y1="5" x2="5" y2="19" />
        </>
      ) : (
        <>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="20" y2="17" />
        </>
      )}
    </svg>
  );
}

function CollapseChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {collapsed ? (
        <polyline points="9 6 15 12 9 18" />
      ) : (
        <polyline points="15 6 9 12 15 18" />
      )}
    </svg>
  );
}

function SideNav({
  collapsed,
  navs,
  onSelect,
}: {
  collapsed: boolean;
  navs: NavDef[];
  onSelect: () => void;
}) {
  return (
    <nav className="flex flex-col text-sm" aria-label="ניווט ראשי">
      <div
        className={`border-b border-line ${
          collapsed ? "flex justify-center px-2 py-3" : "px-5 py-4"
        }`}
      >
        {collapsed ? (
          <div
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center bg-ink font-display text-xs font-black tracking-tight text-surface"
          >
            קלס
          </div>
        ) : (
          <>
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-ink-soft">
              ניווט
            </div>
            <div className="mt-1 font-display text-lg font-black leading-tight text-ink">
              ישיבות ופרוטוקולים
            </div>
          </>
        )}
      </div>
      <ul className={`flex flex-col ${collapsed ? "gap-1 px-2 pt-3" : "gap-0.5 px-3 pt-4"}`}>
        {navs.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end
              onClick={onSelect}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) =>
                `group relative flex w-full items-center transition-colors ${
                  collapsed
                    ? "mx-auto h-11 w-11 justify-center rounded-md"
                    : "gap-3 rounded-md py-2.5 pl-2 pr-3"
                } ${
                  isActive
                    ? "bg-ink text-surface"
                    : "text-ink-soft hover:bg-line/50 hover:text-ink"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !collapsed && (
                    <span className="absolute right-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-l bg-accent" />
                  )}
                  <span
                    className={`shrink-0 ${collapsed ? "h-5 w-5" : "h-[18px] w-[18px]"}`}
                    aria-hidden="true"
                  >
                    {Icon[n.iconKey]}
                  </span>
                  {!collapsed && (
                    <span className="flex-1 truncate text-right">{n.label}</span>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { state, signOut } = useAuth();
  const user = state.kind === "signed_in" ? state.user : null;
  const admin = isAdmin(user);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });

  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!user) {
      setLogoUrl(null);
      return;
    }
    let cancelled = false;
    api
      .getTenantSettings()
      .then((s) => {
        if (!cancelled) setLogoUrl(s.logo_url);
      })
      .catch(() => {
        if (!cancelled) setLogoUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.tenant_id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  const visibleNavs = useMemo(
    () => ALL_NAV.filter((n) => !n.adminOnly || admin),
    [admin]
  );

  const entitledProducts = PRODUCTS.filter((p) => (user?.entitlements || []).includes(p.id));
  const showSwitcher = entitledProducts.length >= 2;

  const closeMobileDrawer = () => setSidebarOpen(false);

  return (
    <div className="flex min-h-screen flex-col bg-line/10 font-sans text-ink">
      <header className="sticky top-0 z-30 border-b border-ink bg-surface">
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex shrink-0 items-baseline gap-3">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={user?.tenant_name || "לוגו"}
                className="h-9 w-auto max-w-[180px] object-contain"
              />
            ) : (
              <span className="font-display text-2xl font-black leading-none tracking-tight text-ink">
                {user?.tenant_name || "—"}
              </span>
            )}
            <span className="hidden border-r border-line-strong pr-3 text-[10px] uppercase tracking-[0.2em] text-ink-soft sm:inline">
              Klaser Meetings
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
                className="flex items-center gap-2 px-2 py-1 transition hover:bg-line/60"
              >
                <InitialAvatar name={user?.display_name || user?.email || "?"} />
                <span className="hidden max-w-[140px] truncate text-sm text-ink-soft md:block">
                  {user?.display_name || user?.email}
                </span>
              </button>
              {menuOpen && (
                <div className="absolute left-0 mt-2 w-56 animate-fade-up overflow-hidden border border-ink bg-surface">
                  {user && (
                    <div className="border-b border-line px-4 py-3">
                      <div className="truncate text-sm font-semibold text-ink">
                        {user.display_name || "—"}
                      </div>
                      <div className="truncate text-xs text-ink-soft">
                        {user.email}
                      </div>
                      {user.tenant_name && (
                        <div className="mt-1 inline-block text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                          {user.tenant_name}
                        </div>
                      )}
                    </div>
                  )}
                  {showSwitcher && (
                    <div className="border-b border-line">
                      <div className="px-4 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-soft">
                        מעבר בין מוצרים
                      </div>
                      {entitledProducts.map((p) =>
                        p.id === CURRENT_PRODUCT_ID ? (
                          <div
                            key={p.id}
                            className="flex items-center justify-between px-4 py-2 text-sm text-ink"
                          >
                            <span>{p.label}</span>
                            <span className="text-xs text-accent">• פעיל</span>
                          </div>
                        ) : (
                          <a
                            key={p.id}
                            href={p.url}
                            className="block px-4 py-2 text-sm text-ink-soft hover:bg-line/40 hover:text-ink"
                          >
                            {p.label}
                          </a>
                        )
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => signOut()}
                    className="block w-full px-4 py-2.5 text-right text-sm text-ink-soft hover:bg-line/40 hover:text-ink"
                  >
                    התנתק
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="p-2 text-ink transition hover:bg-line/60 lg:hidden"
              aria-label={sidebarOpen ? "סגור תפריט" : "פתח תפריט"}
              aria-expanded={sidebarOpen}
            >
              <HamburgerIcon open={sidebarOpen} />
            </button>
          </div>
        </div>
      </header>

      <aside
        className={`fixed bottom-0 right-0 top-16 z-20 hidden flex-col border-l border-ink bg-surface shadow-[inset_1px_0_0_rgba(0,0,0,0.02)] transition-[width] duration-200 ease-out lg:flex ${
          sidebarCollapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex-1 overflow-y-auto py-2">
          <SideNav collapsed={sidebarCollapsed} navs={visibleNavs} onSelect={closeMobileDrawer} />
        </div>
        <button
          onClick={() => setSidebarCollapsed((c) => !c)}
          className={`flex items-center border-t border-line px-3 py-3 text-xs text-ink-soft transition-colors hover:bg-line/40 hover:text-ink ${
            sidebarCollapsed ? "justify-center" : "justify-between gap-2"
          }`}
          aria-label={sidebarCollapsed ? "הרחב תפריט" : "כווץ תפריט"}
          title={sidebarCollapsed ? "הרחב תפריט" : "כווץ תפריט"}
        >
          {!sidebarCollapsed && <span>כווץ</span>}
          <CollapseChevron collapsed={sidebarCollapsed} />
        </button>
      </aside>

      <div className="flex min-h-0 w-full flex-1">
        <main
          className={`mx-auto w-full max-w-5xl flex-1 animate-fade-up px-4 py-8 transition-[padding] duration-200 ease-out md:px-6 md:py-12 ${
            sidebarCollapsed ? "lg:pr-20" : "lg:pr-64"
          }`}
        >
          {children}
        </main>
      </div>

      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-30 animate-fade-up bg-ink/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="fixed bottom-0 right-0 top-16 z-40 w-64 animate-fade-up overflow-y-auto border-l border-ink bg-surface lg:hidden"
            role="dialog"
            aria-label="תפריט ניווט"
          >
            <SideNav collapsed={false} navs={visibleNavs} onSelect={closeMobileDrawer} />
          </aside>
        </>
      )}

      <footer
        className={`mt-20 border-t border-ink bg-surface transition-[padding] duration-200 ease-out ${
          sidebarCollapsed ? "lg:pr-16" : "lg:pr-60"
        }`}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-ink-soft">
          <span>© כל הזכויות שמורות לקלסר</span>
          <span className="flex items-center gap-3">
            <a
              href="mailto:tal.gurevich@elrom.tv"
              className="transition-colors hover:text-accent"
            >
              תמיכה: tal.gurevich@elrom.tv
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

export function useIsEditor(): boolean {
  const { state } = useAuth();
  return isEditor(state.kind === "signed_in" ? state.user : null);
}

export function useIsAdmin(): boolean {
  const { state } = useAuth();
  return isAdmin(state.kind === "signed_in" ? state.user : null);
}

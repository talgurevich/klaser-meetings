import { type ReactNode, useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { isAdmin, isEditor } from "../lib/permissions";
import { CURRENT_PRODUCT_ID, PRODUCTS } from "../lib/products";
import { CollapseChevron, HamburgerIcon, NavIcon } from "./klaser-ds";

const SIDEBAR_COLLAPSED_KEY = "klaser-meetings.sidebarCollapsed";

type IconKey = keyof typeof NavIcon;

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
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 font-rubik text-sm font-bold text-white">
      {initial}
    </div>
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
          collapsed ? "flex justify-center px-2 py-4" : "px-4 py-4"
        }`}
      >
        {collapsed ? (
          <div
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-turquoise font-rubik text-xs font-bold text-white"
          >
            אוג
          </div>
        ) : (
          <>
            <div className="font-rubik text-[11px] font-bold uppercase tracking-[0.15em] text-turquoise">
              ניווט
            </div>
            <div className="mt-1 font-rubik text-base font-bold leading-tight text-ink">
              אוגדן
            </div>
          </>
        )}
      </div>
      <ul className={`flex flex-col ${collapsed ? "gap-1 px-2 pt-4" : "gap-1 px-4 pt-4"}`}>
        {navs.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end
              onClick={onSelect}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) =>
                `group relative flex w-full items-center rounded-md font-rubik text-sm font-medium transition-colors ${
                  collapsed
                    ? "mx-auto h-11 w-11 justify-center"
                    : "gap-3 px-3 py-2.5"
                } ${
                  isActive
                    ? "bg-turquoise text-white"
                    : "text-ink-soft hover:bg-turquoise/5 hover:text-turquoise"
                }`
              }
            >
              {() => (
                <>
                  <span
                    className={`shrink-0 ${collapsed ? "h-5 w-5" : "h-[18px] w-[18px]"}`}
                    aria-hidden="true"
                  >
                    {NavIcon[n.iconKey]}
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
    <div className="flex min-h-screen flex-col bg-surface font-sans text-ink">
      {/* DS §6.4 — turquoise header, brand on the right, actions on the left. */}
      <header className="sticky top-0 z-30 bg-turquoise text-white">
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex shrink-0 items-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={user?.tenant_name || "לוגו"}
                className="h-9 w-auto max-w-[180px] object-contain"
              />
            )}
            <span className="font-rubik text-2xl font-bold leading-none text-white">
              {user?.tenant_name || "—"}
            </span>
            {/* Product wordmark. Hebrew, so no `uppercase`/heavy tracking. */}
            <span className="hidden border-r border-white/25 pr-3 font-rubik text-sm font-bold text-white/75 sm:inline">
              אוגדן
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative shrink-0">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
                className="flex items-center gap-2 rounded-md px-2 py-1 transition hover:bg-white/10"
              >
                <InitialAvatar name={user?.display_name || user?.email || "?"} />
                <span className="hidden max-w-[140px] truncate font-rubik text-sm text-white/85 md:block">
                  {user?.display_name || user?.email}
                </span>
              </button>
              {menuOpen && (
                <div className="absolute left-0 mt-2 w-56 animate-fade-up overflow-hidden rounded-lg border border-line bg-white text-ink shadow-[0px_1px_0_rgba(0,0,0,0.03),0px_4px_16px_-4px_rgba(0,0,0,0.06)]">
                  {user && (
                    <div className="border-b border-line px-4 py-3">
                      <div className="truncate text-sm font-semibold text-ink">
                        {user.display_name || "—"}
                      </div>
                      <div className="truncate font-rubik text-xs text-ink-soft">
                        {user.email}
                      </div>
                      {user.tenant_name && (
                        <div className="mt-1 inline-block font-rubik text-[11px] font-bold uppercase tracking-[0.15em] text-turquoise">
                          {user.tenant_name}
                        </div>
                      )}
                    </div>
                  )}
                  {showSwitcher && (
                    <div className="border-b border-line">
                      <div className="px-4 pb-1 pt-3 font-rubik text-[11px] font-bold uppercase tracking-[0.15em] text-ink-soft">
                        מעבר בין מוצרים
                      </div>
                      {entitledProducts.map((p) =>
                        p.id === CURRENT_PRODUCT_ID ? (
                          <div
                            key={p.id}
                            className="flex items-center justify-between px-4 py-2 text-sm text-ink"
                          >
                            <span>{p.label}</span>
                            <span className="font-rubik text-xs text-turquoise">• פעיל</span>
                          </div>
                        ) : (
                          <a
                            key={p.id}
                            href={p.url}
                            className="block px-4 py-2 text-sm text-ink-soft hover:bg-turquoise/5 hover:text-turquoise"
                          >
                            {p.label}
                          </a>
                        )
                      )}
                    </div>
                  )}
                  <button
                    onClick={() => signOut()}
                    className="block w-full px-4 py-2.5 text-right text-sm text-ink-soft hover:bg-turquoise/5 hover:text-turquoise"
                  >
                    התנתק
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="rounded-md p-2 text-white transition hover:bg-white/10 lg:hidden"
              aria-label={sidebarOpen ? "סגור תפריט" : "פתח תפריט"}
              aria-expanded={sidebarOpen}
            >
              <HamburgerIcon open={sidebarOpen} />
            </button>
          </div>
        </div>
      </header>

      <aside
        className={`fixed bottom-0 right-0 top-16 z-20 hidden flex-col border-l border-line bg-white transition-[width] duration-200 ease-out lg:flex ${
          sidebarCollapsed ? "w-16" : "w-60"
        }`}
      >
        <div className="flex-1 overflow-y-auto py-2">
          <SideNav collapsed={sidebarCollapsed} navs={visibleNavs} onSelect={closeMobileDrawer} />
        </div>
        <button
          onClick={() => setSidebarCollapsed((c) => !c)}
          className={`flex items-center border-t border-line px-4 py-3 font-rubik text-xs text-ink-soft transition-colors hover:bg-turquoise/5 hover:text-turquoise ${
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
            className="fixed bottom-0 right-0 top-16 z-40 w-64 animate-fade-up overflow-y-auto border-l border-line bg-white lg:hidden"
            role="dialog"
            aria-label="תפריט ניווט"
          >
            <SideNav collapsed={false} navs={visibleNavs} onSelect={closeMobileDrawer} />
          </aside>
        </>
      )}

      <footer
        className={`mt-20 border-t border-line bg-white transition-[padding] duration-200 ease-out ${
          sidebarCollapsed ? "lg:pr-16" : "lg:pr-60"
        }`}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 font-rubik text-xs text-ink-soft">
          <span>© כל הזכויות שמורות לקלסר</span>
          <span className="flex items-center gap-3">
            <a
              href="mailto:tal.gurevich@elrom.tv"
              className="transition-colors hover:text-turquoise"
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

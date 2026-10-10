import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Sprout,
  House,
  CloudSun,
  ChartNoAxesCombined,
  BookOpen,
  Users,
  Package,
  MessageSquare,
  Settings,
  Wifi,
  WifiOff,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  Menu,
  X,
  ArrowUpRight,
  Bot,
  Check,
  CalendarDays,
  PackageCheck,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { initials } from "../lib/format";
import { AppUpdate } from "./AppUpdate";
import { WorkspaceSearch } from "./WorkspaceSearch";
import { Skeleton, trapFocus } from "./ui";
import {
  CORE_NAVIGATION,
  activeNavigationGroup,
  navigationFor,
  navigationLabel,
  type NavigationIcon,
  type NavigationItem,
} from "../lib/navigation";
import type { Role } from "../types";
import "../styles/navigation.css";
const MOBILE_QUERY = "(max-width: 960px)";
const icons: Record<NavigationIcon, typeof House> = {
  home: House,
  farm: Sprout,
  weather: CloudSun,
  prices: ChartNoAxesCombined,
  learn: BookOpen,
  season: CalendarDays,
  harvest: PackageCheck,
  community: Users,
  assistant: Bot,
  farmers: Users,
  trade: Package,
  messages: MessageSquare,
  admin: Settings,
};

function NavigationLinks({
  items,
  onNavigate,
}: {
  items: readonly NavigationItem[];
  onNavigate: () => void;
}) {
  return items.map(({ to, label, icon }) => {
    const Icon = icons[icon];
    return (
      <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate}>
        <Icon size={22} aria-hidden="true" />
        <span>{label}</span>
      </NavLink>
    );
  });
}

function SidebarNavigation({
  role,
  pathname,
  onNavigate,
}: {
  role: Role | undefined;
  pathname: string;
  onNavigate: () => void;
}) {
  const navigation = navigationFor(role);
  const activeGroup = activeNavigationGroup(pathname, role);
  const [expanded, setExpanded] = useState(activeGroup);
  useEffect(() => setExpanded(activeGroup), [pathname, activeGroup]);
  return (
    <nav
      className="sidebar-navigation simple-navigation"
      aria-label="Main navigation"
    >
      <div className="navigation-core">
        <NavigationLinks items={navigation.core} onNavigate={onNavigate} />
      </div>
      <div className="navigation-tools">
        <button
          type="button"
          className={`navigation-group-toggle ${activeGroup === "more" ? "has-active-route" : ""}`}
          aria-expanded={expanded === "more"}
          aria-controls="navigation-more-tools"
          onClick={() =>
            setExpanded((current) => (current === "more" ? null : "more"))
          }
        >
          <MoreHorizontal size={22} aria-hidden="true" />
          <span>More tools</span>
          <ChevronDown size={17} aria-hidden="true" />
        </button>
        <div
          id="navigation-more-tools"
          className="navigation-group-links"
          hidden={expanded !== "more"}
        >
          <NavigationLinks items={navigation.more} onNavigate={onNavigate} />
        </div>
        {navigation.cooperative.length > 0 && (
          <>
            <button
              type="button"
              className={`navigation-group-toggle ${activeGroup === "cooperative" ? "has-active-route" : ""}`}
              aria-expanded={expanded === "cooperative"}
              aria-controls="navigation-cooperative-tools"
              onClick={() =>
                setExpanded((current) =>
                  current === "cooperative" ? null : "cooperative",
                )
              }
            >
              <Users size={22} aria-hidden="true" />
              <span>Cooperative tools</span>
              <ChevronDown size={17} aria-hidden="true" />
            </button>
            <div
              id="navigation-cooperative-tools"
              className="navigation-group-links"
              hidden={expanded !== "cooperative"}
            >
              <NavigationLinks
                items={navigation.cooperative}
                onNavigate={onNavigate}
              />
            </div>
          </>
        )}
      </div>
    </nav>
  );
}
export function Shell() {
  const { user, data, demo, online, queue, toast } = useApp();
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches,
  );
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    setMenu(false);
  }, [location.pathname]);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const changed = () => {
      setMobile(media.matches);
      if (!media.matches) setMenu(false);
    };
    media.addEventListener("change", changed);
    changed();
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (!menu || !mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Visibility transitions and removing inert need a rendered frame before
    // focus is accepted. Do not steal focus if the user has already tabbed in.
    let focusFrame = window.requestAnimationFrame(() => {
      focusFrame = window.requestAnimationFrame(() => {
        if (!drawerRef.current?.contains(document.activeElement)) {
          closeRef.current?.focus({ preventScroll: true });
        }
      });
    });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenu(false);
      }
      if (drawerRef.current) trapFocus(event, drawerRef.current);
    };
    document.addEventListener("keydown", key);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", key);
      const target =
        previous?.isConnected &&
        previous !== document.body &&
        previous.getClientRects().length
          ? previous
          : window.matchMedia(MOBILE_QUERY).matches
            ? moreRef.current
            : drawerRef.current?.querySelector<HTMLElement>("a.active");
      target?.focus();
    };
  }, [menu, mobile]);
  const currentLabel = navigationLabel(location.pathname, user?.role);
  const drawerOpen = menu && mobile;
  const connectionLabel = !online
    ? `Offline${queue.length ? `; ${queue.length} changes awaiting sync` : ""}. Open connection settings.`
    : `${queue.length} changes waiting to sync. Open connection settings.`;
  return (
    <div className={`app-shell ${data.settings.lowDataMode ? "low-data" : ""}`}>
      <a
        className="skip-link"
        href="#main-content"
        tabIndex={drawerOpen ? -1 : undefined}
        aria-hidden={drawerOpen || undefined}
      >
        Skip to content
      </a>
      {drawerOpen && (
        <button
          className="nav-backdrop"
          type="button"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        id="workspace-navigation"
        ref={drawerRef}
        className={`sidebar ${drawerOpen ? "sidebar-open" : ""}`}
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen || undefined}
        aria-label="Workspace navigation"
        aria-hidden={(mobile && !drawerOpen) || undefined}
        inert={mobile && !drawerOpen}
        tabIndex={-1}
      >
        <div className="sidebar-top">
          <Link className="brand" to="/" onClick={() => setMenu(false)}>
            <Sprout size={32} strokeWidth={1.7} />
            <span>Agribridge</span>
          </Link>
          <button
            className="icon-button mobile-close"
            type="button"
            ref={closeRef}
            onClick={() => setMenu(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
          <Link
            to="/settings"
            className="workspace-name"
            onClick={() => setMenu(false)}
          >
            <span>
              {user?.organizationName.replace(" · Sample cooperative", "")}
            </span>
            <ChevronRight size={16} />
          </Link>
        </div>
        <SidebarNavigation
          key={`${user?.organizationId}:${user?.id}:${user?.role}`}
          role={user?.role}
          pathname={location.pathname}
          onNavigate={() => setMenu(false)}
        />
        <div className="sidebar-bottom">
          <Link
            className="navigation-about"
            to="/welcome"
            onClick={() => setMenu(false)}
          >
            <BookOpen size={18} aria-hidden="true" />
            About Agribridge
          </Link>
          <NavLink to="/settings" onClick={() => setMenu(false)}>
            <Wifi size={20} />
            Settings & connection
          </NavLink>
          <Link
            to="/settings"
            className="profile"
            onClick={() => setMenu(false)}
          >
            <span className="avatar">{initials(user?.name ?? "")}</span>
            <span>
              {user?.name}
              <small>
                {user?.role === "farmer"
                  ? "Farmer workspace"
                  : "Cooperative workspace"}
              </small>
            </span>
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </aside>
      <div className="main-shell" inert={drawerOpen}>
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace / </span>
            <strong>{currentLabel}</strong>
          </div>
          <Link to="/" className="mobile-brand">
            <Sprout size={27} />
            Agribridge
          </Link>
          <WorkspaceSearch />
          {!mobile && (
            <div className="topbar-right">
              {!online ? (
                <Link
                  to="/settings"
                  className="connection-label offline"
                  aria-label={connectionLabel}
                  title={connectionLabel}
                >
                  <WifiOff size={14} />
                  {`Offline${queue.length ? ` · ${queue.length} pending` : ""}`}
                </Link>
              ) : queue.length ? (
                <Link
                  to="/settings"
                  className="connection-label"
                  aria-label={connectionLabel}
                  title={connectionLabel}
                >
                  {queue.length} waiting to sync
                </Link>
              ) : (
                <span className="demo-label">
                  {demo ? "Demo workspace" : "Your workspace"}
                </span>
              )}
              <Link
                className="avatar"
                to="/settings"
                aria-label="Profile and settings"
              >
                {initials(user?.name ?? "")}
              </Link>
            </div>
          )}
          <button
            type="button"
            ref={moreRef}
            className="mobile-menu-trigger"
            onClick={() => setMenu(true)}
            aria-expanded={drawerOpen}
            aria-controls="workspace-navigation"
            aria-haspopup="dialog"
          >
            <Menu size={22} aria-hidden="true" />
            <span>Menu</span>
          </button>
        </header>
        {mobile && (demo || !online || queue.length > 0) && (
          <div className="mobile-workspace-status">
            {demo && <span>Demo workspace</span>}
            {(!online || queue.length > 0) && (
              <Link to="/settings" aria-label={connectionLabel}>
                {!online ? (
                  <WifiOff size={14} aria-hidden="true" />
                ) : (
                  <Wifi size={14} aria-hidden="true" />
                )}
                {!online ? "Offline" : `${queue.length} waiting to sync`}
              </Link>
            )}
          </div>
        )}
        {!online && (
          <div className="offline-banner">
            <WifiOff size={16} />
            You’re offline. Saved lessons and farm records are available. Fresh
            weather needs a connection.
          </div>
        )}
        <main id="main-content" tabIndex={-1}>
          <AppUpdate />
          <Suspense fallback={<Skeleton />}>
            <Outlet />
          </Suspense>
        </main>
        <div className="page-footer">
          <Sprout size={15} />
          <span>Growing together, one season at a time.</span>
          <span>Uganda</span>
        </div>
      </div>
      <nav
        className="mobile-nav"
        aria-label="Mobile navigation"
        inert={drawerOpen || !mobile}
      >
        {CORE_NAVIGATION.map(({ to, label, icon }) => {
          const Icon = icons[icon];
          return (
            <NavLink key={to} to={to} end={to === "/"}>
              <Icon size={22} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

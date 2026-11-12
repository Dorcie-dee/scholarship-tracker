'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth-context';
import { Drawer } from '@/components/ui/drawer';
import {
  ApplicationsIcon,
  ArrowLeftIcon,
  HomeIcon,
  type IconProps,
  LockIcon,
  LogOutIcon,
  MoreIcon,
  SearchIcon,
  SettingsIcon,
  UserIcon,
} from '@/components/icons';

const NAV_ITEMS: Array<{ href: string; label: string; shortLabel: string; icon: ComponentType<IconProps> }> = [
  { href: '/dashboard', label: 'Dashboard', shortLabel: 'Dashboard', icon: HomeIcon },
  { href: '/applications', label: 'My applications', shortLabel: 'Applications', icon: ApplicationsIcon },
  { href: '/opportunities', label: 'My opportunities', shortLabel: 'Opportunities', icon: SearchIcon },
  { href: '/profile', label: 'Profile', shortLabel: 'Profile', icon: UserIcon },
];

/** Only shown to admins — appended in `SidebarContents` rather than kept in `NAV_ITEMS` itself, so that static array stays the same for every other user. */
const ADMIN_NAV_ITEM: { href: string; label: string; shortLabel: string; icon: ComponentType<IconProps> } = {
  href: '/admin',
  label: 'Admin',
  shortLabel: 'Admin',
  icon: LockIcon,
};

const COLLAPSE_KEY = 'schola:sidebar-collapsed';

function initials(name: string | null, email: string): string {
  const source = (name ?? email).trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors',
        collapsed && 'justify-center px-0',
        active ? 'bg-primary-soft text-primary' : 'text-ink-soft hover:bg-line-soft hover:text-ink',
      )}
    >
      <Icon size={20} className="flex-none" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {collapsed && (
        <span
          role="tooltip"
          aria-hidden="true"
          className="pointer-events-none absolute left-full ml-3 whitespace-nowrap rounded-md bg-ink px-2.5 py-1.5 text-xs font-semibold text-paper opacity-0 shadow-popover transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          {item.label}
        </span>
      )}
    </Link>
  );
}

function SidebarContents({
  collapsed,
  onToggleCollapsed,
  onNavigate,
  showCollapseToggle,
}: {
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  showCollapseToggle: boolean;
}) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const navItems = user?.role === 'admin' ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto scrollbar-thin px-3 py-6">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={cn('flex items-center gap-2.5 px-1', collapsed && 'justify-center px-0')}
      >
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary font-display text-lg font-bold text-white">
          S
        </span>
        {!collapsed && <span className="font-display text-lg font-semibold text-ink">Schola</span>}
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <NavLink key={item.href} item={item} active={active} collapsed={collapsed} onNavigate={onNavigate} />
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3 border-t border-line pt-4">
        {showCollapseToggle && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-ink-faint transition-colors hover:bg-line-soft hover:text-ink',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ArrowLeftIcon size={16} className={cn('flex-none transition-transform', collapsed && 'rotate-180')} aria-hidden="true" />
            {!collapsed && <span>Collapse</span>}
          </button>
        )}

        <div className={cn('flex items-center gap-2.5 px-1', collapsed && 'justify-center px-0')}>
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">
            {user ? initials(user.name, user.email) : '··'}
          </span>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{user?.name ?? 'Your account'}</p>
              <p className="truncate text-xs text-ink-faint">{user?.email ?? ''}</p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => void logout()}
          title={collapsed ? 'Sign out' : undefined}
          aria-label={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-ink-faint transition-colors hover:bg-line-soft hover:text-ink',
            collapsed && 'justify-center px-0',
          )}
        >
          <LogOutIcon size={16} className="flex-none" aria-hidden="true" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </div>
  );
}

/** One row inside the mobile "More" sheet — Settings/Admin/Sign out: the
 * destinations that don't fit in the 4-slot bottom nav. Deliberately plainer
 * than `NavLink` (no collapsed/tooltip mode to support, since the sheet is
 * always full-width). */
function MoreSheetLink({
  href,
  icon: Icon,
  label,
  onNavigate,
}: {
  href: string;
  icon: ComponentType<IconProps>;
  label: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-line-soft hover:text-ink"
    >
      <Icon size={20} className="flex-none" aria-hidden="true" />
      {label}
    </Link>
  );
}

/** The persistent mobile primary nav — replaces a hamburger-and-drawer as
 * the default below `md`. Same four destinations as the desktop/tablet
 * rail, same `aria-current`; just a different presentation. */
function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-2 py-2 text-[11px] font-semibold transition-colors',
              active ? 'text-primary' : 'text-ink-faint hover:text-ink-soft',
            )}
          >
            <Icon size={22} aria-hidden="true" />
            <span className="truncate">{item.shortLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  useEffect(() => {
    try {
      // Deliberately deferred to an effect, not a lazy useState initializer:
      // localStorage doesn't exist during SSR, so reading it synchronously
      // during render would mismatch the server-rendered markup. This one
      // extra render (expanded, then possibly collapsed) is the standard
      // trade-off for persisting client-only state without a hydration
      // mismatch, not an unintentional cascading-render bug.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // Storage unavailable (private browsing, etc.) — default stays expanded.
    }
  }, []);

  useEffect(() => {
    // Same trade-off as above: closes the "More" sheet after a navigation
    // triggered from inside it, which only `pathname` changing can detect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMoreOpen(false);
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        // Ignore — collapse state just won't persist this session.
      }
      return next;
    });
  }

  return (
    <>
      {/* Mobile top bar — paired with `BottomNav` below `md`. Its one action
          is "More": Settings/Admin/Sign out, the destinations that don't fit
          in the bottom nav's 4 primary slots. */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-white">
            S
          </span>
          <span className="font-display text-base font-semibold text-ink">Schola</span>
        </Link>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="More options"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-line-soft"
        >
          <MoreIcon size={22} aria-hidden="true" />
        </button>
      </header>

      <Drawer open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <nav aria-label="More" className="flex flex-col gap-1">
          <MoreSheetLink href="/settings" icon={SettingsIcon} label="Settings" onNavigate={() => setMoreOpen(false)} />
          {user?.role === 'admin' && (
            <MoreSheetLink href="/admin" icon={LockIcon} label="Admin" onNavigate={() => setMoreOpen(false)} />
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:bg-line-soft hover:text-ink"
          >
            <LogOutIcon size={20} className="flex-none" aria-hidden="true" />
            Sign out
          </button>
        </nav>
      </Drawer>

      <BottomNav />

      {/* Tablet rail — icon-only, no expand/collapse toggle: at this width
          there isn't enough room for a labeled rail, and a mid-breakpoint
          toggle would be one more piece of state to explain for a range
          users pass through on their way to desktop. Tooltips on hover/focus
          (built into `NavLink`'s collapsed mode) carry the labels instead. */}
      <aside className="sticky top-0 hidden h-dvh w-20 flex-none border-r border-line bg-surface md:flex lg:hidden">
        <SidebarContents collapsed showCollapseToggle={false} />
      </aside>

      {/* Desktop rail — sticky + independently scrollable, so it never loses
          its footing while the page content scrolls past it. */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh flex-none border-r border-line bg-surface transition-[width] duration-200 ease-in-out lg:flex',
          collapsed ? 'w-20' : 'w-64',
        )}
      >
        <SidebarContents collapsed={collapsed} onToggleCollapsed={toggleCollapsed} showCollapseToggle />
      </aside>
    </>
  );
}

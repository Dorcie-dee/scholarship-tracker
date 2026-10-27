'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ComponentType } from 'react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/lib/auth-context';
import {
  ApplicationsIcon,
  ArrowLeftIcon,
  HomeIcon,
  type IconProps,
  LogOutIcon,
  MenuIcon,
  SearchIcon,
  UserIcon,
  XIcon,
} from '@/components/icons';

const NAV_ITEMS: Array<{ href: string; label: string; icon: ComponentType<IconProps> }> = [
  { href: '/dashboard', label: 'Dashboard', icon: HomeIcon },
  { href: '/applications', label: 'My applications', icon: ApplicationsIcon },
  { href: '/discover', label: 'Discover', icon: SearchIcon },
  { href: '/profile', label: 'Profile', icon: UserIcon },
];

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
        {NAV_ITEMS.map((item) => {
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

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // Storage unavailable (private browsing, etc.) — default stays expanded.
    }
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Lock background scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

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
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-display text-sm font-bold text-white">
            S
          </span>
          <span className="font-display text-base font-semibold text-ink">Schola</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation menu"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-line-soft"
        >
          <MenuIcon size={22} aria-hidden="true" />
        </button>
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-popover">
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-line-soft"
              >
                <XIcon size={20} aria-hidden="true" />
              </button>
            </div>
            <SidebarContents collapsed={false} showCollapseToggle={false} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

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

'use client';

import {
  BankOutlined,
  CheckSquareOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  StarOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Drawer, Dropdown, Layout, Menu, Spin, Tooltip } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BrandMark } from '@/components/BrandMark';
import { VerifyEmailBanner } from '@/components/VerifyEmailBanner';
import { useAuth } from '@/lib/auth-context';

const { Header, Sider, Content } = Layout;

const SIDER_EXPANDED = 260;
const SIDER_COLLAPSED = 72;

function initialsFor(name: string | null, email: string): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    return (parts[0]![0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }
  return email[0]!.toUpperCase();
}

const NAV = [
  { key: 'dashboard', href: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: 'universities', href: '/universities', icon: <BankOutlined />, label: 'Universities' },
  { key: 'opportunities', href: '/opportunities', icon: <StarOutlined />, label: 'Opportunities' },
  { key: 'tasks', href: '/tasks', icon: <CheckSquareOutlined />, label: 'Tasks' },
  { key: 'documents', href: '/documents', icon: <FileTextOutlined />, label: 'Documents' },
  { key: 'profile', href: '/profile', icon: <UserOutlined />, label: 'Profile' },
] as const;

function navKeyFromPath(pathname: string): string {
  if (pathname.startsWith('/journeys') || pathname.startsWith('/applications')) return 'dashboard';
  const match = NAV.find((item) => item.key !== 'dashboard' && pathname.startsWith(`/${item.key}`));
  return match?.key ?? 'dashboard';
}

function NavMenu({
  selectedKey,
  onNavigate,
  collapsed = false,
}: {
  selectedKey: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const router = useRouter();

  return (
    <Menu
      theme="dark"
      mode="inline"
      inlineCollapsed={collapsed}
      className="!bg-transparent !border-none px-2 pt-2"
      selectedKeys={[selectedKey]}
      onClick={({ key }) => {
        const item = NAV.find((n) => n.key === key);
        if (item) router.push(item.href);
        onNavigate?.();
      }}
      items={NAV.map((item) => ({
        key: item.key,
        icon: item.icon,
        label: item.label,
        title: item.label,
      }))}
    />
  );
}

function SiderContent({
  collapsed,
  selectedKey,
  onNavigate,
}: {
  collapsed: boolean;
  selectedKey: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-col min-h-full">
      <div
        className={`h-16 flex items-center border-b border-white/8 ${collapsed ? 'justify-center px-2' : 'px-5'}`}
        onClick={onNavigate}
      >
        <BrandMark href="/dashboard" variant="on-dark" size="sm" showWordmark={!collapsed} />
      </div>
      <div className={`pt-4 pb-2 ${collapsed ? 'px-1.5' : 'px-3'}`}>
        {!collapsed && (
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35 mb-2">
            Workspace
          </p>
        )}
        <NavMenu selectedKey={selectedKey} onNavigate={onNavigate} collapsed={collapsed} />
      </div>
      {!collapsed && (
        <div className="mt-auto px-4 py-4 border-t border-white/8">
          <p className="text-[11px] text-white/35 leading-relaxed px-1">
            Track journeys, applications, and funding in one place.
          </p>
        </div>
      )}
    </div>
  );
}

/** Gates every route under this layout behind authentication. */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated' || !user) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen mesh-light">
        <Spin size="large" />
      </div>
    );
  }

  const selectedKey = navKeyFromPath(pathname);
  const pageTitle = NAV.find((n) => n.key === selectedKey)?.label ?? 'Workspace';
  const closeMobile = () => setMobileOpen(false);

  return (
    <Layout className="min-h-screen">
      <Sider
        width={SIDER_EXPANDED}
        collapsedWidth={SIDER_COLLAPSED}
        collapsed={collapsed}
        trigger={null}
        collapsible
        className="!fixed !left-0 !top-0 !bottom-0 z-30 hidden lg:block !overflow-x-hidden !overflow-y-auto"
        style={{ background: 'var(--ink)' }}
      >
        <SiderContent collapsed={collapsed} selectedKey={selectedKey} />
      </Sider>

      <Drawer
        placement="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        width={280}
        styles={{
          body: { padding: 0, background: 'var(--ink)', display: 'flex', flexDirection: 'column' },
          header: { display: 'none' },
        }}
        className="lg:!hidden"
      >
        <SiderContent collapsed={false} selectedKey={selectedKey} onNavigate={closeMobile} />
      </Drawer>

      <Layout
        className={`min-h-screen transition-[margin] duration-200 ${
          collapsed ? 'lg:!ml-[72px]' : 'lg:!ml-[260px]'
        }`}
      >
        <Header className="!bg-[color:var(--surface)] !px-4 sm:!px-6 flex items-center justify-between border-b border-[color:var(--border)] sticky top-0 z-20 !h-16 !leading-none gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              type="text"
              className="lg:!hidden"
              aria-label="Open navigation"
              icon={<MenuUnfoldOutlined />}
              onClick={() => setMobileOpen(true)}
            />
            <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="bottom">
              <Button
                type="text"
                className="!hidden lg:!inline-flex"
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((c) => !c)}
              />
            </Tooltip>
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[color:var(--text-muted)] mb-0.5 hidden sm:block">
                Scholarship OS
              </p>
              <h1 className="text-[15px] font-semibold text-[color:var(--ink)] truncate m-0 leading-tight">
                {pageTitle}
              </h1>
            </div>
          </div>

          <Dropdown
            menu={{
              items: [
                {
                  key: 'user',
                  type: 'group',
                  label: (
                    <div className="px-1 py-1 max-w-[220px]">
                      <div className="text-sm font-semibold text-[color:var(--ink)] truncate">
                        {user.name ?? 'Your account'}
                      </div>
                      <div className="text-xs text-[color:var(--text-muted)] truncate font-normal normal-case tracking-normal">
                        {user.email}
                      </div>
                    </div>
                  ),
                },
                { type: 'divider' },
                {
                  key: 'profile',
                  icon: <UserOutlined />,
                  label: <Link href="/profile">Profile</Link>,
                },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: 'Log out',
                  danger: true,
                  onClick: () => void logout(),
                },
              ],
            }}
            placement="bottomRight"
            trigger={['click']}
          >
            <button
              type="button"
              aria-label="Account menu"
              aria-haspopup="menu"
              className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2.5 hover:bg-[color:var(--canvas)] transition-colors border border-transparent hover:border-[color:var(--border)] cursor-pointer bg-transparent"
            >
              <Avatar
                size={34}
                className="!bg-[color:var(--accent-soft)] !text-[color:var(--accent)] !font-semibold !text-sm"
              >
                {initialsFor(user.name, user.email)}
              </Avatar>
              <div className="leading-tight hidden md:block max-w-[160px] text-left">
                <div className="text-sm font-semibold text-[color:var(--ink)] truncate">
                  {user.name ?? 'Your account'}
                </div>
                <div className="text-xs text-[color:var(--text-muted)] truncate">{user.email}</div>
              </div>
            </button>
          </Dropdown>
        </Header>

        <Content className="mesh-light min-h-[calc(100vh-64px)]">
          <div className="p-4 sm:p-6 lg:p-8">
            {!user.isVerified && <VerifyEmailBanner />}
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  );
}

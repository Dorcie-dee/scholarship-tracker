'use client';

import { DashboardOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Layout, Menu, Spin, Typography } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

const { Header, Sider, Content } = Layout;

/** Gates every route under this layout behind authentication — see AuthProvider's silent-refresh-on-mount. */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  const { user, status, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <Spin size="large" />
      </div>
    );
  }

  const selectedKey = pathname.startsWith('/profile') ? 'profile' : 'dashboard';

  return (
    <Layout className="min-h-screen">
      <Sider breakpoint="lg" collapsedWidth={0}>
        <div className="h-16 flex items-center justify-center text-white font-semibold text-lg">
          Scholarship OS
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={[
            {
              key: 'dashboard',
              icon: <DashboardOutlined />,
              label: <Link href="/dashboard">Dashboard</Link>,
            },
            {
              key: 'profile',
              icon: <UserOutlined />,
              label: <Link href="/profile">Profile</Link>,
            },
          ]}
        />
      </Sider>
      <Layout>
        <Header className="!bg-white flex items-center justify-between px-6 border-b border-gray-200">
          <Typography.Text>{user?.name ?? user?.email}</Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={() => void logout()}>
            Log out
          </Button>
        </Header>
        <Content className="p-6 bg-gray-50">{children}</Content>
      </Layout>
    </Layout>
  );
}

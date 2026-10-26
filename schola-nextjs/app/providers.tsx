'use client';

import '@ant-design/v5-patch-for-react-19';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import { useState } from 'react';

/**
 * Placeholder — the frontend-port phase replaces this with the real
 * provider tree (AuthProvider, theme tokens) copied/adapted from the
 * original `frontend/src/app/providers.tsx`. Kept minimal here purely so
 * the scaffold itself builds end to end before that port happens.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1d4ed8' } }}>
      <AntdApp>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

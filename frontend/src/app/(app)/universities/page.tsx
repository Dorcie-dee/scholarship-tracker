'use client';

import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { CardGridSkeleton } from '@/components/LoadingSkeleton';
import { CursorPager } from '@/components/CursorPager';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import { UserRole } from '@/lib/shared-types';
import { flattenPages, useCreateUniversity, useUniversities } from '@/lib/queries';

export default function UniversitiesPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const [search, setSearch] = useState('');
  const { data, isLoading, isError, error, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useUniversities(search || undefined);
  const universities = flattenPages(data?.pages);
  const create = useCreateUniversity();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const onCreate = async (values: { name: string; country?: string; website?: string }) => {
    try {
      await create.mutateAsync(values);
      setModalOpen(false);
      form.resetFields();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : 'Could not create university');
    }
  };

  return (
    <div className="app-page space-y-5">
      <PageHeader
        eyebrow="Catalog"
        title="Universities"
        description="Browse universities and their programmes."
        extra={
          user?.role === UserRole.ADMIN ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
              Add university
            </Button>
          ) : undefined
        }
      />

      <Input
        placeholder="Search by name"
        prefix={<SearchOutlined className="text-[color:var(--text-muted)]" />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        size="large"
        className="max-w-md"
        aria-label="Search universities"
      />

      {isLoading ? (
        <CardGridSkeleton />
      ) : isError ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : universities.length === 0 ? (
        <EmptyState
          title={search ? `No universities match "${search}"` : 'No universities in the catalog yet'}
          description={search ? 'Try a different search term.' : undefined}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {universities.map((u) => (
              <Link key={u.id} href={`/universities/${u.id}`} className="block no-underline group">
                <article className="surface-interactive h-full p-5">
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-[color:var(--accent)]">
                    University
                  </p>
                  <h3
                    className="mt-2 mb-0 text-base font-semibold text-[color:var(--ink)] group-hover:text-[color:var(--accent)] transition-colors leading-snug"
                    style={{ fontFamily: 'var(--font-display), sans-serif' }}
                  >
                    {u.name}
                  </h3>
                  {u.country && (
                    <p className="mt-2 mb-0 text-sm text-[color:var(--text-muted)]">{u.country}</p>
                  )}
                </article>
              </Link>
            ))}
          </div>
          <CursorPager
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
          />
        </>
      )}

      <Modal
        title="Add university"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={create.isPending}
        okText="Add"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onCreate} className="!mt-2">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input autoFocus size="large" />
          </Form.Item>
          <Form.Item name="country" label="Country">
            <Input size="large" />
          </Form.Item>
          <Form.Item name="website" label="Website">
            <Input size="large" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

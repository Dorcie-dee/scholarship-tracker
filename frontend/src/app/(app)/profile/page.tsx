'use client';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, Input, Modal, Skeleton, Tabs, Tag } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AdminUserRoleSection } from '@/components/admin/AdminUserRoleSection';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { ListSkeleton } from '@/components/LoadingSkeleton';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/lib/auth-context';
import {
  useDeleteAccount,
  useLogoutAll,
  useProfile,
  useSessions,
  useUpdateName,
  useUpdateProfile,
} from '@/lib/queries';
import { UserRole } from '@/lib/shared-types';
import { friendlyApiMessage } from '@/lib/user-errors';

interface ProfileFormValues {
  nationality?: string;
  summary?: string;
  dateOfBirth?: dayjs.Dayjs | null;
}

type EntryKind = 'education' | 'experience' | 'skills' | 'certifications' | 'languages';

const ENTRY_FIELDS: Record<
  EntryKind,
  { key: string; label: string; textarea?: boolean; date?: boolean }[]
> = {
  education: [
    { key: 'institution', label: 'Institution' },
    { key: 'degree', label: 'Degree' },
    { key: 'field', label: 'Field' },
    { key: 'startDate', label: 'Start date', date: true },
    { key: 'endDate', label: 'End date', date: true },
    { key: 'gpa', label: 'GPA' },
  ],
  experience: [
    { key: 'title', label: 'Title' },
    { key: 'organization', label: 'Organization' },
    { key: 'startDate', label: 'Start date', date: true },
    { key: 'endDate', label: 'End date', date: true },
    { key: 'description', label: 'Description', textarea: true },
  ],
  skills: [{ key: 'name', label: 'Skill' }],
  certifications: [
    { key: 'name', label: 'Name' },
    { key: 'issuer', label: 'Issuer' },
    { key: 'date', label: 'Date', date: true },
  ],
  languages: [
    { key: 'language', label: 'Language' },
    { key: 'level', label: 'Level' },
  ],
};

function formatEntry(entry: Record<string, unknown>, kind: EntryKind): string {
  const fields = ENTRY_FIELDS[kind];
  const parts = fields
    .map((f) => {
      const v = entry[f.key];
      if (v === null || v === undefined || v === '') return null;
      return String(v);
    })
    .filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  return Object.entries(entry)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(' · ');
}

function EditableEntryList({
  title,
  kind,
  entries,
  profileKey,
}: {
  title: string;
  kind: EntryKind;
  entries: Record<string, unknown>[];
  profileKey: EntryKind;
}) {
  const { message } = App.useApp();
  const updateProfile = useUpdateProfile();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const persist = async (next: Record<string, unknown>[]) => {
    try {
      await updateProfile.mutateAsync({ [profileKey]: next });
      message.success(`${title} updated`);
    } catch (error) {
      message.error(friendlyApiMessage(error, `Could not update ${title.toLowerCase()}`));
      throw error;
    }
  };

  const onAdd = async (values: Record<string, unknown>) => {
    const cleaned: Record<string, unknown> = {};
    for (const field of ENTRY_FIELDS[kind]) {
      const raw = values[field.key];
      if (raw === undefined || raw === null || raw === '') continue;
      cleaned[field.key] = field.date && dayjs.isDayjs(raw) ? raw.format('YYYY-MM-DD') : raw;
    }
    if (Object.keys(cleaned).length === 0) {
      message.error('Add at least one field');
      return;
    }
    try {
      await persist([...entries, cleaned]);
      setModalOpen(false);
      form.resetFields();
    } catch {
      // error already shown
    }
  };

  const onRemove = async (index: number) => {
    try {
      await persist(entries.filter((_, i) => i !== index));
    } catch {
      // error already shown
    }
  };

  return (
    <section className="surface overflow-hidden">
      <div className="px-5 py-4 border-b border-[color:var(--border)] flex items-center justify-between gap-3">
        <h3
          className="m-0 text-[15px] font-semibold text-[color:var(--ink)]"
          style={{ fontFamily: 'var(--font-display), sans-serif' }}
        >
          {title}
        </h3>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Add
        </Button>
      </div>
      {entries.length === 0 ? (
        <div className="p-4">
          <EmptyState title={`No ${title.toLowerCase()} added yet`} />
        </div>
      ) : (
        <ul className="m-0 p-0 list-none divide-y divide-[color:var(--border)]">
          {entries.map((entry, index) => (
            <li
              key={index}
              className="px-5 py-3 text-sm text-[color:var(--text-secondary)] leading-relaxed flex items-start justify-between gap-3"
            >
              <span className="min-w-0">{formatEntry(entry, kind)}</span>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                aria-label={`Remove ${title} entry`}
                loading={updateProfile.isPending}
                onClick={() => void onRemove(index)}
              />
            </li>
          ))}
        </ul>
      )}

      <Modal
        title={`Add ${title.toLowerCase().replace(/s$/, '')}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={updateProfile.isPending}
        okText="Add"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onAdd} className="!mt-2" requiredMark={false}>
          {ENTRY_FIELDS[kind].map((field) => (
            <Form.Item key={field.key} name={field.key} label={field.label}>
              {field.textarea ? (
                <Input.TextArea rows={2} />
              ) : field.date ? (
                <DatePicker className="w-full" size="large" />
              ) : (
                <Input size="large" autoFocus={field === ENTRY_FIELDS[kind][0]} />
              )}
            </Form.Item>
          ))}
        </Form>
      </Modal>
    </section>
  );
}

function MasterProfileTab() {
  const { data: profile, isLoading, isError, error, refetch } = useProfile();
  const updateProfile = useUpdateProfile();
  const { message } = App.useApp();
  const [form] = Form.useForm<ProfileFormValues>();

  useEffect(() => {
    if (profile) {
      form.setFieldsValue({
        nationality: profile.nationality ?? undefined,
        summary: profile.summary ?? undefined,
        dateOfBirth: profile.dateOfBirth ? dayjs(profile.dateOfBirth) : null,
      });
    }
  }, [profile, form]);

  const onFinish = async (values: ProfileFormValues) => {
    try {
      await updateProfile.mutateAsync({
        nationality: values.nationality || null,
        summary: values.summary || null,
        dateOfBirth: values.dateOfBirth ? values.dateOfBirth.format('YYYY-MM-DD') : null,
      });
      message.success('Profile updated');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update profile'));
    }
  };

  if (isLoading) return <Skeleton active />;
  if (isError) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <div className="space-y-5">
      <p className="m-0 text-sm text-[color:var(--text-secondary)] leading-relaxed">
        Reusable information about you — kept separate from any one application. Each application
        can be given its own specific details on its own workspace page; this is the shared baseline.
      </p>

      <section className="surface p-5 sm:p-6">
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="nationality" label="Nationality">
            <Input size="large" />
          </Form.Item>
          <Form.Item name="dateOfBirth" label="Date of birth">
            <DatePicker className="w-full" size="large" />
          </Form.Item>
          <Form.Item name="summary" label="Summary">
            <Input.TextArea rows={4} placeholder="A short summary about your academic background and goals" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={updateProfile.isPending}>
            Save
          </Button>
        </Form>
      </section>

      <EditableEntryList title="Education" kind="education" profileKey="education" entries={profile?.education ?? []} />
      <EditableEntryList title="Experience" kind="experience" profileKey="experience" entries={profile?.experience ?? []} />
      <EditableEntryList title="Skills" kind="skills" profileKey="skills" entries={profile?.skills ?? []} />
      <EditableEntryList
        title="Certifications"
        kind="certifications"
        profileKey="certifications"
        entries={profile?.certifications ?? []}
      />
      <EditableEntryList title="Languages" kind="languages" profileKey="languages" entries={profile?.languages ?? []} />
    </div>
  );
}

function AccountTab() {
  const { user, logout, refreshUser } = useAuth();
  const router = useRouter();
  const { message } = App.useApp();
  const updateName = useUpdateName();
  const logoutAll = useLogoutAll();
  const deleteAccount = useDeleteAccount();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const [form] = Form.useForm();

  const onSaveName = async (values: { name: string }) => {
    try {
      await updateName.mutateAsync(values);
      await refreshUser();
      message.success('Name updated');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not update your name'));
    }
  };

  const onLogoutAll = async () => {
    try {
      await logoutAll.mutateAsync();
      await logout();
      message.success('Logged out everywhere');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not log out all sessions'));
    }
  };

  const onDeleteAccount = async () => {
    try {
      await deleteAccount.mutateAsync();
      // The account (and its refresh session) is already gone server-side —
      // this just clears local session state and any cached queries would
      // now be for a nonexistent account.
      await logout().catch(() => undefined);
      router.replace('/login');
    } catch (error) {
      message.error(friendlyApiMessage(error, 'Could not delete your account'));
    }
  };

  return (
    <div className="space-y-5">
      <section className="surface overflow-hidden">
        <div className="px-5 py-4 border-b border-[color:var(--border)]">
          <h3
            className="m-0 text-[15px] font-semibold text-[color:var(--ink)]"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            Account
          </h3>
        </div>
        <div className="p-5 space-y-4">
          <p className="m-0 text-sm text-[color:var(--text-secondary)] flex items-center gap-2 flex-wrap">
            <span>{user?.email}</span>
            {user?.isVerified ? <Tag color="success">verified</Tag> : <Tag color="warning">not verified</Tag>}
            {user?.role === UserRole.ADMIN && <Tag color="processing">admin</Tag>}
          </p>
          <Form form={form} layout="vertical" onFinish={onSaveName} initialValues={{ name: user?.name ?? '' }} className="max-w-md">
            <Form.Item name="name" label="Name" className="!mb-3">
              <Input size="large" />
            </Form.Item>
            <Button htmlType="submit" loading={updateName.isPending}>
              Save
            </Button>
          </Form>
        </div>
      </section>

      {/* JWT role is presentation-only; backend enforces ADMIN on /users + role PATCH */}
      {user?.role === UserRole.ADMIN && <AdminUserRoleSection />}

      <section className="surface overflow-hidden">
        <div className="px-5 py-4 border-b border-[color:var(--border)]">
          <h3
            className="m-0 text-[15px] font-semibold text-[color:var(--ink)]"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            Active sessions
          </h3>
        </div>
        <div className="p-5">
          {sessionsLoading ? (
            <ListSkeleton rows={2} />
          ) : !sessions || sessions.length === 0 ? (
            <EmptyState title="No other active sessions" />
          ) : (
            <ul className="m-0 mb-4 p-0 list-none divide-y divide-[color:var(--border)] border border-[color:var(--border)] rounded-[var(--radius)] overflow-hidden">
              {sessions.map((s) => (
                <li key={s.id} className="px-4 py-3 text-sm flex justify-between gap-3 flex-wrap">
                  <span className="text-[color:var(--ink)]">{s.userAgent ?? 'Unknown device'}</span>
                  <span className="text-[color:var(--text-muted)]">
                    last used {dayjs(s.lastUsedAt).format('MMM D, YYYY')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Button onClick={() => void onLogoutAll()} loading={logoutAll.isPending}>
            Log out of all devices
          </Button>
        </div>
      </section>

      <section className="surface overflow-hidden" style={{ borderColor: 'color-mix(in srgb, var(--danger) 25%, var(--border))' }}>
        <div
          className="px-5 py-4 border-b border-[color:var(--border)]"
          style={{ background: 'color-mix(in srgb, var(--danger) 4%, var(--surface))' }}
        >
          <h3
            className="m-0 text-[15px] font-semibold text-[color:var(--danger)]"
            style={{ fontFamily: 'var(--font-display), sans-serif' }}
          >
            Danger zone
          </h3>
        </div>
        <div className="p-5 space-y-4">
          <p className="m-0 text-sm text-[color:var(--text-secondary)] leading-relaxed">
            Deleting your account permanently removes every application, document, and record you own.
            This cannot be undone.
          </p>
          <ConfirmDeleteButton
            title="Delete your account?"
            description="This immediately and permanently erases your account and everything in it. This is not the same as the recoverable soft-delete used for individual applications."
            onConfirm={() => void onDeleteAccount()}
            loading={deleteAccount.isPending}
          >
            Delete my account
          </ConfirmDeleteButton>
        </div>
      </section>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="app-page-narrow space-y-5">
      <PageHeader
        eyebrow="Settings"
        title="Your profile"
        description="Master profile details and account security."
      />

      <div className="surface overflow-hidden animate-rise">
        <Tabs
          defaultActiveKey="profile"
          className="[&_.ant-tabs-nav]:!mb-0 [&_.ant-tabs-nav]:px-4 [&_.ant-tabs-nav]:pt-2 [&_.ant-tabs-nav]:bg-[color:var(--canvas)] [&_.ant-tabs-tab]:!py-3 [&_.ant-tabs-content-holder]:p-4 sm:[&_.ant-tabs-content-holder]:p-5"
          items={[
            { key: 'profile', label: 'Master profile', children: <MasterProfileTab /> },
            { key: 'account', label: 'Account & security', children: <AccountTab /> },
          ]}
        />
      </div>
    </div>
  );
}

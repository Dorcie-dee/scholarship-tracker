'use client';

import type { ReactNode } from 'react';

const TONE: Record<string, { bg: string; text: string; border: string }> = {
  // Journey
  planning: { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' },
  active: { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
  on_hold: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  completed: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  abandoned: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  // Application
  not_started: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  in_progress: { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
  submitted: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  under_review: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  interview: { bg: '#f5f3ff', text: '#6d28d9', border: '#ddd6fe' },
  offer: { bg: '#ecfeff', text: '#0e7490', border: '#67e8f9' },
  accepted: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  rejected: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  withdrawn: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  // Requirement
  unknown: { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' },
  confirmed: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  profile_match: { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
  ai_assessment: { bg: '#ecfeff', text: '#0e7490', border: '#a5f3fc' },
  needs_verification: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  not_met: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  not_applicable: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  conditional: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  // Deadline
  upcoming: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  due_soon: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  passed: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  met: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  missed: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
  cancelled: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  // Task
  todo: { bg: '#f1f5f9', text: '#334155', border: '#cbd5e1' },
  blocked: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  done: { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  // Priority
  low: { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' },
  medium: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
  high: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
  urgent: { bg: '#fef2f2', text: '#b91c1c', border: '#fecaca' },
};

function humanize(value: string): string {
  return value.replaceAll('_', ' ');
}

/** Status chip — label always present (never color alone). */
export function StatusTag({ value }: { value: string }) {
  const tone = TONE[value] ?? { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize border whitespace-nowrap"
      style={{ background: tone.bg, color: tone.text, borderColor: tone.border }}
    >
      {humanize(value)}
    </span>
  );
}

export function StatusTagRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

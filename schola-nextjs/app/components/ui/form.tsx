import type { InputHTMLAttributes, LabelHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const FIELD_BASE =
  'w-full rounded-lg border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1.5 block text-xs font-semibold text-ink-soft', className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD_BASE, 'h-11', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(FIELD_BASE, 'min-h-24 resize-y py-2.5', className)} {...props} />;
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
      {children}
    </p>
  );
}

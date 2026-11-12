'use client';

import { useState } from 'react';
import { Button, iconButtonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FieldError, Input, Label, Textarea } from '@/components/ui/form';
import { PencilIcon, PlusIcon, TrashIcon, type IconProps } from '@/components/icons';
import { cn } from '@/lib/cn';

export interface SectionField<T> {
  key: keyof T & string;
  label: string;
  type?: 'text' | 'textarea' | 'date';
  placeholder?: string;
  required?: boolean;
}

interface ListSectionProps<T extends object> {
  title: string;
  description: string;
  icon: React.ComponentType<IconProps>;
  items: T[];
  fields: SectionField<T>[];
  emptyItem: T;
  /** True while a save/remove PATCH for this section is in flight. */
  saving: boolean;
  onSave: (next: T[]) => void;
  renderSummary: (item: T) => { primary: string; secondary?: string };
  addLabel: string;
  emptyLabel: string;
}

/**
 * One add/edit/remove list editor, generic over the item shape, shared by
 * all five profile sections (education/experience/skills/languages/
 * certifications) so each only has to describe its own fields instead of
 * reimplementing the edit-in-place interaction five times. Every save sends
 * the *entire* next array for that field back to the caller, which matches
 * `profile.service.ts#updateProfile`'s full-field-replace PATCH semantics
 * (see the profile page for the actual PATCH call).
 */
export function ListSection<T extends object>({
  title,
  description,
  icon: Icon,
  items,
  fields,
  emptyItem,
  saving,
  onSave,
  renderSummary,
  addLabel,
  emptyLabel,
}: ListSectionProps<T>) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const isAdding = editingIndex === items.length;

  function startAdd() {
    setRemovingIndex(null);
    setValidationError(null);
    setDraft({ ...emptyItem });
    setEditingIndex(items.length);
  }

  function startEdit(index: number) {
    setRemovingIndex(null);
    setValidationError(null);
    setDraft({ ...items[index] });
    setEditingIndex(index);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setDraft(null);
    setValidationError(null);
  }

  function saveDraft() {
    if (!draft) return;
    const missing = fields.find((f) => f.required && !String(draft[f.key] ?? '').trim());
    if (missing) {
      setValidationError(`${missing.label} is required.`);
      return;
    }
    const next = [...items];
    if (editingIndex === items.length) {
      next.push(draft);
    } else if (editingIndex !== null) {
      next[editingIndex] = draft;
    }
    onSave(next);
    cancelEdit();
  }

  function confirmRemove(index: number) {
    const next = items.filter((_, i) => i !== index);
    onSave(next);
    setRemovingIndex(null);
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Icon size={18} aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-display text-card-title font-semibold text-ink">{title}</h2>
            <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
          </div>
        </div>
        {editingIndex === null && (
          <Button variant="secondary" size="sm" onClick={startAdd} disabled={saving}>
            <PlusIcon size={14} aria-hidden="true" />
            {addLabel}
          </Button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {items.length === 0 && editingIndex === null && (
          <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-faint">
            {emptyLabel}
          </p>
        )}

        {items.map((item, index) => {
          if (editingIndex === index && draft) {
            return (
              <EditForm
                key={index}
                fields={fields}
                draft={draft}
                setDraft={setDraft}
                onCancel={cancelEdit}
                onSave={saveDraft}
                saving={saving}
                validationError={validationError}
              />
            );
          }
          const { primary, secondary } = renderSummary(item);
          return (
            <div
              key={index}
              className={cn(
                'flex items-start justify-between gap-3 rounded-lg border border-line-soft px-4 py-3',
                removingIndex === index && 'border-danger bg-danger-soft',
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{primary || 'Untitled'}</p>
                {secondary && <p className="mt-0.5 text-xs text-ink-soft">{secondary}</p>}
              </div>
              {removingIndex === index ? (
                <div className="flex flex-none items-center gap-2">
                  <span className="text-xs font-medium text-danger">Remove this?</span>
                  <Button variant="danger" size="sm" onClick={() => confirmRemove(index)} disabled={saving}>
                    Remove
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setRemovingIndex(null)} disabled={saving}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex flex-none items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(index)}
                    aria-label={`Edit ${primary || title.toLowerCase()} entry`}
                    disabled={editingIndex !== null || saving}
                    className={iconButtonVariants()}
                  >
                    <PencilIcon size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemovingIndex(index)}
                    aria-label={`Remove ${primary || title.toLowerCase()} entry`}
                    disabled={editingIndex !== null || saving}
                    className={iconButtonVariants({ tone: 'danger' })}
                  >
                    <TrashIcon size={15} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {isAdding && draft && (
          <EditForm
            fields={fields}
            draft={draft}
            setDraft={setDraft}
            onCancel={cancelEdit}
            onSave={saveDraft}
            saving={saving}
            validationError={validationError}
          />
        )}
      </div>
    </Card>
  );
}

function EditForm<T extends object>({
  fields,
  draft,
  setDraft,
  onCancel,
  onSave,
  saving,
  validationError,
}: {
  fields: SectionField<T>[];
  draft: T;
  setDraft: (next: T) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  validationError: string | null;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="rounded-lg border border-primary/30 bg-primary-soft/40 p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => {
          const inputId = `field-${String(field.key)}-${fields.indexOf(field)}`;
          const value = String(draft[field.key] ?? '');
          return (
            <div key={String(field.key)} className={field.type === 'textarea' ? 'sm:col-span-2' : undefined}>
              <Label htmlFor={inputId}>
                {field.label}
                {field.required && ' *'}
              </Label>
              {field.type === 'textarea' ? (
                <Textarea
                  id={inputId}
                  value={value}
                  placeholder={field.placeholder}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                />
              ) : (
                <Input
                  id={inputId}
                  type={field.type === 'date' ? 'date' : 'text'}
                  value={value}
                  placeholder={field.placeholder}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                />
              )}
            </div>
          );
        })}
      </div>
      <FieldError>{validationError}</FieldError>
      <div className="mt-3 flex items-center gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

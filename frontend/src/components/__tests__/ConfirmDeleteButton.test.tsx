import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton';

describe('ConfirmDeleteButton', () => {
  it('never fires onConfirm from the initial click alone — a destructive action always requires explicit confirmation', async () => {
    let confirmed = false;
    const user = userEvent.setup();
    render(
      <ConfirmDeleteButton title="Delete this?" onConfirm={() => { confirmed = true; }}>
        Delete
      </ConfirmDeleteButton>,
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(confirmed).toBe(false);
    // The confirmation prompt itself must actually be showing now.
    expect(await screen.findByText('Delete this?')).toBeInTheDocument();
  });

  it('fires onConfirm only after the confirmation prompt is itself confirmed', async () => {
    let confirmed = false;
    const user = userEvent.setup();
    render(
      <ConfirmDeleteButton title="Delete this?" onConfirm={() => { confirmed = true; }}>
        Delete
      </ConfirmDeleteButton>,
    );

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    // Popconfirm now shows its own "Delete" confirm button alongside the
    // original trigger button — the last one in the DOM is the popover's.
    const buttons = await screen.findAllByRole('button', { name: /delete/i });
    await user.click(buttons[buttons.length - 1]);

    expect(confirmed).toBe(true);
  });
});

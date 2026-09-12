import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '@/components/EmptyState';

describe('EmptyState', () => {
  it('renders a specific, contextual title — never left blank', () => {
    render(<EmptyState title="No applications yet" description="Start one from a journey." />);
    expect(screen.getByText('No applications yet')).toBeInTheDocument();
    expect(screen.getByText('Start one from a journey.')).toBeInTheDocument();
  });

  it('renders no action button when none is provided', () => {
    render(<EmptyState title="Nothing here" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('invokes the action callback when its button is clicked', () => {
    let clicked = false;
    render(<EmptyState title="No tasks yet" action={{ label: 'Add a task', onClick: () => { clicked = true; } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a task' }));
    expect(clicked).toBe(true);
  });
});

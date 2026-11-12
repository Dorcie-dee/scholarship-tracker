import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusTag } from '@/components/StatusTag';

describe('StatusTag', () => {
  it('always renders a readable text label, never color alone (accessibility requirement)', () => {
    render(<StatusTag value="under_review" />);
    // Ant's Tag renders a real text node — asserting on it directly proves a
    // screen reader / colorblind user gets the same information a sighted
    // user reading the color would.
    expect(screen.getByText('under review')).toBeInTheDocument();
  });

  it('humanizes underscored enum values into space-separated words', () => {
    render(<StatusTag value="needs_verification" />);
    expect(screen.getByText('needs verification')).toBeInTheDocument();
  });

  it('renders an unmapped/unknown status value plainly rather than crashing', () => {
    render(<StatusTag value="some_future_status" />);
    expect(screen.getByText('some future status')).toBeInTheDocument();
  });
});

import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CursorPager } from '@/components/CursorPager';

describe('CursorPager', () => {
  it('renders nothing once there is no further page — never a dead-end "Load more" button', () => {
    const { container } = render(
      <CursorPager hasNextPage={false} isFetchingNextPage={false} onLoadMore={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('calls onLoadMore (never constructing a cursor itself) when clicked', () => {
    let loadedMore = false;
    render(<CursorPager hasNextPage={true} isFetchingNextPage={false} onLoadMore={() => { loadedMore = true; }} />);
    fireEvent.click(screen.getByRole('button', { name: /load more/i }));
    expect(loadedMore).toBe(true);
  });

  it('shows a loading state while the next page is being fetched', () => {
    render(<CursorPager hasNextPage={true} isFetchingNextPage={true} onLoadMore={() => {}} />);
    expect(screen.getByRole('button')).toHaveClass('ant-btn-loading');
  });
});

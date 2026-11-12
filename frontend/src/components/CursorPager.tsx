'use client';

import { Button } from 'antd';

export function CursorPager({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
}: {
  hasNextPage: boolean | undefined;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
}) {
  if (!hasNextPage) return null;
  return (
    <div className="flex justify-center pt-6">
      <Button size="large" onClick={onLoadMore} loading={isFetchingNextPage} className="!min-w-[140px]">
        Load more
      </Button>
    </div>
  );
}

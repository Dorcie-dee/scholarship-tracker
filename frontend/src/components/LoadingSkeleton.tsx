'use client';

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="surface h-[72px] px-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-slate-200/80" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded bg-slate-200/80" />
            <div className="h-3 w-1/3 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-pulse" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface p-5 min-h-[140px] space-y-3">
          <div className="h-3 w-16 rounded bg-slate-200/80" />
          <div className="h-5 w-3/4 rounded bg-slate-200/90" />
          <div className="h-3 w-full rounded bg-slate-100" />
          <div className="h-3 w-2/3 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3 animate-pulse" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="surface p-5 h-[96px]">
          <div className="h-3 w-20 rounded bg-slate-200/80 mb-4" />
          <div className="h-7 w-12 rounded bg-slate-200/90" />
        </div>
      ))}
    </div>
  );
}

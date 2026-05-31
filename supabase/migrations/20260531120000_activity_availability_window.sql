-- Cached bookable-date windows for catalog trip-date filtering (Phase 2).
-- Populated by availability window sync during catalog detail sync / cron.

alter table public.activities
  add column if not exists availability_window jsonb;

comment on column public.activities.availability_window is
  'Offline summary: { syncedAt, rangeStart, rangeEnd, bookableDates[], bookableCount }';

create index if not exists activities_availability_window_dates_idx
  on public.activities using gin ((availability_window -> 'bookableDates'));

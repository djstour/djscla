alter table public.activities
  add column if not exists detail_synced_at timestamptz;

comment on column public.activities.detail_synced_at is
  'Timestamp of the last full Bókun /activity.json/{id} detail fetch. NULL means detail sync is pending.';

create index if not exists activities_detail_synced_at_idx
  on public.activities (detail_synced_at nulls first);

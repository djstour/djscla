-- Catalog cache fields used by /api/catalog/sync (Phase B):
-- - chip_ids / route_ids / facet_ids: filter taxonomy mirrored from chipIds.js
-- - bokun_updated_at: last modified timestamp from Bókun for incremental sync (future)
-- Idempotent: safe to re-run.

alter table public.activities
  add column if not exists chip_ids        text[] not null default '{}'::text[],
  add column if not exists route_ids       text[] not null default '{}'::text[],
  add column if not exists facet_ids       text[] not null default '{}'::text[],
  add column if not exists category_labels text[] not null default '{}'::text[],
  add column if not exists bokun_updated_at timestamptz;

create index if not exists activities_chip_ids_idx
  on public.activities using gin (chip_ids);

create index if not exists activities_route_ids_idx
  on public.activities using gin (route_ids);

create index if not exists activities_facet_ids_idx
  on public.activities using gin (facet_ids);

create index if not exists activities_synced_at_idx
  on public.activities (last_synced_at desc);

-- Postgres FTS over English title + summary (Phase B search; Algolia later).
create index if not exists activities_title_fts_idx
  on public.activities
  using gin (to_tsvector('simple', coalesce(title_en, '') || ' ' || coalesce(summary_en, '')));

comment on column public.activities.chip_ids        is 'Experience-type filters (aurora, glacier, hotspring, …); mirrors lib/chipIds.js.';
comment on column public.activities.route_ids       is 'Iceland route filters (golden-circle, south-coast).';
comment on column public.activities.facet_ids       is 'Orthogonal facets (premium, free-cancel, mandarin, winter, reykjavik).';
comment on column public.activities.category_labels is 'Bókun raw category leaf labels for diagnostics and search rebuild.';

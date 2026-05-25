-- Generated tsvector for full-text search on the catalog cache.
--
-- Replaces the earlier expression-based FTS index from
-- 20260525025000_catalog_chip_ids.sql with a stored generated column so
-- PostgREST `?search_doc=fts(simple).query` can use the GIN index directly.
-- Idempotent: safe to re-run.

drop index if exists public.activities_title_fts_idx;

alter table public.activities
  add column if not exists search_doc tsvector
    generated always as (
      setweight(to_tsvector('simple', coalesce(title_en, '')), 'A')
      || setweight(to_tsvector('simple', coalesce(summary_en, '')), 'B')
      || setweight(to_tsvector('simple', coalesce(description_en, '')), 'C')
    ) stored;

create index if not exists activities_search_doc_idx
  on public.activities using gin (search_doc);

comment on column public.activities.search_doc is
  'Stored tsvector over title/summary/description for /api/catalog/activities?q= search.';

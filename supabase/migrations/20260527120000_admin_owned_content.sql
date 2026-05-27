-- Phase 3: editorial / owned content flags for admin console.
-- Bókun sync must not wipe these columns (omit from upsert payload).

alter table public.activities
  add column if not exists is_featured boolean not null default false,
  add column if not exists featured_rank integer;

create index if not exists activities_featured_idx
  on public.activities (is_featured, featured_rank nulls last)
  where is_active = true and is_featured = true;

comment on column public.activities.is_featured is
  'Homepage / marketing featured slot; curated in admin, not from Bókun.';

comment on column public.activities.featured_rank is
  'Lower sorts first on homepage featured rail (nulls last).';

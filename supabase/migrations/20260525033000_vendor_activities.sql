-- Vendor↔Activity many-to-many + denormalized contract counts.
-- Reasoning:
--   Bókun reports per-vendor contract counts that include search-row
--   duplicates (e.g. Arctic Adventures 123, Adventure Vikings 18 → 141 total).
--   After dedupe by activity id we keep only 136 unique products. The pill
--   labels in the UI must continue to match Bókun marketplace numbers, so we
--   snapshot vendors.contract_product_count and store every (vendor, activity)
--   membership pair separately.
-- Idempotent: safe to re-run.

alter table public.vendors
  add column if not exists contract_product_count integer not null default 0,
  add column if not exists unique_product_count   integer not null default 0,
  add column if not exists last_synced_at         timestamptz;

create table if not exists public.vendor_activities (
  vendor_id        bigint not null references public.vendors(id) on delete cascade,
  activity_id      bigint not null references public.activities(id) on delete cascade,
  bokun_vendor_id  text not null,
  bokun_activity_id text not null,
  created_at       timestamptz not null default now(),
  primary key (vendor_id, activity_id)
);

create index if not exists vendor_activities_vendor_idx
  on public.vendor_activities (vendor_id);

create index if not exists vendor_activities_activity_idx
  on public.vendor_activities (activity_id);

create index if not exists vendor_activities_bokun_vendor_idx
  on public.vendor_activities (bokun_vendor_id);

alter table public.vendor_activities enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'vendor_activities'
      and policyname = 'vendor_activities_select_public'
  ) then
    create policy "vendor_activities_select_public"
      on public.vendor_activities for select
      to anon, authenticated
      using (true);
  end if;
end $$;

comment on table public.vendor_activities is
  'Many-to-many link: an activity may be sold by multiple Bókun suppliers.';
comment on column public.vendors.contract_product_count is
  'Bókun marketplace contract count per vendor (search merged.length, pre-dedupe).';
comment on column public.vendors.unique_product_count is
  'Distinct activities under contract for this vendor (post-dedupe).';

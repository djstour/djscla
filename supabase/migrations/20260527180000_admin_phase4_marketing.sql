-- Phase 4: marketing collections + inquiry follow-up (abandoned cart).

create table if not exists public.homepage_collections (
  id              bigint generated always as identity primary key,
  slug            text not null unique,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  max_items       integer not null default 6 check (max_items between 1 and 24),
  filter_type     text not null default 'chip'
    check (filter_type in ('chip', 'route', 'manual')),
  filter_value    text,
  activity_ids    jsonb not null default '[]'::jsonb,
  title_hant      text not null default '',
  title_hans      text not null default '',
  title_en        text not null default '',
  overline_hant   text,
  overline_hans   text,
  overline_en     text,
  cta_label_hant  text,
  cta_label_hans  text,
  cta_label_en    text,
  cta_chip_id     text,
  cta_route_id    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists homepage_collections_active_sort_idx
  on public.homepage_collections (is_active, sort_order asc, id asc);

comment on table public.homepage_collections is
  'Homepage marketing rails below featured; curated in admin, not from Bókun.';

alter table public.inquiries
  add column if not exists admin_notes text,
  add column if not exists follow_up_status text not null default 'open';

-- Backfill constraint separately so existing rows get default first.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inquiries_follow_up_status_check'
  ) then
    alter table public.inquiries
      add constraint inquiries_follow_up_status_check
      check (follow_up_status in ('open', 'contacted', 'converted', 'lost', 'spam'));
  end if;
end $$;

create index if not exists inquiries_abandoned_idx
  on public.inquiries (status, follow_up_status, created_at desc)
  where status = 'redirected_to_bokun';

comment on column public.inquiries.follow_up_status is
  'Ops workflow for leads and abandoned hosted checkouts; independent of Bókun booking status.';

comment on column public.inquiries.admin_notes is
  'Internal notes visible only in admin console.';

create trigger homepage_collections_updated_at
  before update on public.homepage_collections
  for each row execute function public.set_updated_at();

alter table public.homepage_collections enable row level security;

insert into public.homepage_collections (
  slug, filter_type, filter_value, sort_order, max_items,
  title_hant, title_hans, title_en,
  overline_hant, overline_hans, overline_en,
  cta_chip_id
) values
  (
    'aurora-picks', 'chip', 'aurora', 10, 6,
    '極光精選', '极光精选', 'Aurora picks',
    '冰島冬季', '冰岛冬季', 'Iceland winter',
    'aurora'
  ),
  (
    'glacier-coast', 'chip', 'glacier', 20, 6,
    '冰川與南岸', '冰川与南岸', 'Glacier & coast',
    '經典路線', '经典路线', 'Classic routes',
    'glacier'
  )
on conflict (slug) do nothing;

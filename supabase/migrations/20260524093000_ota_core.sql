create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.vendors (
  id                bigint generated always as identity primary key,
  bokun_vendor_id   text not null unique,
  slug              text not null unique,
  name              text not null,
  summary           text,
  hero_image_url    text,
  tags              text[] not null default '{}'::text[],
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.activities (
  id                bigint generated always as identity primary key,
  bokun_activity_id text not null unique,
  vendor_id         bigint references public.vendors(id) on delete set null,
  slug              text not null unique,
  title_en          text not null,
  summary_en        text,
  description_en    text,
  cover_image_url   text,
  price_from        numeric(12, 2),
  currency          text not null default 'USD',
  duration_minutes  integer,
  booking_type      text not null,
  categories        text[] not null default '{}'::text[],
  tags              text[] not null default '{}'::text[],
  source_hash       text,
  bokun_payload     jsonb not null default '{}'::jsonb,
  is_active         boolean not null default true,
  last_synced_at    timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.activity_translations (
  id                bigint generated always as identity primary key,
  activity_id       bigint not null references public.activities(id) on delete cascade,
  lang              text not null check (lang in ('hant', 'hans', 'en')),
  title             text,
  summary           text,
  description       text,
  seo_title         text,
  seo_description   text,
  provider          text not null default 'machine',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (activity_id, lang)
);

create table public.inquiries (
  id                bigint generated always as identity primary key,
  status            text not null default 'new',
  name              text not null,
  email             text not null,
  phone             text,
  lang              text not null default 'hant' check (lang in ('hant', 'hans', 'en')),
  travel_start_date date,
  travel_end_date   date,
  pax               integer,
  budget_range      text,
  notes             text,
  selected_trip     jsonb not null default '[]'::jsonb,
  source_page       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.bookings (
  id                     bigint generated always as identity primary key,
  bokun_booking_id       text unique,
  bokun_confirmation_code text unique,
  status                 text not null,
  customer_name          text,
  customer_email         text,
  customer_phone         text,
  lang                   text check (lang in ('hant', 'hans', 'en')),
  currency               text not null default 'USD',
  amount_total           numeric(12, 2),
  trip_snapshot          jsonb not null default '[]'::jsonb,
  bokun_payload          jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index vendors_active_idx
  on public.vendors (is_active);

create index activities_vendor_idx
  on public.activities (vendor_id, is_active);

create index activities_bokun_activity_id_idx
  on public.activities (bokun_activity_id);

create index activity_translations_lookup_idx
  on public.activity_translations (activity_id, lang);

create index inquiries_status_idx
  on public.inquiries (status, created_at desc);

create index bookings_status_idx
  on public.bookings (status, created_at desc);

create trigger vendors_updated_at
  before update on public.vendors
  for each row execute function public.set_updated_at();

create trigger activities_updated_at
  before update on public.activities
  for each row execute function public.set_updated_at();

create trigger activity_translations_updated_at
  before update on public.activity_translations
  for each row execute function public.set_updated_at();

create trigger inquiries_updated_at
  before update on public.inquiries
  for each row execute function public.set_updated_at();

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

alter table public.vendors enable row level security;
alter table public.activities enable row level security;
alter table public.activity_translations enable row level security;
alter table public.inquiries enable row level security;
alter table public.bookings enable row level security;

create policy "vendors_select_public"
  on public.vendors for select
  to anon, authenticated
  using (true);

create policy "activities_select_public"
  on public.activities for select
  to anon, authenticated
  using (true);

create policy "activity_translations_select_public"
  on public.activity_translations for select
  to anon, authenticated
  using (true);

create policy "inquiries_insert_public"
  on public.inquiries for insert
  to anon, authenticated
  with check (true);

comment on table public.vendors is
  'OTA supplier directory mirrored from Bókun and curated by Auralis.';

comment on table public.activities is
  'Mirrored Bókun activity catalog for scalable list/search use cases.';

comment on table public.activity_translations is
  'Page-level translation cache for catalog-facing activity copy.';

comment on table public.inquiries is
  'High-intent concierge leads with selected itinerary context.';

comment on table public.bookings is
  'Normalized booking/order ledger synced from Bókun checkout and webhooks.';

-- Bókun translation overlay (see data/README.md §3, §6)
-- Key: (entity_type, entity_id, field_path, lang) → text + meta

create extension if not exists "pgcrypto";

create table public.translations (
  id            bigint generated always as identity primary key,
  entity_type   text not null check (entity_type in (
    'activity', 'vendor', 'tag', 'category', 'warning', 'pricing_category'
  )),
  entity_id     text not null,
  field_path    text not null,
  lang          text not null check (lang in ('hant', 'hans', 'en')),
  text          text not null,
  meta          jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (entity_type, entity_id, field_path, lang)
);

create index translations_lookup_idx
  on public.translations (entity_type, entity_id, lang);

create index translations_stale_idx
  on public.translations ((meta->>'sourceHash'))
  where meta ? 'sourceHash';

comment on table public.translations is
  'Per-field i18n overlay for Bókun inventory. English lives in Bókun; TC/SC live here.';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger translations_updated_at
  before update on public.translations
  for each row execute function public.set_updated_at();

alter table public.translations enable row level security;

-- Public read for UI / edge functions; writes via service role only
create policy "translations_select_anon"
  on public.translations for select
  to anon, authenticated
  using (true);

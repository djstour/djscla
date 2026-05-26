alter table public.activities
  add column if not exists cover_image_owned_url text,
  add column if not exists photo_urls_owned text[] not null default '{}'::text[],
  add column if not exists image_assets jsonb not null default '[]'::jsonb;

create index if not exists activities_cover_image_owned_url_idx
  on public.activities (cover_image_owned_url);

comment on column public.activities.cover_image_owned_url is
  'First-party hero image URL mirrored from Bókun into owned storage/CDN.';

comment on column public.activities.photo_urls_owned is
  'First-party gallery/hero image URLs mirrored from Bókun into owned storage/CDN.';

comment on column public.activities.image_assets is
  'Owned derivative URLs per source photo (card, hero, gallery) for UI rendering.';

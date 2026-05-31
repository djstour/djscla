-- Trip playbooks — Hero curated itinerary bundles (rank boost, not hard filter).

create table if not exists public.trip_playbooks (
  id              bigint generated always as identity primary key,
  slug            text not null unique,
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  min_nights      integer,
  max_nights      integer,
  filter_type     text not null default 'manual'
    check (filter_type in ('chip', 'route', 'manual')),
  filter_value    text,
  activity_ids    jsonb not null default '[]'::jsonb,
  title_hant      text not null default '',
  title_hans      text not null default '',
  title_en        text not null default '',
  subtitle_hant   text not null default '',
  subtitle_hans   text not null default '',
  subtitle_en     text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists trip_playbooks_active_sort_idx
  on public.trip_playbooks (is_active, sort_order asc, id asc);

comment on table public.trip_playbooks is
  'Hero trip playbook cards; activities resolved for rank boost on Tours.';

create trigger trip_playbooks_updated_at
  before update on public.trip_playbooks
  for each row execute function public.set_updated_at();

alter table public.trip_playbooks enable row level security;

insert into public.trip_playbooks (
  slug, sort_order, filter_type, filter_value, min_nights, max_nights,
  title_hant, title_hans, title_en,
  subtitle_hant, subtitle_hans, subtitle_en
) values
  (
    'winter-aurora-gc', 10, 'chip', 'aurora', 3, 7,
    '冬季 · 極光＋黃金圈', '冬季 · 极光＋黄金圈', 'Winter · Aurora & Golden Circle',
    '3–7 晚經典首訪組合', '3–7 晚经典首访组合', 'Classic 3–7 night first visit'
  ),
  (
    'south-coast-3d', 20, 'route', 'south-coast', 2, 5,
    '南岸精選 3 天', '南岸精选 3 天', 'South Coast highlights',
    '瀑布、黑沙灘、冰川', '瀑布、黑沙滩、冰川', 'Waterfalls, black sand & glaciers'
  ),
  (
    'day-tours-reykjavik', 30, 'chip', 'day', 1, 3,
    '雷市出發一日遊', '雷市出发一日游', 'Reykjavík day tours',
    '1–3 晚快閃行程', '1–3 晚快闪行程', 'Short breaks from the capital'
  ),
  (
    'hotspring-relax', 40, 'chip', 'hotspring', 2, 6,
    '溫泉放鬆之旅', '温泉放松之旅', 'Hot spring escape',
    '藍湖與在地溫泉體驗', '蓝湖与在地温泉体验', 'Blue Lagoon & geothermal baths'
  ),
  (
    'self-drive-ring', 50, 'chip', 'self-drive', 5, 14,
    '自駕環島入門', '自驾环岛入门', 'Self-drive ring road',
    '5 晚以上深度探索', '5 晚以上深度探索', '5+ nights around Iceland'
  ),
  (
    'glacier-adventure', 60, 'chip', 'glacier', 2, 8,
    '冰川探險組合', '冰川探险组合', 'Glacier adventure pack',
    '健行、冰洞、雪地摩托', '健行、冰洞、雪地摩托', 'Hikes, ice caves & snowmobiles'
  )
on conflict (slug) do nothing;

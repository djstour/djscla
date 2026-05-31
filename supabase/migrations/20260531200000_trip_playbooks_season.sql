-- Trip playbooks — season + hub context for Hero combo cards.

alter table public.trip_playbooks
  add column if not exists season_window text
  check (season_window is null or season_window in ('winter', 'summer'));

alter table public.trip_playbooks
  add column if not exists hub_ids text[] default null;

update public.trip_playbooks
  set season_window = 'winter'
  where slug = 'winter-aurora-gc';

update public.trip_playbooks
  set hub_ids = array['reykjavik']
  where slug = 'day-tours-reykjavik';

update public.trip_playbooks
  set max_nights = 7,
      subtitle_hant = '2–7 晚南岸精選',
      subtitle_hans = '2–7 晚南岸精选',
      subtitle_en = '2–7 nights on the south coast'
  where slug = 'south-coast-3d';

insert into public.trip_playbooks (
  slug, sort_order, filter_type, filter_value, min_nights, max_nights,
  season_window,
  title_hant, title_hans, title_en,
  subtitle_hant, subtitle_hans, subtitle_en
) values (
  'summer-gc-south', 12, 'route', 'golden-circle', 3, 10, 'summer',
  '夏季 · 黃金圈＋南岸', '夏季 · 黄金圈＋南岸', 'Summer · Golden Circle & South',
  '3–10 晚經典路線', '3–10 晚经典路线', 'Classic 3–10 night route'
)
on conflict (slug) do update set
  sort_order = excluded.sort_order,
  filter_type = excluded.filter_type,
  filter_value = excluded.filter_value,
  min_nights = excluded.min_nights,
  max_nights = excluded.max_nights,
  season_window = excluded.season_window,
  title_hant = excluded.title_hant,
  title_hans = excluded.title_hans,
  title_en = excluded.title_en,
  subtitle_hant = excluded.subtitle_hant,
  subtitle_hans = excluded.subtitle_hans,
  subtitle_en = excluded.subtitle_en;

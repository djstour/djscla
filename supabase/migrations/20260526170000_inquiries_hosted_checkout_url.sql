-- Track the Bókun hosted-checkout URL we hand a visitor when they finish
-- our 3-step pre-checkout. Lets us recover abandoned carts (visitor
-- entered contact + answers but bailed on Bókun's payment page) and
-- audit which shop slug was active at the time.
alter table public.inquiries
  add column if not exists hosted_checkout_url text;

create index if not exists inquiries_status_created_at_desc_idx
  on public.inquiries (status, created_at desc);

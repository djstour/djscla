# Bókun image performance strategy

Product photos come from **Bókun S3** (`coverImageUrl`, `photoUrls`). The browser loads them via **`/api/media/thumb`** (`proxyImageUrl()` in `ui_kits/web/components/_shared.jsx`), which resizes to WebP on Vercel.

## How to measure

| Environment | Use for |
|-------------|---------|
| **https://djscla.vercel.app** | Realistic latency + CDN cache on thumb API |
| `npm start` on LAN / localhost | Dev only — every miss hits your machine, then Bókun; **looks slower than production** |

Do not conclude the pipeline is too slow from local preview alone.

## Short term (implemented in UI kit)

1. **Smaller mobile proxy widths** — card/hero `320px` (280 on save-data / 2g–3g); gallery thumbs `72px`.
2. **List → detail cache reuse** — mobile `heroFast` uses the **same width/quality as list cards** so the first hero often reuses a warmed thumb.
3. **Fewer high-priority images** — `aboveFoldImagePriorityCount()`: 2 cards on mobile home/tours grid, 4 on desktop.
4. **Detail gallery** — max 5 thumbs on mobile; only active ±1 thumb `eager`; hero stays single `fetchPriority=high`.
5. **Less eager prefetch** — smaller `IntersectionObserver` rootMargin on mobile; hover prefetch disabled on touch devices.

Tune widths in `imageProfileForViewport()`.

## Long term (catalog productization)

1. On catalog sync, persist Bókun image URLs in Supabase (or object store metadata).
2. Background job: fetch originals, generate responsive derivatives, upload to **owned storage/CDN**.
3. Frontend serves first-party URLs; Bókun S3 becomes ingest-only.

See also [VENDOR_SCALE.md](./VENDOR_SCALE.md) Phase B for catalog sync timing.

## Mobile detail UX note

Sticky CTA / heavy layout experiments previously caused regressions. Keep booking-bar changes **small and isolated** when touching detail layout ([ActivityDetail.jsx](../ui_kits/web/components/ActivityDetail.jsx)).

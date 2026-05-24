# Auralis Web · 極光旅 — UI Kit

A click-thru recreation of the Auralis booking experience. **Not production code** — components prioritise visual fidelity and demonstrate the brand's vocabulary in motion.

## Run

| Goal | Command | URL |
|------|---------|-----|
| Live Bókun catalog + checkout APIs | `npm start` (from repo root; needs `.env.local`) | http://localhost:3000/ |
| Static layout only (no `/api/*`) | `npm run preview:static` | http://localhost:8765/ui_kits/web/index.html |
| Production | Vercel deploy | https://djscla.vercel.app/ |

Do not open `index.html` via `file://` (CORS blocks `/data/*.js`). See [`docs/BOKUN.md`](../../docs/BOKUN.md) for API keys and troubleshooting.

Responsive from **640px** (phone) and **900px** (tablet) breakpoints — see `responsive.css`.

## Screens (use the floating switcher at the bottom)

| Screen | What's there |
|---|---|
| **Discover** | Animated aurora hero · category strip · 6 featured tours · "why Auralis" stats · sample 7-day trip block · footer with newsletter capture |
| **Tours** | Left rail: supplier filter (Bókun list, checkboxes), category chips, price range, guide language · right: sort bar + responsive tour grid |
| **Trip · Map** | Stylized Iceland map with 5 numbered pins · day-by-day glass itinerary panel · stat pills (drive distance, aurora forecast) |
| **Checkout** | 3-step flow — Review → Payment (card / Apple Pay / LINE Pay) → Confirmation |

All **three language modes** (繁中 ↔ 简中 ↔ EN) are wired up via the segmented toggle in the top nav. The active choice is persisted to `localStorage` and synced to `document.documentElement.lang` so CSS `:lang()` rules and assistive tech stay in step. The toggle uses single-character labels (繁 / 简 / EN) with a sliding gradient capsule.

## Components

```
components/
├── _shared.jsx          ← Icon wrapper, formatPrice, pick() i18n helper, CATEGORIES, getSupplierOptions
├── Nav.jsx              ← sticky glass header + 3-way language toggle
├── Hero.jsx             ← animated aurora + glass search panel
├── TourCard.jsx         ← atomic product tile + loading skeleton (consumes view-model)
├── SupplierFilter.jsx   ← left-rail Bókun filter (vendor + category + price + language)
├── TripPanel.jsx        ← exports MapPanel (Iceland SVG + dynamic pins from stops[].geo) and TripPanel
├── Checkout.jsx         ← Review · Payment · Done
├── Footer.jsx           ← newsletter + link columns
└── App.jsx              ← screen router + Home composition + ScreenSwitcher
```

Data layer lives at the project root in `/data/` — see `data/README.md` for the full architecture (Bókun adapter, translation overlay, OpenAI translation pipeline). The components in this kit consume `window.AuralisData.useActivities(lang)` for the activity grid and the trip map; they never see raw Bókun JSON.

### Notes for designers using this kit

- **Glass card primitive** is `.glass` from `colors_and_type.css`. Always layer it over a gradient background — it looks wrong on flat white.
- **Photos are placeholders** (CSS gradients tuned to Iceland scenes — `lagoon`, `aurora`, `glacier`, `bluelagoon`, etc.). Swap with real imagery via the `tour.photo` field; map the new keys in `_shared.jsx → PHOTO_PRESETS`.
- **Iconography**: Lucide via CDN. The map pins are inline SVG (not Lucide) because gradient fills + numbering aren't an icon-library responsibility.
- **The Iceland map** in `TripPanel.jsx` is a stylized hand-tuned path — not topologically perfect. For production, swap in a real geo-projection (e.g. d3-geo + Natural Earth 1:50m subset).
- **All copy** ships in two languages via the `lang` prop. Both are first-draft — have a native Mandarin marketer review the Traditional Chinese before launch.

### Known gaps / next steps

- No mobile breakpoint yet (kit is desktop @ 1440 design width).
- Search bar inputs are dumb text inputs — replace with date-picker + city autocomplete components.
- The map is static; in production it would be Mapbox / MapLibre with the Bókun supplier pin layer.
- Login / account / wishlist screens are stubbed via the nav but not implemented.
- No real photography. Drop 6–10 Iceland photos into `assets/photos/` and I'll wire them in.

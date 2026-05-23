# Auralis · 極光旅 — Design System

> A premium Online Travel Agency (OTA) for the Mandarin-speaking world, specialising in **Iceland** adventure and independent road-trip itineraries. Built atop the Bókun multi-supplier inventory API.

This is a **branding + UI design system**, not a production codebase. It defines the visual language, content tone, component foundations, and a UI kit prototype that downstream designers and engineers can build against.

---

## 1 · Brand at a glance

| | |
|---|---|
| **Name** | Auralis · 極光旅 (jíguāng lǚ — "Aurora Journey") |
| **Category** | Premium OTA · Iceland adventure · independent road-trip |
| **Audience** | Digital-savvy travellers, 20–40, Taiwan + Mandarin-speaking regions |
| **Suppliers** | Aggregated through Bókun API |
| **Aesthetic** | **Vibrant glassmorphism** — frosted cards over high-saturation gradients |
| **Promise** | "獨立旅人的冰島 — 自由探索，無縫預訂" *(Iceland for the independent traveller — explore freely, book seamlessly)* |

### Sources for this brand
No codebase, Figma file or slide template was attached when the design system was created — every visual and copy decision below is derived from the written brief. If you have the real product code or Figma, drop them in via the **Import** menu and re-run this build; tokens, components and the UI kit will be updated to match.

Where you'd plug them in:
- `/figma/<file-id>` — paste a Figma URL in chat and I'll mine it for tokens & components
- `/github/<repo>` — paste a GitHub URL to mirror real components
- `/uploads/<file>` — drop logos, brand books, photography here

---

## 2 · Visual foundations

> Read these as the *defaults*. Always defer to imagery and motion that already exists in production if it conflicts.

### Colour
- **No deep glacier blues. No volcanic blacks.** The brand is *bright Iceland* — fjord-meadow light, midnight-sun magenta, aurora-green pop.
- Two signature gradients drive nearly every hero, CTA and accent:
  - **Aurora** — Electric green `#2EFFB8` → Neon cyan `#00D5FF`. Used on primary CTAs, the wordmark, and the daytime hero.
  - **Midnight Sun** — Violet `#6B2FE6` → Magenta `#B331E2` → Vivid orange `#FF7A2E`. Used on evening / "premium" surfaces (private tours, concierge).
- A tertiary **Glacier Mist** wash (lavender → peach → ice-cyan) is the default backdrop for booking surfaces — bright enough to keep text readable, vibrant enough to make frosted-glass cards visible.
- **Accents**: Coral `#FF5A6A` for primary interactive states (heart, "save"). **Neon Lime** `#C6FF3F` for Bókun supplier filter chips and badges.
- **Base**: Cool-tinted near-whites (`#FAFBFE`, `#F1F4FA`). Foreground is **never pure black** — use `#11151F` for the heaviest text, `#2E3647` for primary body.

### Type
- **Latin** display: **Sora** (geometric, modern, slight tech edge).
- **Latin** body: **Manrope** (open, friendly, neutral — pairs well with Han characters).
- **Traditional Chinese** (繁體 — Taiwan / HK) UI: **Noto Sans TC** at 400 / 500 / 700.
- **Simplified Chinese** (简体 — Mainland / Singapore) UI: **Noto Sans SC** at the same weights — auto-selected when the language toggle is set to 简 or when the `<html lang>` is `zh-Hans`.
- **Editorial / quote face**: **LXGW WenKai TC** for 繁中, **LXGW WenKai** for 简中 (open-source brush-style; gives marketing copy a personal-travel-journal feel).
- Headings tighten with `letter-spacing: -0.02em` and `text-wrap: balance`. Display sizes use `clamp()` to scale fluidly. Overlines are 11px uppercase with `0.08em` tracking.
- *Substitution flag*: production should commission either a custom display face or licence Söhne / GT Walsheim — Sora is the closest free stand-in. The Chinese fonts above are production-ready as-is.

### Spacing
4-pt grid. Tokens `--space-1` (4px) → `--space-24` (96px). Page gutter is 24px. Card padding is typically `--space-6` (24px) inside, `--space-8` (32px) for marquee cards.

### Backgrounds
- **Full-bleed gradient washes** are the default backdrop for marquee sections — never a flat colour, never a stock photo behind text.
- **Real photography** appears inside glass tiles, mapped to itinerary stops, with rounded `--r-lg` (20px) corners.
- **No repeating patterns, no hand-drawn illustration.** This is a photo-and-light brand.

### Glassmorphism rules
A glass card is the brand's atomic unit. Compose every one of them with these layers:
1. Background: `rgba(255,255,255,0.55–0.72)` (`--glass-medium` / `--glass-strong`). On dark gradient sections, use `--glass-tint` (`rgba(255,255,255,0.18)`) and white text.
2. `backdrop-filter: blur(24px) saturate(1.2)`.
3. **Inner ring**: `box-shadow: inset 0 0 0 1px rgba(255,255,255,0.55)` — the white hairline is the brand's signature.
4. **Outer shadow**: cool-tinted (`rgba(20,30,60,0.12)`), never pure black, never harsh.
5. Radius: `--r-xl` (28px) by default, `--r-lg` (20px) for compact tiles, `--r-pill` for chips.

### Motion
- **Easing**: `cubic-bezier(0.22, 1, 0.36, 1)` for entrances, `cubic-bezier(0.34, 1.56, 0.64, 1)` for playful confirm states (only on success).
- **Duration**: 140ms (micro), 220ms (default), 420ms (hero entrances).
- **Aurora drift**: hero gradients animate over 18s with a slow radial-position shift. **Always respect `prefers-reduced-motion`.**
- **No bounces on hover.** Hover is opacity / brightness only.

### Interaction states
| State | Treatment |
|---|---|
| Hover (glass) | Background opacity `+0.05`, `transform: translateY(-2px)`, shadow `--shadow-3 → --shadow-4` |
| Hover (gradient CTA) | Brightness `1.06`, glow `--shadow-glow-aurora` intensifies |
| Press | `transform: scale(0.98)`, no colour change |
| Focus | 3px ring `rgba(0,213,255,0.45)` (`--ring-focus`) |
| Disabled | Opacity `0.5`, no shadow |
| Selected (chip) | Lime fill `#C6FF3F`, charcoal text |
| Loading | Aurora gradient shimmer, 1.4s loop |

### Borders & corners
- Hairlines on light surfaces: `1px solid var(--base-200)`.
- Glass cards: white inner ring only — never a coloured outer stroke.
- Corner radii lean **soft**: pills for chips and CTAs (`--r-pill`), 20–28px for cards, 14px for inputs, 6px is the minimum (used only for code blocks and tags).

### Imagery tone
- Cool-warm hybrid — the brand celebrates *bright* Iceland: turquoise glacier lagoons, magenta-orange sunsets, neon-green moss.
- **No grain. No B&W. No washed-out filters.** Saturation is left high; contrast is preserved.
- Photos are masked to rounded rectangles; circular crops are reserved for guide avatars only.
- A subtle 8% white-noise overlay is allowed on hero photos to integrate them with the glass UI.

### Layout rules
- Top nav stays at 72px height, glass-backed, sticky. Logo left, primary nav centre, account + cart right.
- Booking surfaces use a 12-col grid at desktop, 4-col at tablet, single-column on mobile.
- Itinerary maps are *always* full-bleed behind a left-anchored glass panel — never a side-by-side split.
- The cart / checkout drawer slides from the right; never modal-blocks the page.

---

## 3 · Content fundamentals

### Voice
Confident, curious, and a little bit poetic — like a well-travelled friend who happens to know every Bókun supplier on the island. Never breathless. Never corporate.

### Person
- English copy uses **"you"** (occasionally **"we"** for the brand).
- Traditional Chinese uses **「你」** in marketing and **「您」** only in formal post-purchase comms (confirmations, refunds, legal). Pick one per surface; never mix.

### Tone & casing
- **Sentence case** everywhere in product UI — including buttons, navigation, and titles. The only Title-Case exception is the proper-noun "Auralis" wordmark and named tour packages (e.g. "Golden Circle · 黃金圈" stays cased).
- Chinese punctuation is **full-width** (「，。：？！」). Latin punctuation in Chinese paragraphs is **half-width** with a hair-space buffer (`Auralis 是…`, not `Auralis是…`).
- Numbers use half-width digits in both languages; currency symbol comes before the number (`NT$ 12,800`, never `12,800 元`).
- Dates are `YYYY/MM/DD` in Chinese, `DD MMM YYYY` in English.

### Microcopy examples

| Surface | English | 繁體中文 |
|---|---|---|
| Hero headline | The Iceland trip that bends to **you**. | 為**你**而轉的冰島旅程。 |
| Hero sub | Mix and match 800+ verified suppliers into one fluid itinerary — book it all in one checkout. | 一次規劃，多家供應商無縫整合，800+ 在地嚮導任你挑選。 |
| Primary CTA | Start your itinerary → | 開始規劃 → |
| Empty cart | Your itinerary is a blank canvas. Add a tour to begin. | 行程還是一張白紙。加入第一個體驗開始規劃。 |
| Error (payment) | We couldn't take that card — try another, or pay with Apple Pay. | 這張卡無法授權，請換一張或用 Apple Pay。 |
| Success | Booked. Confirmation is on its way to your inbox. | 預訂完成。確認信已寄出。 |
| Filter chip | Self-drive · 自駕 | 自駕 · Self-drive |

### Vocabulary
- We say **itinerary** (行程), not "trip plan" or "package".
- We say **supplier** (供應商) in the back-office; in customer copy we say **local operator** (在地嚮導).
- **Adventure** > "tour". **Self-drive** > "road trip" when in product. "Road trip" is fine in marketing.
- Never say "Bókun" customer-side — it's a partner brand, not part of the user experience.

### Emoji & symbols
- **No emoji in product UI.** Ever.
- Marketing surfaces (blog, social) may use **one** emoji per piece, only from the geographic / weather set (🌋 🏔 🌌 ❄️). Never faces.
- Unicode arrows (`→`, `↗`) are used in CTAs and link copy — they reinforce the "next step" feel of the booking flow.

### Numbers & data
- Display prices to the nearest dollar; round duration to the nearest 0.5 hour ("2.5 hr").
- Star ratings are shown to one decimal ("4.8") with the count in `--fg-3` ("4.8 · 1,204 reviews").
- Avoid stat-soup. One headline number per section, never four-in-a-row.

---

## 4 · Iconography

See `assets/icons/` (Lucide library) and `ICONOGRAPHY.md` for the full guide. Quick rules:

- **Library**: [Lucide](https://lucide.dev) v0.474 — 1.75px stroke, rounded line caps, 24×24 default.
- Loaded via CDN script `https://unpkg.com/lucide@latest/dist/umd/lucide.js` and rendered with `lucide.createIcons()`. *Substitution flag*: in production, ship an icon **sprite** (subset of Lucide) instead of the runtime UMD.
- **Travel-domain icons** (aurora, glacier, geyser, road-trip arrow) ship as **bespoke SVGs** in `assets/icons/custom/` — drawn at the same 24×24 / 1.75px-stroke spec as Lucide so they sit cleanly alongside.
- **No emoji** as icons. **No flag emoji** for language toggles — we use the text strings "繁中" / "EN" instead.
- **No coloured icons** in product chrome — icons inherit text colour. Gradients are reserved for the **logo mark** and the **aurora illustration mark** used on empty-states.

---

## 5 · Repository index

```
/
├── README.md                  ← you are here
├── SKILL.md                   ← Agent Skills entry-point
├── ICONOGRAPHY.md             ← icon system, sources, substitutions
├── colors_and_type.css        ← all design tokens (vars) + base classes
│
├── fonts/                     ← self-hosted Latin webfonts (woff2)
│   ├── Sora-400/500/600/700.woff2
│   └── Manrope-400/500/600/700.woff2
│       (Chinese fonts loaded from Google Fonts at import time)
│
├── assets/
│   ├── logo-mark.svg           ← square brand mark
│   ├── logo-wordmark.svg       ← horizontal logo (light bg)
│   ├── logo-wordmark-white.svg ← horizontal logo (dark / gradient bg)
│   ├── bg-aurora.svg           ← full-bleed daytime gradient
│   ├── bg-midnight-sun.svg     ← full-bleed evening gradient
│   └── icons/custom/*.svg      ← bespoke travel-domain icons
│
├── preview/                    ← Design System tab cards
│   ├── colors-*.html
│   ├── type-*.html
│   ├── spacing-*.html
│   ├── components-*.html
│   └── brand-*.html
│
└── ui_kits/
    └── web/                    ← marketing site + booking flow prototype
        ├── README.md
        ├── index.html          ← interactive multi-screen prototype
        └── components/*.jsx    ← reusable React components
```

---

## 6 · Next steps for the user

The brand-name, gradients, voice and component grammar above are **first-draft assumptions** from your brief. Treat them as a starting point. The fastest way to dial it in:

1. **Brand name** — "Auralis · 極光旅" is a stand-in. Tell me the real one and I'll rebuild the wordmark, replace it across every file, and rename the project.
2. **Photography** — drop 4–6 real Iceland photos into `assets/photos/` and I'll wire them into the hero, itinerary cards and tour tiles. Until then, all photo slots in the UI kit are placeholder gradients.
3. **Fonts** — Sora + Manrope are free stand-ins. If you've licensed a display face (Söhne, GT Walsheim, GT America, etc.) ship me the woff2 and I'll swap them in.
4. **Real components** — if any existing UI code or a Figma file is available, share it and I'll re-derive tokens from source rather than from this brief.

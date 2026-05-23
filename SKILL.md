---
name: auralis-design
description: Use this skill to generate well-branded interfaces and assets for Auralis · 極光旅 — a premium Iceland OTA for the Mandarin-speaking (primarily Taiwanese) market. Works for production code, throwaway prototypes, mock screens, slides, marketing assets, anything visual. Contains the colour system, type tokens, fonts, gradients, glass primitives, brand voice (繁中 + EN), icon policy, and a working web UI kit.
user-invocable: true
---

# Auralis Design Skill

Read `README.md` first — it contains the brand-at-a-glance, visual foundations, content fundamentals, iconography, and an index of every file. Then explore the other resources here.

## What's inside

- `README.md` — brand brief, visual & content rules, file index
- `ICONOGRAPHY.md` — icon library (Lucide), substitution policy
- `colors_and_type.css` — all CSS custom-property tokens + base classes (`.glass`, `.bg-aurora-animated`, `.h1`…). Import this file at the top of any artifact you produce.
- `fonts/` — self-hosted Latin webfonts (Sora · Manrope); Chinese fonts come from Google Fonts via the @import in the CSS.
- `assets/` — logos (square mark + horizontal wordmark, light & white variants), full-bleed gradient backgrounds.
- `preview/` — small swatch / token cards that document the system visually. Useful reference for what each token looks like in context.
- `ui_kits/web/` — a working multi-screen prototype: Discover, Tours, Trip-with-map, Checkout. Use these JSX files as starter components when building new screens.

## When working on visual artifacts (slides, mocks, throwaway prototypes)

1. Copy `colors_and_type.css` and the `fonts/` folder next to your new HTML file, plus any logo / background SVGs from `assets/` you'll use.
2. `<link rel="stylesheet" href="./colors_and_type.css">` in your `<head>`.
3. Build with the tokens (`var(--gradient-aurora)`, `var(--glass-strong)`, `var(--font-display)`…) — never hand-write hex codes or px sizes from this brand.
4. Default backdrop is `--gradient-mist`; hero / CTA surfaces use `--gradient-aurora`; premium / concierge surfaces use `--gradient-sun`.
5. Every elevated card is a **glass card** — `.glass` class. Always pair with a gradient backdrop. Inner white hairline ring is the brand signature.
6. Icons via Lucide CDN. Inherit `currentColor`, never coloured. No emoji.

## When working on production code

Read the same files, but treat them as a *spec* rather than copy-paste source:
- Re-author CSS tokens as your framework's idiom (Tailwind theme, design-tokens, CSS-in-JS theme, etc.).
- Re-author the JSX components in `ui_kits/web/components/` against your real component primitives — they're cosmetic recreations, not production-grade.
- Production must ship the icon set as a sprite (not the Lucide UMD bundle).
- Replace placeholder gradient "photos" with real Iceland photography.

## When the user invokes this skill with no other guidance

Ask first:
1. **What are we making** — slide, mock screen, marketing page, prototype, video?
2. **What surface** — booking flow, marketing site, mobile app (no kit exists yet), email, social?
3. **Language** — Traditional Chinese, English, or both?
4. **How prototypical** — pixel-perfect to the existing kit, or exploring a new direction within the brand?

Then act as an expert designer. Output HTML artifacts (with `colors_and_type.css` imported) for visual work; output framework-native code only when the user has explicitly attached a production codebase.

## Hard rules

- **No deep glacier blues, no volcanic blacks** as primary fills. The brand is *bright* Iceland.
- **No emoji** in product UI; ≤ 1 geographic emoji per marketing piece.
- **No flag glyphs** — use text strings `繁中` / `EN` for language switches.
- **Foreground is never pure black** — use `#11151F` as the heaviest text colour.
- **Glass cards always carry the white inner-ring hairline** — without it, the depth reads as "flat translucent rectangle", not as the Auralis glass primitive.
- **Sentence case** for all UI strings (buttons, nav, titles). Title-case only for the wordmark "Auralis" and named tour packages.
- **Full-width Chinese punctuation** when in 繁中; half-width Latin punctuation within Chinese paragraphs with a hair-space buffer.
- **Currency**: `NT$ 12,800` — symbol first, half-width digits, comma grouping.

## File copy-out template (for HTML artifacts)

```
<artifact>/
├── index.html
├── colors_and_type.css       (copy from skill root)
├── fonts/                    (copy from skill root)
│   ├── Sora-*.woff2
│   └── Manrope-*.woff2
└── assets/
    ├── logo-wordmark.svg     (or -white.svg over gradient)
    └── …whatever else you use
```

Reference Chinese fonts only by their CSS family name (`'Noto Sans TC'`, `'LXGW WenKai TC'`) — they auto-load from Google Fonts via `colors_and_type.css`.

# Iconography — DJS Tour

## Library

**Lucide** (https://lucide.dev) v0.474.0 — open-source MIT.

- **Style**: line, 1.75px stroke, rounded caps & joins, 24×24 box.
- **Loading** (HTML prototypes): include the UMD bundle from CDN, then call `lucide.createIcons()` after mount.

```html
<script src="https://unpkg.com/lucide@0.474.0/dist/umd/lucide.js"></script>
<script>lucide.createIcons();</script>
```

- **Production**: ship a sprite of the ~60 icons actually in use rather than the full UMD bundle. Generate with the Lucide CLI:
  `npx lucide-sprite --names map,compass,plane,car-front,calendar,user,heart,filter,search,arrow-right,arrow-up-right,star,check,x,chevron-right,plus,minus -o assets/icons/sprite.svg`

## Usage rules

- Icons **inherit currentColor** — never apply gradient or brand colour. The only gradient-coloured glyph in the system is the **logo mark** itself.
- Default size 20px (in 24px hit box). Touch targets are always 44×44 minimum.
- Icon + label spacing is `--space-2` (8px). Icon-only buttons must carry an `aria-label`.
- Never combine two icons in a single button.

## Icons in use (current UI kit)

| Icon | Where |
|---|---|
| `search` | Search bar |
| `map`, `map-pin` | Itinerary map, supplier locations |
| `compass` | "Explore" nav item |
| `plane`, `car-front`, `bus`, `ship` | Tour transport modes |
| `calendar`, `clock` | Departure date, duration |
| `users`, `user` | Party size, account |
| `heart` | Save / wishlist (filled state uses coral `#FF5A6A`) |
| `filter`, `sliders-horizontal` | Filter drawer |
| `arrow-right`, `arrow-up-right` | CTAs |
| `chevron-down`, `chevron-right` | Disclosure, breadcrumbs |
| `star` | Reviews (filled for rating, outline for empty) |
| `check`, `check-circle-2` | Confirmation states |
| `shield-check` | Trust marks ("Verified supplier") |
| `wallet`, `credit-card` | Checkout |
| `globe` | Language toggle |
| `tag` | Price / promo |
| `circle-alert`, `info` | Alerts |

## Domain icons (Iceland-specific)

Lucide does not ship aurora, geyser, glacier, hot-spring, or volcano icons. **Substitution policy**:

| Concept | Substitute (current) | Production plan |
|---|---|---|
| Aurora | `sparkles` | Commission a bespoke aurora-arc glyph (matched to Lucide grid) |
| Geyser | `droplets` | Commission |
| Glacier / lagoon | `snowflake` | Commission |
| Hot spring | `bath` | Commission, or use Lucide `flame` paired with `droplet` |
| Volcano | `mountain` | Commission |
| Self-drive | `car-front` | Use as-is; Lucide is on-brand for this |
| Northern Lights tour | `sparkles` | Commission aurora glyph above |

**Flag**: all five domain glyphs above are stand-ins. The brand reads more authentic with bespoke icons; commission these next.

## Emoji & flag policy

- **No emoji in product UI.** Marketing only, ≤ 1 per piece, geography/weather set only (🌋 🏔 🌌 ❄️).
- **No flag emoji** for language switch — we use text labels: `繁中` / `EN`.
- **No country-flag glyphs anywhere** — Iceland is *the* destination, so we never need to flag it; user nationality is collected at checkout but never iconised.

## Logo

| Asset | When to use |
|---|---|
| `assets/logo-mark.svg` | Favicon, app icon, avatar contexts, ≤ 32px |
| `assets/logo-wordmark.svg` | Default header on light backgrounds |
| `assets/logo-wordmark-white.svg` | Header on gradient / dark backgrounds |

Clear-space around the wordmark is one **A** height on all sides. Minimum wordmark width is 120px. **Never** re-colour the gradient. **Never** apply a drop-shadow to the mark — the gradient is the depth.

# Data layer — Bókun ingest + i18n overlay + OpenAI translation pipeline

This folder is the **source-of-truth boundary** between the live Bókun OTA inventory and our DJS Tour UI. Everything UI-side reads through `bokunAdapter.js`; everything API-side conforms to what Bókun actually returns. Translations are an overlay, not a fork of the data. Internal namespace `window.AuralisData.*` is kept verbatim for stability.

> **Bókun API:** Production code uses **REST v2 only** (`/restapi/v2.0/*`). Sections below that mention `activity.json` describe the **legacy v1 field shape** still mirrored in `normalizeActivity()` — not live HTTP paths. See [docs/BOKUN_REST_V2.md](../docs/BOKUN_REST_V2.md).

```
data/
├── bokunTranslations.js      ← per-field i18n overlay keyed by Bókun ID
├── bokunAdapter.js           ← fetch /api/bokun/activities → view-model
└── README.md                 ← this file
```

## 1 · End-to-end data flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            UI (React)                                       │
│                                                                             │
│  <TourCard tour={ViewModel} />     ← reads localised strings only           │
│        ▲                                                                    │
│        │ window.AuralisData.useActivities(lang)                             │
│        │                                                                    │
│  ┌─────┴─────────┐  toViewModel(activity, lang)                             │
│  │  bokunAdapter │ ───────────────────────────────────────────────────────► │
│  │     .js       │                                                          │
│  └─────┬─────────┘                                                          │
│        │                                                                    │
│   raw  │       overlay                                                      │
│        ▼                                                                    │
│  ┌──────────────┐    ┌──────────────────────────────┐                       │
│  │ mockBokun    │    │ bokunTranslations.js         │                       │
│  │   Data.js    │    │  { ACTIVITIES, TAG,          │                       │
│  │  (= GET      │    │    CATEGORY, VENDOR,         │                       │
│  │  /activity)  │    │    PRICING_CATEGORY,         │                       │
│  └──────────────┘    │    WARNING }                 │                       │
│                      └─────────▲────────────────────┘                       │
│                                │                                            │
│                       ┌────────┴───────────┐                                │
│                       │ OpenAI translation │  (background workers)         │
│                       │  pipeline (§ 4)    │                                │
│                       └────────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2 · Bókun shape (normalized view-model)

Live ingest maps **v2** `ExperienceComponentsDto` → `normalizeActivity()` → the same field names the UI expects (formerly documented against v1 `activity.json`). Key fields:

| Field | Type | Used for |
|---|---|---|
| `id` | number | Stable Bókun activity ID — joins to translations + analytics |
| `externalId`, `slug` | string | URL routing, vendor-side SKU |
| `title`, `summary`, `description` | string (HTML) | Card title, detail page body |
| `durationText`, `durationMinutes` | string / number | Duration chips (we re-render Chinese from minutes) |
| `vendor` | `Vendor` (nested) | Supplier filter, vendor pages |
| `pricingCategories[]` | Adult / Child / Infant / Senior with `minAge` / `maxAge` | Pricing table |
| `pricing[]` | `[{ pricingCategoryId, amount, currency }]` | Per-category prices |
| `startTimes[]` | `[{ hour, minute, label }]` | Time-slot picker |
| `meetingType`, `meetingPoint` | enum + geo | Map pin, pickup copy |
| `stops[]` | `[{ id, title, geoPoint, durationMinutes }]` | Trip-with-map markers |
| `themes`, `categories`, `keywords` | string[] | Filter chips, search |
| `coverImageUrl`, `photos[]` | URL[] | Card hero, gallery |
| `averageRating`, `reviewCount` | number | Card rating row |
| `cancellationCutoffMinutes` | number | "Free cancellation up to N h" |
| `availability` | `{ type, bookableNow, capacityRemaining, nextAvailableDates, lastChecked, warning }` | "Selling fast" badge, date picker |
| `tags` | string[] (`top_pick`, `selling_fast`, `premium`, `mandarin_guide`) | Card badge, marketing flags |
| `categoryLabels` | string[] | Flattened Bókun category leaves (detail API) |
| `chipIds` | string[] | Experience types: `aurora`, `glacier`, `hotspring`, `day`, `self-drive`, `water`, `snow`, `outdoor` |
| `routeIds` | string[] | Route facets: `golden-circle`, `south-coast` |
| `facetIds` | string[] | Facets: `premium`, `free-cancel`, `mandarin`, `winter`, `reykjavik` |

### Category chips (hybrid rules + detail cache)

Bókun **search** often omits categories; **detail** returns a nested tree. We:

1. **Rules** — `lib/chipIds.js` maps title / keywords / flattened labels → `chipIds` on every `normalizeActivity()`.
2. **Cache** — `data/chipIdsCache.json` stores detail-enriched chips; merged in `lib/catalog.js` via `applyChipCache()`.

Refresh cache after catalog changes:

```bash
npm run enrich:chips          # needs BOKUN_* in .env.local
npm run enrich:chips:api      # uses deployed /api (no keys)
```

**Automation (planned, not implemented):** see [`docs/CHIP_IDS_AUTOMATION.md`](../docs/CHIP_IDS_AUTOMATION.md) — Vercel Cron + Supabase/KV (long-term) or GitHub Actions weekly commit (quick win).

Per-date slots come from **v2** `GET /restapi/v2.0/availability/{experienceId}`. We keep activity-level summary on the normalized payload and `availabilities[]` for the date-picker API.

## 3 · Translation overlay

Bókun returns English. We do not store translations *inside* the activity record — that would make every re-sync clobber human edits. Instead:

```js
// keyed by Bókun ID, then by field path
ACTIVITIES[723460] = {
  title:    { hant: '冰川健行 · 藍冰洞', hans: '冰川徒步 · 蓝冰洞', meta: {...} },
  summary:  { hant: '中級難度…',         hans: '中级难度…',         meta: {...} },
  stops:    { 101: { hant: '…', hans: '…' }, … },
  mode:     { hant: '探險', hans: '探险', en: 'Adventure' },
}
```

Each entry's `meta` block stamps **provider** (`manual` / `openai` / `human-review`), **sourceHash** (sha-1 of the English source string at translation time), **reviewedAt**, **reviewedBy**. When upstream English changes the hash mismatches and the adapter marks the entry `stale`, triggering re-translation. See `bokunAdapter.validateTranslation()`.

### Why we don't OpenCC-convert between TC and SC

The 健行 → 徒步 example on activity 723460 is the canonical case. Taiwan idiom uses **健行** for "hiking"; Mainland-standard is **徒步**. OpenCC (or a script-only converter) would translate **健行** → **健行** because both characters exist in Simplified. The traveller's *expectation* of the word differs by region, so we author both variants explicitly and document the gloss in the overlay's `meta.glossNote`.

Other examples in the current overlay:
- 雷克雅維克 (TC, phonetic via 維) vs 雷克雅未克 (SC, phonetic via 未)
- 嚮導 (TC) vs 向导 (SC) — same word, different script + vocab register
- 結帳 (TC) vs 结账 (SC) — same idea, different verb

## 4 · OpenAI translation pipeline

**Implemented** — operational guide: [docs/TRANSLATIONS.md](../docs/TRANSLATIONS.md).

When a new Bókun activity lands (initial sync or upstream edit), we run this pipeline:

```
┌─ Bókun webhook / nightly sync ──────────────────────────────────────┐
│                                                                     │
│  for each activity:                                                 │
│    for each translatable field (title, summary, stops[*]):          │
│      hash = sha1(activity.field)                                    │
│      for each lang in [hant, hans]:                                 │
│        status = validateTranslation(id, field, lang, hash)          │
│        if status === 'missing' or 'stale':                          │
│          enqueue(translationJob(id, field, lang, source))           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─ Translation worker ─────────────────────────────────────────────────┐
│                                                                     │
│  job = dequeue()                                                    │
│  glossary = loadGlossary(lang)                                      │
│  prompt = buildPrompt({                                             │
│    source: job.source,                                              │
│    targetLang: job.lang,        // 'hant' or 'hans'                 │
│    fieldType: job.field,        // 'title' / 'summary' / 'stop'     │
│    brandVoice: AURALIS_VOICE,                                       │
│    glossary,                                                        │
│  })                                                                 │
│                                                                     │
│  response = openai.chat.completions.create({                        │
│    model: 'gpt-4o-mini',                                            │
│    response_format: { type: 'json_object' },                        │
│    messages: [                                                      │
│      { role: 'system',  content: brandSystemPrompt() },             │
│      { role: 'user',    content: prompt },                          │
│    ],                                                               │
│    temperature: 0.3,                                                │
│  })                                                                 │
│                                                                     │
│  translations.upsert({                                              │
│    activityId, field, lang,                                         │
│    text: response.translation,                                      │
│    meta: { provider: 'openai',                                      │
│            sourceHash: job.hash,                                    │
│            reviewedAt: now() },                                     │
│  })                                                                 │
│                                                                     │
│  if (field is high-visibility): flag for editorial review            │
└─────────────────────────────────────────────────────────────────────┘
```

### Prompt skeleton (production)

```
SYSTEM: You are a localisation editor for DJS Tour, a premium Iceland OTA for
        Mandarin-speaking adventurers (primary market: Taiwan, secondary:
        Mainland China and Singapore). Style: confident, curious, slightly
        poetic — never breathless, never corporate. Use sentence case.
        Currency: NT$ before the number. Dates: YYYY/MM/DD. Use 你 (informal)
        in product copy. Use full-width Chinese punctuation; half-width Latin
        punctuation in Chinese paragraphs with a hair-space buffer.

        When translating to Traditional Chinese: use Taiwan-standard
        vocabulary (健行 hiking, 嚮導 guide, 結帳 checkout, 雷克雅維克 etc).
        When translating to Simplified Chinese: use Mainland-standard
        vocabulary (徒步 hiking, 向导 guide, 结账 checkout, 雷克雅未克 etc).

        Never invent product features. If the source text is ambiguous,
        prefer fidelity over flourish.

USER:   Translate this <fieldType> from English to <targetLang>.
        Glossary (must honour exactly):
          <glossary entries>

        Source:
          "<the English source text>"

        Return JSON: { "translation": string, "notes": string|null }
```

### Glossary

Authored in version control as YAML, loaded at job time:

```yaml
# glossary/hant.yaml
"local operator": "在地嚮導"
"itinerary":     "行程"
"checkout":      "結帳"
"Reykjavík":     "雷克雅維克"
"Jökulsárlón":   "傑古沙龍冰河湖"
"glacier hike":  "冰川健行"

# glossary/hans.yaml
"local operator": "当地向导"
"itinerary":     "行程"
"checkout":      "结账"
"Reykjavík":     "雷克雅未克"
"Jökulsárlón":   "杰古沙龙冰河湖"
"glacier hike":  "冰川徒步"
```

### Quality gates

1. **JSON schema check** — output must parse with `{translation: string, notes: nullable string}`.
2. **Length sanity** — translation length must be within 0.4–1.6× the source's character count.
3. **Glossary compliance** — every glossary key in the source must appear (translated) in the output.
4. **No HTML** — strip all tags before sending; translation is plain text.
5. **Editorial review** — `title` and `summary` for top-30 activities (by booking volume) require human sign-off before promotion to `provider: human-review`.

### Failure modes

| Failure | Behaviour |
|---|---|
| OpenAI returns garbage / unparseable JSON | Mark job failed, retry up to 3× with exponential back-off, then page on-call |
| Glossary violation | Auto-reject, re-queue with the offending terms pinned in the prompt |
| Length sanity violation | Flag for human review; do NOT auto-promote |
| OpenAI rate limit | Local queue back-off; never block UI render — adapter falls back to English |

### Cost ceiling

≈ 6 fields × 6 activities × 2 langs ≈ 72 translations on initial seed. At ~120 input tokens + ~80 output tokens per call and `gpt-4o-mini` pricing, that's < US$0.05. Per-day delta sync at the current Bókun catalogue size projects < US$1/day. Trivial.

## 5 · How the UI calls all this

```jsx
// inside any React component
const { useActivities } = window.AuralisData;

function ToursScreen({ lang }) {
  const { loading, error, activities } = useActivities(lang);

  if (loading) return <TourCardSkeletonGrid count={6} />;
  if (error)   return <ErrorState onRetry={…} />;

  return (
    <div className="grid">
      {activities.map(vm => <TourCard key={vm.id} tour={vm} lang={lang} />)}
    </div>
  );
}
```

Components receive the **fully-localised view-model**. They do not look up translations, they do not know the Bókun shape, they do not care whether a string came from `manual`, `openai`, or `human-review`. Everything below the adapter is *replaceable* — swap mocks for real `fetch()` calls, swap OpenAI for DeepL, swap React for vanilla template literals — without touching the components.

## 6 · Where this lands in production code

- `mockBokunData.js` → removed; catalog/detail use `lib/bokunV2Catalog.js` + `lib/bokun.js` (REST v2) and Supabase mirror (`CATALOG_SOURCE=db`).
- `bokunTranslations.js` → moved to a `translations` table in Postgres with the same key shape `{activityId, field, lang} → {text, meta}`.
- `bokunAdapter.js` → stays nearly identical. The fetch stub becomes a real fetch. The translation lookup becomes a DB read (or, more likely, a single hydrated payload from a Server Component).
- The OpenAI worker → a separate Node/Inngest/Trigger.dev function that listens for Bókun webhooks and the editorial team's manual "retranslate" command.

## 7 · Vanilla template-literal example

The user asked whether we could drop React. The adapter is framework-agnostic; here is the same dynamic Tours grid rendered with template strings and a tagged class:

```html
<div id="tours-grid"></div>
<script src="data/mockBokunData.js"></script>
<script src="data/bokunTranslations.js"></script>
<script src="data/bokunAdapter.js"></script>
<script>
  const { BokunAdapter } = window.AuralisData;
  let currentLang = 'hant';

  async function renderGrid(lang) {
    const raw = await BokunAdapter.fetchActivities();
    const vms = BokunAdapter.toViewModels(raw, lang);
    document.getElementById('tours-grid').innerHTML = vms.map(vm => `
      <article class="glass tour-card" data-id="${vm.id}">
        <div class="cover" style="background:${PHOTOS[vm.photo]}"></div>
        <h3>${vm.title}</h3>
        <p class="supplier">${vm.supplier} · ${vm.supplierRole}</p>
        <div class="meta">
          <span>${vm.duration}</span>
          <span>${vm.mode}</span>
          <span>★ ${vm.rating} · ${vm.reviews}</span>
        </div>
        ${vm.badge ? `<span class="badge">${vm.badge}</span>` : ''}
        <div class="price">NT$ ${vm.price.toLocaleString()}</div>
      </article>
    `).join('');
  }
  renderGrid(currentLang);
</script>
```

React earns its keep on the *interactive* surfaces (filter state, trip state, the language toggle's persistence), but the data layer would not change one line if we swapped it out.

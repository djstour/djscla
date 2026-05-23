# Handoff — 接手 Auralis 設計系統開發

> 這份文件給 Cursor / Claude Code / 任何 AI 助理看的，讓他們能直接接上下文繼續開發。

## 一句話總結

Auralis · 極光旅 是為華語旅人打造的冰島 OTA 設計系統。透過 Bókun API 串接 800+ 在地嚮導庫存，採用 vibrant glassmorphism 視覺語言。目前已完成設計系統定義、3 種語系（繁/簡/EN）的 UI Kit Prototype，以及 Bókun adapter 的資料層架構。

## 專案結構

```
/
├── README.md                ← 品牌總覽、視覺基礎、文案規範
├── SKILL.md                 ← Agent Skills 入口（可作為 Claude Code skill 使用）
├── ICONOGRAPHY.md           ← 圖示系統說明（Lucide）
├── colors_and_type.css      ← 所有設計 tokens（顏色、字體、間距、陰影）
├── fonts/                   ← 自架的 Sora + Manrope（拉丁字體）
├── assets/                  ← Logo 各版本、漸層底圖
├── preview/                 ← 設計系統卡片（color/type/spacing/components/brand）
├── data/                    ← ★ Bókun 資料層
│   ├── bokunAdapter.js      ← GET /api/bokun/activities（生產 Bókun，無 mock）
│   ├── bokunTranslations.js ← 翻譯 overlay（每個 activity 對應的 hant/hans）
│   ├── bokunAdapter.js      ← Bókun → view model 轉換 + React hook
│   └── README.md            ← ★ 含 OpenAI 翻譯 pipeline 架構圖
└── ui_kits/web/
    ├── index.html           ← 4 屏互動 prototype
    └── components/          ← Nav、Hero、TourCard、SupplierFilter、TripPanel、Checkout…
```

## 跑起來

這個 prototype 用了 `<script type="text/babel">` 即時編譯，**不能直接用 `file://` 開啟**（會因為 CORS 拒絕載入 `data/` 下的 JS 檔）。需要本機起一個 HTTP server：

```bash
# 在專案根目錄
cd /path/to/auralis-design-system

# 任選一個：
python3 -m http.server 8000
# 或
npx serve .

# 然後開
open http://localhost:8000/ui_kits/web/index.html
```

設計系統卡片也一樣：
- `http://localhost:8000/preview/color-gradient-aurora.html` 等等。

## 已完成的里程碑

1. ✅ 設計系統基礎（顏色、字體、間距、陰影、玻璃擬態元件）
2. ✅ 30+ 設計系統預覽卡片（在原本的 Design System tab 顯示）
3. ✅ Web UI Kit 雛形（4 屏：Discover / Tours / Trip-with-map / Checkout）
4. ✅ 三語切換（繁中 ↔ 簡中 ↔ EN）— 字體會自動依 `:lang()` 切到 Noto Sans TC / SC
5. ✅ Bókun API 資料層架構（Mock data → Adapter → View model → UI）
6. ✅ OpenAI 翻譯 pipeline 規格（詳見 `data/README.md` § 4）

## 接下來建議的工作項目

### 高優先
- **接真實 Bókun API**：把 `data/bokunAdapter.js` 裡的 `fetchActivities()` stub 替換成真的 `fetch('/api/bokun/activities')`，並在後端代理 Bókun 的 `X-Bokun-AccessKey` header。
- **接 OpenAI 翻譯 worker**：實作 `data/README.md § 4` 描述的翻譯 pipeline。系統 prompt、glossary、品質檢查都已寫好規格。
- **真實照片**：目前所有 tour card 的「照片」都是 CSS 漸層（在 `_shared.jsx` 的 `PHOTO_PRESETS`）。準備好真的照片後丟到 `assets/photos/`，把 mock data 裡的 `coverImagePlaceholder` 改成 `coverImageUrl`。

### 中優先
- **行動版斷點**：目前所有 UI 都是桌面版 1440px 設計。需要 ≤ 768px 的版本。
- **真實地圖**：`TripPanel.jsx` 裡的 Iceland 是一個手刻的 SVG 路徑。正式版要換成 Mapbox / MapLibre，feed 同樣的 `vm.stops[].geo` 座標進去。
- **可用日期 picker**：`activity.availability.nextAvailableDates` 已經建好，但目前還沒有日曆元件。
- **登入 / 帳號頁**：Nav 有預留圖示，但畫面沒做。

### 低優先（之後再說）
- **iOS / Android app UI kit**：目前只有 web 版。手機 native UI kit 可以用 `copy_starter_component` 取得 iOS/Android frame 起手。
- **email template**：訂購確認信、行程提醒信。
- **動態 OG image generation**：每個行程一張分享卡。

## 重要的設計決策（請延續）

1. **沒有純黑、沒有深冰川藍**：foreground 用 `#11151F` 最深；不要直接寫 hex，請走 `var(--fg-1)` 等 token。
2. **不用 emoji 在產品 UI 裡**：marketing 文案最多一個地理 emoji（🌋 🏔 🌌 ❄️）；UI 內絕不使用，圖示走 Lucide。
3. **語系策略**：繁中是主，簡中是 first-class（不只是繁→簡的 OpenCC 轉換）。範例：TC 用「健行」、SC 用「徒步」；TC「雷克雅維克」、SC「雷克雅未克」。這些差異要在翻譯時尊重。
4. **玻璃卡片永遠要白色內邊（inset hairline ring）**：這是品牌的視覺簽名。
5. **句首大寫（sentence case）**：所有 UI 字串都用句首大寫，不要 Title Case（除了品牌名 "Auralis" 和已命名的行程 e.g. "Golden Circle"）。

## 給 AI 助理的提示

如果你（接手的 AI agent）要在 Cursor 裡幫使用者開發：

- 先讀 `README.md` 拿到品牌全貌
- 再讀 `data/README.md` 了解資料層架構（特別是 OpenAI 翻譯 pipeline 那節）
- 動到任何 UI 時，先 `import 'colors_and_type.css'`，不要自己寫顏色/字體 hex
- 寫新的 component 時，把 `lang` 當 prop 傳下去，文案走 `pick(lang, { hant, hans, en })` 模式
- 跑 prototype 前提醒使用者要起 HTTP server
- 三語都要做，不要只寫繁中

## 環境 / 工具建議

- **Node 18+**：未來實作 OpenAI worker 時需要
- **Vite / Next.js**：正式產品建議遷移到框架（目前是 vanilla React + Babel CDN）
- **ESLint + Prettier**：目前沒設定
- **Storybook / Ladle**：可考慮把 `ui_kits/web/components/` 移過去

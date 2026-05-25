# 供應商擴展策略（Vendor scale）

本文件記錄 Auralis 從**少數供應商（目前 Arctic Adventures + Adventure Vikings，約 140+ SKU）**擴展到**多供應商（目標最多約 1000 家）**時的產品與技術策略。實作應依階段推進，避免在 SKU 暴增後才改架構。

## 現況（Phase A — 已採用）

| 項目 | 做法 |
|------|------|
| 目錄來源 | Bókun `POST /activity.json/search`（分頁，單次最多 100） |
| 對外 API | `GET /api/catalog/activities`（穩定契約；內部仍打 Bókun） |
| 小型目錄 | `?all=true` 在伺服器串頁拉齊（上限 `maxItems`，預設 2000）— **僅適合總 SKU 在數千以內** |
| 前台載入 | `bokunAdapter` 預設 `all=true`，顯示正確 `meta.total`（如 123） |
| 翻譯 | Vercel Cron 每 6h 自動補齊缺漏；首次全量用 `scripts/sync-all-translations.sh` |
| 供應商篩選 | Tours 左側欄 **supplier pills**；數字 = Bókun 合約產品數（`vendorContractCounts`，見 `data/bokunVendors.json`） |

**已知限制：** Bókun search 未保證依 `vendorId` 伺服器端篩選；多供應商全庫很大時，不可長期依賴 `all=true`。

---

## 原則（所有階段適用）

1. **供應商優先** — 使用者先選供應商（或目的地），再瀏覽行程；首頁不載入全站 SKU。
2. **Bókun = 權威來源 + 即時交易** — 詳情、空位、價格、下單仍走 Bókun API；列表與搜尋逐步遷到自有索引。
3. **翻譯在背景** — OpenAI 僅在 sync worker；瀏覽器只讀 Supabase overlay。
4. **尊重速率** — Bókun 約 400 req/min；catalog sync 需分頁、可續跑、可排程。
5. **契約 = channel 可賣 SKU** — 後台合約數應等於 search 分頁加總；與「程式只取第一頁」無關。

---

## Phase B — 數十～數百家供應商（已實作 v1）

**觸發條件：** 全 channel SKU > ~2000，或 UI 載入 `all=true` 逾時 / 記憶體過大。

| 層 | 做法 |
|----|------|
| 資料庫 | Supabase：`vendors`、`activities`（`bokun_activity_id`、`bokun_payload`、`source_hash`、`chip_ids`、`route_ids`、`facet_ids`、`last_synced_at`） |
| Schema | `supabase/migrations/20260524093000_ota_core.sql` + `20260525025000_catalog_chip_ids.sql`（GIN on chip/route/facet + tsvector on `title_en`） |
| Sync | `lib/catalogSync.js` → `fetchChannelContractCatalog()` + `source_hash` diff，僅 upsert 變更列；遺失 SKU 標 `is_active=false` |
| 排程 | Vercel Cron `15 */2 * * *`（`vercel.json`）→ `GET /api/catalog/sync`；Bearer auth 走 `CRON_SECRET`／`CATALOG_SYNC_SECRET` |
| 列表 API | `GET /api/catalog/activities?source=db&vendorId=…` → 查 Supabase（fallback Bókun on miss）；用 `CATALOG_SOURCE=db` 切換預設來源 |
| 前台 | Tours 既有 `bokunAdapter` 客戶端不變；`meta.source` 顯示 `db` 表示已走快取路徑 |
| 翻譯 | 佇列：新品或 `source_hash` 變更 → 既有 `/api/translations/cron` |
| 待辦 | DB 端的 chip/route/facet/q 篩選 WHERE（目前快取內只做 vendor 過濾與排序） |

```mermaid
flowchart LR
  Bokun[Bókun search]
  Cron[Catalog sync cron]
  DB[(Supabase)]
  API[/api/catalog]
  UI[Web UI]

  Bokun --> Cron --> DB
  UI --> API --> DB
  UI -->|detail book| Bokun
```

---

## Phase C — 接近 1000 家供應商

**觸發條件：** `activities` 表 > ~50k 列，或搜尋延遲 / 成本明顯上升。

| 層 | 做法 |
|----|------|
| 搜尋 | Typesense / Algolia / Postgres `tsvector`；只索引列表欄位 |
| 快取 | 依 `vendorId + lang` CDN / KV（熱門供應商首頁） |
| Sync | 增量：僅同步 `lastModified` 變更；全量週期性校驗 |
| 翻譯 | 按供應商配額排程；優先熱門 SKU |
| 多租戶 | RLS 或應用層依 `vendor_id` 隔離營運資料 |

**禁止：** 單次 HTTP 拉全庫、單次 serverless 翻譯全庫、首屏載入所有供應商全部行程。

---

## API 契約（穩定面）

`GET /api/catalog/activities`

| Query | 說明 |
|-------|------|
| `lang` | `hant` \| `hans` \| `en`（影響 Bókun 請求語系參數） |
| `page`, `pageSize` | 分頁（`pageSize` ≤ 100） |
| `all` | `true` = 伺服器串頁（受 `maxItems` 限制） |
| `maxItems` | 與 `all` 合用，預設 2000 |
| `vendorId` | 可選；DB 路徑由 `bokun_payload->vendor->>id` 過濾（Phase B），Bókun 路徑為回應後篩選 |
| `source` | 可選 `db` \| `bokun`（預設讀 `CATALOG_SOURCE`，再退回 `bokun`） |

回應：

```json
{
  "source": "bokun",
  "activities": [],
  "translations": {},
  "meta": {
    "page": 1,
    "pageSize": 50,
    "total": 123,
    "hasMore": false,
    "quoteCurrency": "USD"
  }
}
```

`GET /api/bokun/activities` 保留為相容別名（轉呼叫 catalog 邏輯）。

---

## 翻譯批次（營運）

```bash
# 需 TRANSLATION_SYNC_SECRET；會分頁取得全部 activity id 再逐個 sync
./scripts/sync-all-translations.sh
```

大量 SKU 時改為：只 sync 單一 `vendorId`、或 Supabase 佇列表中 `pending` 列。

---

## 決策檢查表

新增供應商或 SKU 明顯增加時：

- [ ] Bókun channel 是否已掛約且 search 能搜到新 SKU？
- [ ] 全庫 SKU 是否仍 < `maxItems`（可繼續 `all=true`）？
- [ ] 若否：是否已啟動 Phase B（catalog 表 + 分頁 UI）？
- [ ] 翻譯是否改為佇列／按 vendor 批次，而非單次大 limit？
- [ ] `meta.total` 是否來自加總或 DB count，而非單頁筆數？

---

## 相關文件

- [BOKUN.md](./BOKUN.md) — 連線與環境變數
- [TRANSLATIONS.md](./TRANSLATIONS.md) — 翻譯 pipeline
- [data/README.md](../data/README.md) — view-model 與 overlay

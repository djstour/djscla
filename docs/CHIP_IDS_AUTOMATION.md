# ChipIds 快取自動化（待實作）

> **狀態：** 已記錄，尚未實作。  
> **背景：** 2026-05 已上線混合 C（規則 + `data/chipIdsCache.json` 詳情補齊），commit `14e6fde`。

## 現況（已上線）

| 層級 | 機制 | 是否自動 |
|------|------|----------|
| 規則 | `lib/chipIds.js` → 每筆 `normalizeActivity()` 依標題/摘要/時長推 `chipIds` | ✅ 每次 API 請求 |
| 快取 | `data/chipIdsCache.json` → `lib/chipCache.applyChipCache()` 在 catalog 回傳前合併 | ✅ 讀取部署內 JSON |
| 手動更新快取 | `npm run enrich:chips` / `npm run enrich:chips:api` | ❌ 需人工或 CI |

**限制：** Vercel serverless **無法**在執行時改 repo 內的 `chipIdsCache.json` 並自動 commit。目錄新增/分類大改時，需重跑 enrichment 再部署。

**參考：** `data/README.md`（Category chips 小節）、`lib/enrichChipIds.js`、`scripts/enrich-chip-ids.js`。

---

## 待實作目標

當 Bókun **商品目錄變更**（新增/下架、分類或標題大改、多供應商擴品）時，**不必手動跑腳本 + commit**，`chipIds` 仍與詳情一致。

---

## 方案比較（擇一或分階段）

### 方案 A — Vercel Cron + 可寫儲存（長期推薦）

對齊既有 `/api/translations/cron` 模式。

1. 新增 `GET /api/catalog/enrich-chips`（`Authorization: Bearer CRON_SECRET`）
2. `vercel.json` 增加 cron（建議：每週一次，或每日 off-peak）
3. 流程：拉全目錄 → 僅對快取缺失/過期 id 打 Bókun detail → 寫入 **Supabase** 或 **Vercel KV**
4. `lib/catalog.js`：`applyChipCache` 改讀 DB/KV；JSON 檔可保留為 fallback 或移除

| 優點 | 缺點 |
|------|------|
| 全自動、不觸發每次 Git 部署 | 需 DB/KV 表結構與 env |
| 123 筆 detail 約 1–3 分鐘，可設 `maxDuration: 300` | 與 `VENDOR_SCALE.md` Phase B 一併規劃較佳 |

**建議表結構（草案）：** `activity_chips (bokun_id, chip_ids jsonb, category_labels jsonb, enriched_at, source_hash?)`

---

### 方案 B — GitHub Actions 定時 commit（改動最小）

1. Workflow：cron 每週（或 `workflow_dispatch` 手動）
2. Secrets：`BOKUN_ACCESS_KEY`、`BOKUN_SECRET_KEY`、`BOKUN_API_HOST`
3. 執行 `npm run enrich:chips` → commit `data/chipIdsCache.json` → push `main`
4. Vercel 自動部署

| 優點 | 缺點 |
|------|------|
| 幾乎不改應用程式 | 每次更新觸發部署 |
| 沿用現有 JSON + `applyChipCache` | 快取更新有數分鐘延遲 |

---

### 方案 C — 請求時懶加載（半自動，不建議單獨依賴）

在 `GET /api/catalog/activities?all=true` 對無快取 id 當場打 detail（限流、上限 N 筆）。

| 優點 | 缺點 |
|------|------|
| 新商品很快有 chip | 全量列表首請求慢、易逾時 |
| | 無持久化則 cold start 重複打 detail |

可作為 A/B 的**補充**，不宜唯一策略。

---

## 建議實作順序

1. **短期（單供應商 ~123 SKU）：** 方案 B — 一個 GitHub Action 即可覆蓋「目錄有更新」。
2. **中期（多供應商 / DB 目錄）：** 方案 A — chip 與 catalog 同存 Supabase，cron 增量 enrich。
3. **可選：** 懶加載只補「快取沒有且規則 chip 為空」的 id，上限 5–10 筆/請求。

---

## 實作檢查清單（給未來 PR）

- [ ] 選定方案 A 或 B（或 B → A 遷移）
- [ ] Cron / Action 排程與 `CRON_SECRET` 文件（`.env.example`、`docs/VERCEL.md`）
- [ ] 增量邏輯：只 enrich `byId` 缺失或 `enrichedAt` 超過 TTL（建議 7d）
- [ ] 監控：上次 run 筆數、無 chip 商品數、錯誤率
- [ ] 文件：更新 `data/README.md`，標記「已自動化」
- [ ] 驗證：選「極光」等 chip 篩選，確認 0 筆誤殺

---

## 相關檔案

| 檔案 | 用途 |
|------|------|
| `lib/chipIds.js` | flatten + deriveChipIds |
| `lib/chipCache.js` | 讀取 JSON 快取 |
| `lib/enrichChipIds.js` | detail enrichment |
| `scripts/enrich-chip-ids.js` | 本機 Bókun |
| `scripts/enrich-chip-ids-from-api.js` | 經部署 API 建快取 |
| `ui_kits/web/components/App.jsx` | 篩選用 `vm.chipIds` |
| `api/translations/cron.js` | 可複製的 cron 授權模式 |

---

## 觸發「需要更新快取」的營運訊號

- Bókun 後台新增/下架行程
- `meta.total` 與 `chipIdsCache.json` 內 id 數量不一致
- 營運回報「選分類後沒有商品」且該商品標題/分類剛改過

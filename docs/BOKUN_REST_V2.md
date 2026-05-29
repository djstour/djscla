# Bókun REST API v2 — 本站唯一整合規範

> **權威來源（開發必讀）：** [api-docs.bokun.dev/rest-v2](https://api-docs.bokun.dev/rest-v2) · [rest-v2.yaml](https://api-docs.bokun.dev/rest-v2.yaml)  
> **程式入口：** `lib/bokunClient.js`（簽名）· `lib/bokunV2.js`（端點）· `lib/bokun.js`（對外 facade）· `lib/bokunV2Catalog.js`（目錄）  
> **Agent 規則：** `.cursor/rules/bokun-rest-v2.mdc`（`alwaysApply`）

## 開發政策（強制）

自本文件生效起，**所有** Bókun 相關功能（新端點、修 bug、重構、文件範例）必須：

1. **先查** [REST v2 OpenAPI](https://api-docs.bokun.dev/rest-v2) — 路徑、query、request/response schema 以官方為準，不得臆測 v1 行為。
2. **只實作** `/restapi/v2.0/*`；HTTP 一律經 `bokunRequest()`，新路由寫在 `lib/bokunV2.js`。
3. **禁止** 恢復或新增 `activity.json`、`checkout.json`、`cart.json` 或任何 v1 `*.json` 呼叫。
4. **結帳** 僅 Hosted shop（`BOKUN_SHOP_URL`），不用 REST cart/checkout submit。
5. **合併前** `rg 'activity\.json|checkout\.json|/restapi/v1'` 應無執行路徑命中（文件說明 v1 已淘汰除外）。

**REST API v1 已自程式庫移除。** 若官方 v2 尚無對應能力，在 PR／issue 註明缺口，勿悄悄加回 v1。

---

## 架構

```
瀏覽器 → /api/* → lib/bokun.js
                    ├─ lib/bokunV2.js → GET/POST /restapi/v2.0/*
                    ├─ lib/bokunV2Catalog.js（Marketplace 合約 → 產品列表）
                    ├─ lib/v2ExperienceToActivity.js（components → normalizeActivity 輸入）
                    └─ lib/mapV2Availability.js（v2 可用性 → 訂位 UI）
結帳 → lib/bokunCheckoutUrl.js（Hosted shop，非 REST cart API）
```

---

## 目錄（取代 v1 search）

| 步驟 | v2 端點 |
|------|---------|
| 1 | `GET /restapi/v2.0/marketplace/contracts/supplier?status=ACCEPTED` |
| 2 | `GET /restapi/v2.0/marketplace/contract/{id}` → `products[]` |
| 3 | `GET /restapi/v2.0/experience/{id}/components?componentType=ALL` |
| 4 | `GET /restapi/v2.0/marketplace/vendor/{supplierId}`（供應商名稱） |

實作：`lib/bokunV2Catalog.js` · `lib/catalog.js`

**額外產品 ID（非合約表上）：** 環境變數 `BOKUN_V2_EXTRA_EXPERIENCE_IDS=123,456`

**合約狀態篩選：** `BOKUN_V2_CONTRACT_STATUS=ACCEPTED`（預設）

---

## 行程詳情

`GET /restapi/v2.0/experience/{id}/components?componentType=ALL`  
→ `v2ExperienceToActivity`（`type`、`cutoff`、`meetingPoint`、`categories` 等）  
→ `enrichActivityCancellationPolicy`（先 `GET /cancellation/policies`；marketplace 供應商政策若不在列表，再 **僅** `GET /activity.json/{id}` 讀 `cancellationPolicy` — 見 `lib/bokunCancellationV1Fallback.js`，可用 `BOKUN_CANCELLATION_V1_FALLBACK=0` 關閉）  
→ `normalizeActivity`  
→ `GET /api/bokun/activity`

快取在 Supabase 的 `bokun_payload` 需 **Admin 詳情同步** 或 `source=bokun` 才會帶齊新欄位。

`lib/catalogQuality.js` 會拒絕舊快取（價格 &lt; `CATALOG_MIN_PLAUSIBLE_USD` 預設 12、缺少 v2 形狀欄位），`GET /api/bokun/activity?source=db` 會自動改打 live Bókun。

---

## 已知缺口（v2 components）

| 能力 | v2 現況 | 本站策略 |
|------|---------|----------|
| 接送站點列表 | `meetingType.pickupPlaceGroupIds` 有，**無**各站名稱 | `pickupInfo.selectionAtHostedCheckout`；詳情「接送」分頁說明；結帳在 **Hosted shop** 選點（`pickupPlaceId`） |
| 列表價格 | components 的 `experiencePriceRules` 常與 Hosted 結帳價不一致（如 758652） | **禁止**以 v1 `activity.json` 驗價。`lib/catalogPriceVerification.js`（僅 v2）：自動稽核寫入 `priceDisplay`（預設 `trusted: false`）；前台僅在 `source: admin`（`POST /api/admin/prices/trust` 人工對照 Bókun 後台）或日後 `v2_availability` 獨立報價時顯示牌價，否則「選擇日期查看價格」 |
| 行程站 HTML | `itinerary[]` 常只有標題 | 完整敘述以 `description` HTML 為準；行程安排分頁為路線概覽 |
| 逐日 slot 價 | availability DTO 無單價 | 由 `experiencePriceRules` + 可用性檢查推算 |
| 取消政策全文 | v2 rate 只有 `cancellationPolicyId`；vendor 政策列表不含 marketplace 供應商政策 | v1 `activity.json/{id}` **僅取** `cancellationPolicy`（預設開啟）；詳情需 **Admin 詳情同步** 或 `source=bokun` 寫入 `bokun_payload` |
| 加購價格 | v2 `extras` 元件無 `price` | v1 `bookableExtras` 補價（`lib/bokunExtrasV1Fallback.js`，`BOKUN_EXTRAS_V1_FALLBACK=0` 關閉）；`extraConfigs` 以 `extra.id` 對應 |
| 票券／Voucher HTML | v2 `customInputFieldValues` 常為空 | v1 `customFields`（`flags: ticket`）→ `ticketInfoHtml`（`lib/bokunCustomFieldsV1Fallback.js`） |
| Combo / 地點 / 季節營業 / 影片 | v2 `combo`、`location`、`seasonalOpeningHours`、`videos` | 詳情 Quick facts + 票券區 + 影片嵌入；接送站點列表仍待 v2 API |

實作：`lib/bokunPickupPlaces.js`（預留 place group 解析）、`lib/catalogQuality.js`、`lib/v2ExperienceToActivity.js`。

---

## 預訂與接送（Hosted）

1. 站內選日期、人數、加購 → `lib/bokunCheckoutUrl.js` 開 `BOKUN_SHOP_URL`。
2. 若 `pickupInfo.selectionAtHostedCheckout === true`，站內**不**顯示上車下拉（與 Bókun widget 一致）；使用者在 Hosted 結帳頁選 `pickupPlaceId`。
3. 若日後 Bókun 提供 v2「依 place group 列出站點」端點，可改為 `fetchPickupPlacesForExperience` 填滿 `pickupInfo.places` 並恢復站內下拉。

---

## 可用性

`GET /restapi/v2.0/availability/{experienceId}?from=yyyy-MM-dd&to=yyyy-MM-dd`  
→ `lib/mapV2Availability.js`  
→ `/api/availability/check` · `/api/availability/month`

註：v2 可用性 DTO **不含** 逐 slot 價格；訂位金額由產品 `pricing.experiencePriceRules`（components）推算。

---

## Checkout 問題

無 v1 `checkout.json/questions`。  
`POST /api/checkout/questions` 讀取 v2 `bookingQuestions` 元件，否則 `inferQuestionsFromActivity`。  
實際付款在 **Hosted Checkout**（`BOKUN_SHOP_URL`）。

---

## 環境變數

| 變數 | 說明 |
|------|------|
| `BOKUN_ACCESS_KEY` / `BOKUN_SECRET_KEY` | API 金鑰 |
| `BOKUN_API_HOST` | `https://api.bokun.io` 或 `https://api.bokuntest.com` |
| `BOKUN_SHOP_URL` | `https://{tenant}.bokun.io`（Hosted 結帳） |
| `BOKUN_CURRENCY` | 報價幣別（預設 USD） |
| `BOKUN_V2_CONTRACT_STATUS` | Marketplace 合約狀態（預設 ACCEPTED） |
| `BOKUN_V2_EXTRA_EXPERIENCE_IDS` | 逗號分隔的額外 experience ID |

---

## v2 全域規則

- 日期時間：UTC 毫秒時間戳；僅日期 `yyyy-MM-dd`
- 金額：**字串**（BigDecimal），勿用 float 當真相
- 簽名：`X-Bokun-Date` + `X-Bokun-AccessKey` + `X-Bokun-Signature`（HMAC-SHA1）
- JSON：容忍缺欄 / null / 新欄；不依賴欄位順序

---

## 效能（重要）

| 請求 | 預期耗時 | 說明 |
|------|----------|------|
| `?page=1&pageSize=24&source=bokun` | 約 10–40s | 只拉**當頁**產品的 components（列表用輕量欄位） |
| `?all=true&source=bokun` | 可能 **數分鐘** | 對每個合約產品各打一次 API；僅適合 **Admin catalog sync**，不適合瀏覽器直接開 |
| `?source=db` | 通常 &lt;1s | sync 完成後日常請用此模式 |

環境變數：`BOKUN_V2_CATALOG_CONCURRENCY=10`（並行數）、`BOKUN_V2_DISCOVERY_CACHE_MS=300000`（合約索引快取 5 分鐘）

## 上線前檢查

1. Marketplace 合約已 ACCEPTED 且 `products[]` 非空  
2. 日常：`/api/catalog/activities?lang=hant&page=1&pageSize=24&source=db`  
3. 首次建庫：Admin → catalog sync（或 `?all=true&source=bokun`，耐心等待）  
4. Admin Health「Bókun v2 marketplace」為 OK  
5. 詳見 [`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md)

---

## 相關文件

- [`BOKUN.md`](./BOKUN.md) — 本機 dev、401 排查  
- [`BOKUN_ARCH_REFERENCE.md`](./BOKUN_ARCH_REFERENCE.md) — Hosted 結帳架構

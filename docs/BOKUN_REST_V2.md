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
→ `v2ExperienceToActivity` → `normalizeActivity`  
→ `GET /api/bokun/activity`

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

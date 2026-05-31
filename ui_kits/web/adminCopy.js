/**
 * Admin console UI copy — hant / hans / en (strict, no cross-locale fallback for zh).
 */
(function () {
  const COPY = {
    brandTitle: { hant: 'DJS Tour · 管理後台', hans: 'DJS Tour · 管理后台', en: 'DJS Tour · Admin' },
    brandShort: { hant: 'DJS Tour · 管理', hans: 'DJS Tour · 管理', en: 'DJS Tour · Admin' },
    phaseFooter: { hant: 'Phase 5 · 營運', hans: 'Phase 5 · 运营', en: 'Phase 5 · ops' },

    navOverview: { hant: '總覽', hans: '总览', en: 'Overview' },
    navVendors: { hant: '供應商', hans: '供应商', en: 'Vendors' },
    navActivities: { hant: '行程', hans: '行程', en: 'Activities' },
    navContent: { hant: '內容', hans: '内容', en: 'Content' },
    navMarketing: { hant: '行銷', hans: '营销', en: 'Marketing' },
    navInquiries: { hant: '詢價', hans: '询价', en: 'Inquiries' },
    navTranslations: { hant: '翻譯', hans: '翻译', en: 'Translations' },
    navHealth: { hant: '健康檢查', hans: '健康检查', en: 'Health' },
    signOut: { hant: '登出', hans: '登出', en: 'Sign out' },
    navMenu: { hant: '開啟選單', hans: '打开菜单', en: 'Open menu' },
    navClose: { hant: '關閉選單', hans: '关闭菜单', en: 'Close menu' },

    loginSub: {
      hant: '目錄控管中心 — 同步、詳情更新、上架／下架。',
      hans: '目录控管中心 — 同步、详情更新、上架／下架。',
      en: 'Catalog control room — sync, detail refresh, activate/deactivate.',
    },
    password: { hant: '密碼', hans: '密码', en: 'Password' },
    signIn: { hant: '登入', hans: '登录', en: 'Sign in' },
    signingIn: { hant: '登入中…', hans: '登录中…', en: 'Signing in…' },
    loginDisabled: {
      hant: '管理後台未啟用 — 請先在環境變數設定 ADMIN_PASSWORD。',
      hans: '管理后台未启用 — 请先在环境变量设置 ADMIN_PASSWORD。',
      en: 'Admin disabled — set ADMIN_PASSWORD in environment first.',
    },
    loginIncorrect: { hant: '密碼錯誤。', hans: '密码错误。', en: 'Incorrect password.' },
    loginFailed: { hant: '登入失敗。', hans: '登录失败。', en: 'Login failed.' },

    loading: { hant: '載入中…', hans: '加载中…', en: 'Loading…' },
    saving: { hant: '儲存中…', hans: '保存中…', en: 'Saving…' },
    save: { hant: '儲存', hans: '保存', en: 'Save' },
    cancel: { hant: '取消', hans: '取消', en: 'Cancel' },
    close: { hant: '關閉', hans: '关闭', en: 'Close' },
    delete: { hant: '刪除', hans: '删除', en: 'Delete' },
    edit: { hant: '編輯', hans: '编辑', en: 'Edit' },
    refresh: { hant: '重新整理', hans: '刷新', en: 'Refresh' },
    add: { hant: '新增', hans: '新增', en: 'Add' },

    statusActive: { hant: '上架中', hans: '上架中', en: 'active' },
    statusInactive: { hant: '已下架', hans: '已下架', en: 'inactive' },
    badgeOk: { hant: '正常', hans: '正常', en: 'ok' },
    badgeWarn: { hant: '注意', hans: '注意', en: 'warn' },
    badgeErr: { hant: '錯誤', hans: '错误', en: 'err' },
    badgeOff: { hant: '未設定', hans: '未设置', en: 'off' },
    badgeMissing: { hant: '缺少', hans: '缺少', en: 'missing' },
    badgeDefault: { hant: '預設', hans: '默认', en: 'default' },

    timeJustNow: { hant: '剛剛', hans: '刚刚', en: 'just now' },
    timeMinAgo: { hant: '{n} 分鐘前', hans: '{n} 分钟前', en: '{n}m ago' },
    timeHourAgo: { hant: '{n} 小時前', hans: '{n} 小时前', en: '{n}h ago' },
    timeDayAgo: { hant: '{n} 天前', hans: '{n} 天前', en: '{n}d ago' },

    overviewTitle: { hant: '總覽', hans: '总览', en: 'Overview' },
    overviewSub: { hant: '上次行程同步：', hans: '上次行程同步：', en: 'Last activity sync:' },
    catalogSyncTitle: { hant: '目錄同步', hans: '目录同步', en: 'Catalog sync' },
    catalogSyncDesc: {
      hant: '從 Bókun 合約通道拉取最新資料至 Supabase。單次最長約 300 秒；詳情較慢，建議批次上限 25、多跑幾次，或勾選「僅詳情同步」。',
      hans: '从 Bókun 合约通道拉取最新数据至 Supabase。单次最长约 300 秒；详情较慢，建议批次上限 25、多跑几次，或勾选「仅详情同步」。',
      en: 'Pull Bókun contract catalog into Supabase (~300s max). Use detail batch 25 and rerun, or detail-only sync.',
    },
    optDeactivateMissing: {
      hant: '下架通道中已不存在的產品',
      hans: '下架通道中已不存在的产品',
      en: 'Deactivate products no longer in channel',
    },
    optForceDetail: { hant: '強制重新抓取詳情（較慢）', hans: '强制重新抓取详情（较慢）', en: 'Force detail re-fetch (slow)' },
    optDetailOnly: { hant: '僅詳情同步（略過通道列表）', hans: '仅详情同步（略过通道列表）', en: 'Detail sync only (skip channel list)' },
    optSyncImages: { hant: '鏡像圖片至 Supabase Storage', hans: '镜像图片至 Supabase Storage', en: 'Mirror images to Supabase Storage' },
    optDetailCap: { hant: '詳情批次上限（建議 25，最高 50）', hans: '详情批次上限（建议 25，最高 50）', en: 'Detail batch cap (25 recommended, max 50)' },
    runCatalogSync: { hant: '執行目錄同步', hans: '执行目录同步', en: 'Run catalog sync' },
    syncing: { hant: '同步中…', hans: '同步中…', en: 'Syncing…' },
    refreshStats: { hant: '重新整理統計', hans: '刷新统计', en: 'Refresh stats' },
    refreshingStats: { hant: '重新整理中…', hans: '刷新中…', en: 'Refreshing…' },
    statsRefreshedAt: { hant: '統計更新於', hans: '统计更新于', en: 'Stats refreshed' },
    refreshStatsFailed: { hant: '無法重新整理統計', hans: '无法刷新统计', en: 'Failed to refresh stats' },
    syncFailed: { hant: '同步失敗', hans: '同步失败', en: 'Sync failed' },
    loadOverviewFailed: { hant: '無法載入總覽', hans: '无法加载总览', en: 'Failed to load overview' },

    catalogSyncProgress: { hant: '目錄同步進行中', hans: '目录同步进行中', en: 'Catalog sync in progress' },
    catalogSyncHint: {
      hant: '已用時 {s} 秒 · 一般約 30–90 秒 · 請保持此分頁開啟',
      hans: '已用时 {s} 秒 · 一般约 30–90 秒 · 请保持此标签页开启',
      en: 'Elapsed {s}s · typical run 30–90s · keep this tab open',
    },
    catalogStep0: { hant: '正在連線 Bókun 合約通道…', hans: '正在连接 Bókun 合约通道…', en: 'Connecting to Bókun contract channel…' },
    catalogStep1: { hant: '正在從通道取得產品列表…', hans: '正在从通道获取产品列表…', en: 'Fetching product list from channel…' },
    catalogStep2: { hant: '正在比對來源雜湊…', hans: '正在比对来源哈希…', en: 'Comparing source hashes…' },
    catalogStep3: { hant: '正在寫入 Supabase 行程…', hans: '正在写入 Supabase 行程…', en: 'Upserting activities into Supabase…' },
    catalogStep4: { hant: '正在更新供應商 ↔ 行程關聯…', hans: '正在更新供应商 ↔ 行程关联…', en: 'Updating vendor ↔ activity links…' },
    catalogStep5: { hant: '正在同步行程詳情（若已啟用）…', hans: '正在同步行程详情（若已启用）…', en: 'Syncing activity details (if enabled)…' },

    metricActiveSite: { hant: '網站上架中', hans: '网站上架中', en: 'Active on site' },
    metricActiveHint: {
      hant: '顯示於 djstour.com · 翻譯同步以此數量為準',
      hans: '显示于 djstour.com · 翻译同步以此数量为准',
      en: 'Shown on djstour.com · translation sync uses this count',
    },
    metricContractRows: { hant: 'Bókun 合約列數', hans: 'Bókun 合约行数', en: 'Bókun contract rows' },
    metricContractHint: {
      hant: '對應 Create booking 總數 · {n} 個上架供應商',
      hans: '对应 Create booking 总数 · {n} 个上架供应商',
      en: 'Matches Create booking total · {n} active vendors',
    },
    metricUniqueTrips: { hant: '不重複行程（通道）', hans: '不重复行程（通道）', en: 'Unique trips (channel)' },
    metricUniqueHint: { hant: '跨供應商去重', hans: '跨供应商去重', en: 'Deduped across all vendors' },
    metricDeactivated: { hant: '已下架', hans: '已下架', en: 'Deactivated' },
    metricDeactivatedHint: {
      hant: '已不在通道 · 資料庫共 {n} 筆',
      hans: '已不在通道 · 数据库共 {n} 笔',
      en: 'No longer in channel · {n} rows in DB',
    },
    metricInquiries: { hant: '詢價', hans: '询价', en: 'Inquiries' },
    metricInquiriesHint: { hant: '共 {total} 筆 · 近 7 日', hans: '共 {total} 笔 · 近 7 日', en: '{total} all-time · last 7d' },
    metricAbandoned: { hant: '未完成結帳', hans: '未完成结账', en: 'Abandoned checkouts' },
    metricAbandonedHint: {
      hant: 'Bókun 代管結帳 · 待跟進 · &gt;1 小時',
      hans: 'Bókun 代管结账 · 待跟进 · &gt;1 小时',
      en: 'Hosted Bókun · open follow-up · &gt;1h',
    },

    vendorBreakdown: { hant: '供應商明細', hans: '供应商明细', en: 'Vendor breakdown' },
    vendorBreakdownSub: {
      hant: '合約欄 = 該供應商在 Bókun 搜尋列數。不重複 = 該供應商去重後行程數。表尾合計應與上方卡片一致。',
      hans: '合约栏 = 该供应商在 Bókun 搜索行数。不重复 = 该供应商去重后行程数。表尾合计应与上方卡片一致。',
      en: 'Contract column = Bókun search rows per supplier. Unique = deduped trips for that supplier. Footer sums should match the cards above.',
    },
    thVendor: { hant: '供應商', hans: '供应商', en: 'Vendor' },
    thBokunId: { hant: 'Bókun ID', hans: 'Bókun ID', en: 'Bókun ID' },
    thContractRows: { hant: '合約列數', hans: '合约行数', en: 'Contract rows' },
    thUniqueTrips: { hant: '不重複行程', hans: '不重复行程', en: 'Unique trips' },
    thLastSync: { hant: '上次同步', hans: '上次同步', en: 'Last sync' },
    thStatus: { hant: '狀態', hans: '状态', en: 'Status' },
    noVendorsSync: {
      hant: '尚無供應商 — 請先執行目錄同步。',
      hans: '尚无供应商 — 请先执行目录同步。',
      en: 'No vendors yet — run catalog sync first.',
    },
    totalListed: { hant: '合計（所列供應商）', hans: '合计（所列供应商）', en: 'Total (listed vendors)' },

    vendorsTitle: { hant: '供應商', hans: '供应商', en: 'Vendors' },
    vendorsSub: {
      hant: '上次目錄同步的快照（唯讀）。',
      hans: '上次目录同步的快照（只读）。',
      en: 'Snapshot from the last catalog sync (read-only).',
    },
    noVendors: { hant: '尚無供應商。', hans: '尚无供应商。', en: 'No vendors yet.' },
    thContracts: { hant: '合約產品數', hans: '合约产品数', en: 'Contracts' },
    thUniqueProducts: { hant: '不重複產品', hans: '不重复产品', en: 'Unique products' },

    activitiesTitle: { hant: '行程', hans: '行程', en: 'Activities' },
    activitiesSub: {
      hant: '管理上架狀態、價格預覽與內容覆寫。搜尋僅比對英文標題。',
      hans: '管理上架状态、价格预览与内容覆写。搜索仅比对英文标题。',
      en: 'Manage active state, price preview, and content overrides. Search matches English titles only.',
    },
    searchPlaceholder: { hant: '以英文標題搜尋…', hans: '以英文标题搜索…', en: 'Search by English title…' },
    activate: { hant: '上架', hans: '上架', en: 'Activate' },
    deactivate: { hant: '下架', hans: '下架', en: 'Deactivate' },
    translateRow: { hant: '翻譯此筆', hans: '翻译此条', en: 'Translate row' },

    contentTitle: { hant: '內容', hans: '内容', en: 'Content' },
    contentSub: {
      hant: '自有文案、供應商檔案與首頁精選區塊。',
      hans: '自有文案、供应商档案与首页精选区块。',
      en: 'Owned copy, vendor profiles, and homepage featured rail.',
    },
    addFeatured: { hant: '新增精選', hans: '新增精选', en: 'Add featured' },
    saveVendor: { hant: '儲存供應商', hans: '保存供应商', en: 'Save vendor' },
    saveFailed: { hant: '儲存失敗', hans: '保存失败', en: 'Save failed' },
    loadFailed: { hant: '載入失敗', hans: '加载失败', en: 'Load failed' },

    marketingTitle: { hant: '行銷', hans: '营销', en: 'Marketing' },
    marketingSub: {
      hant: '首頁精選區下方的集合區塊。可依 chip、路線或手動行程 ID 篩選。',
      hans: '首页精选区下方的集合区块。可依 chip、路线或手动行程 ID 筛选。',
      en: 'Homepage collection rails below the featured section. Filter by chip, route, or manual activity IDs.',
    },
    addCollection: { hant: '新增集合', hans: '新增集合', en: 'Add collection' },
    deleteCollectionConfirm: {
      hant: '確定刪除集合「{slug}」？',
      hans: '确定删除集合「{slug}」？',
      en: 'Delete collection "{slug}"?',
    },
    deleteFailed: { hant: '刪除失敗', hans: '删除失败', en: 'Delete failed' },

    inquiriesTitle: { hant: '詢價', hans: '询价', en: 'Inquiries' },
    inquiriesSub: {
      hant: '表單與 Bókun 代管結帳的詢價紀錄。可標記跟進狀態。',
      hans: '表单与 Bókun 代管结账的询价记录。可标记跟进状态。',
      en: 'Form and hosted-checkout inquiries. Mark follow-up status.',
    },
    saveFollowUp: { hant: '儲存跟進', hans: '保存跟进', en: 'Save follow-up' },

    translationsTitle: { hant: '翻譯', hans: '翻译', en: 'Translations' },
    translationsSub: {
      hant: 'OpenAI 背景同步繁中／簡中覆寫。已掃描上架中的 {n} 個行程。',
      hans: 'OpenAI 背景同步繁中／简中覆写。已扫描上架中的 {n} 个行程。',
      en: 'OpenAI background sync for hant/hans overlays. Scanned {n} active activities.',
    },
    refreshQueue: { hant: '重新整理佇列', hans: '刷新队列', en: 'Refresh queue' },
    runBatch: { hant: '執行批次翻譯', hans: '执行批次翻译', en: 'Run translation batch' },
    translationVerifyPolicy: {
      hant: '繁中與简中須分別核准後才會在對應語系前台上架。請先用「預覽繁中／預覽简中」在完整行程頁核對，再按「核准繁中」或「核准简中」。',
      hans: '繁中与简中须分别核准后才会在对应语系前台上架。请先用「预览繁中／预览简中」在完整行程页核对，再按「核准繁中」或「核准简中」。',
      en: 'TC and SC require separate admin approval before listing. Preview each locale on the full tour page, then approve hant and/or hans.',
    },
    previewTranslationHantBtn: { hant: '預覽繁中', hans: '预览繁中', en: 'Preview TC' },
    previewTranslationHansBtn: { hant: '預覽简中', hans: '预览简中', en: 'Preview SC' },
    previewTranslationHantHint: {
      hant: '在新分頁以完整前台 UI 預覽繁中（須已登入管理後台）',
      hans: '在新分页以完整前台 UI 预览繁中（须已登录管理后台）',
      en: 'Open full tour page in TC preview (admin session required)',
    },
    previewTranslationHansHint: {
      hant: '在新分頁以完整前台 UI 預覽简中（須已登入管理後台）',
      hans: '在新分页以完整前台 UI 预览简中（须已登录管理后台）',
      en: 'Open full tour page in SC preview (admin session required)',
    },
    approveTranslationHantBtn: { hant: '核准繁中', hans: '核准繁中', en: 'Approve TC' },
    approveTranslationHansBtn: { hant: '核准简中', hans: '核准简中', en: 'Approve SC' },
    approveTranslationHantHint: {
      hant: '通过结构检查后核准繁中前台显示',
      hans: '通过结构检查后核准繁中前台显示',
      en: 'Approve Traditional Chinese public listing',
    },
    approveTranslationHansHint: {
      hant: '通过结构检查后核准简中前台显示',
      hans: '通过结构检查后核准简中前台显示',
      en: 'Approve Simplified Chinese public listing',
    },
    translationTrustFailed: {
      hant: '无法核准：翻译未通过自动检查（缺字段、结构不符或片段断裂）',
      hans: '无法核准：翻译未通过自动检查（缺字段、结构不符或片段断裂）',
      en: 'Approval blocked: translation failed automated checks',
    },
    approvalQueueTitle: { hant: '待核准（可快速核准）', hans: '待核准（可快速核准）', en: 'Ready to approve' },
    approvalQueueSub: {
      hant: '自動檢查已通過、尚未前台核准的行程。可勾選後批量核准；長 HTML 有問題者不在此列。',
      hans: '自动检查已通过、尚未前台核准的行程。可勾选后批量核准；长 HTML 有问题者不在此列。',
      en: 'Passes automated checks but not public yet. Batch-approve selected rows; broken HTML stays out of this list.',
    },
    approvalBothLangsOnly: { hant: '只顯示繁中+简中都可核准', hans: '只显示繁中+简中都可核准', en: 'Both locales ready only' },
    batchApproveHantBtn: { hant: '批量核准繁中', hans: '批量核准繁中', en: 'Batch approve TC' },
    batchApproveHansBtn: { hant: '批量核准简中', hans: '批量核准简中', en: 'Batch approve SC' },
    batchApproveSelectAll: { hant: '全選本頁', hans: '全选本页', en: 'Select page' },
    batchApproveClear: { hant: '清除選取', hans: '清除选取', en: 'Clear selection' },
    thApprovalHant: { hant: '繁中', hans: '繁中', en: 'TC' },
    thApprovalHans: { hant: '简中', hans: '简中', en: 'SC' },
    approvalLive: { hant: '已上架', hans: '已上架', en: 'Live' },
    approvalApproved: { hant: '已核准', hans: '已核准', en: 'Approved' },
    approvalReady: { hant: '可核准', hans: '可核准', en: 'Ready' },
    approvalNeedsTranslation: { hant: '待翻譯', hans: '待翻译', en: 'Needs translation' },
    approvalBlocked: { hant: '检查未过', hans: '检查未过', en: 'Checks failed' },
    approvalSummaryApproved: { hant: '已核准', hans: '已核准', en: 'Approved' },
    approvalSummaryReady: { hant: '可核准', hans: '可核准', en: 'Ready' },
    approvalBothReadyShort: { hant: '双语', hans: '双语', en: 'Both' },
    localeTagHant: { hant: '繁', hans: '繁', en: 'TC' },
    localeTagHans: { hant: '简', hans: '简', en: 'SC' },
    approvalReadyCount: {
      hant: '可核准：繁中 {hant} · 简中 {hans} · 双语 {both}',
      hans: '可核准：繁中 {hant} · 简中 {hans} · 双语 {both}',
      en: 'Ready — TC {hant} · SC {hans} · both {both}',
    },
    batchApproveResult: {
      hant: '已核准 {ok} 筆{failed} · 已上線繁中 {liveBefore} → {liveAfter}（+{delta}）',
      hans: '已核准 {ok} 笔{failed} · 已上线繁中 {liveBefore} → {liveAfter}（+{delta}）',
      en: 'Approved {ok}{failed} · live TC {liveBefore} → {liveAfter} (+{delta})',
    },
    batchApproveResultHans: {
      hant: '已核准 {ok} 筆{failed} · 已上線简中 {liveBefore} → {liveAfter}（+{delta}）',
      hans: '已核准 {ok} 笔{failed} · 已上线简中 {liveBefore} → {liveAfter}（+{delta}）',
      en: 'Approved {ok}{failed} · live SC {liveBefore} → {liveAfter} (+{delta})',
    },
    batchApproveAllReadyHant: { hant: '核准全部可核准繁中', hans: '核准全部可核准繁中', en: 'Approve all ready TC' },
    batchApproveAllReadyHans: { hant: '核准全部可核准简中', hans: '核准全部可核准简中', en: 'Approve all ready SC' },
    approvalVerifyHint: {
      hant: '批量核准後，請看上方「Approved」數字是否增加；若 Ready 不減少，可能是稽核未通過（滑鼠移到 TC Ready 看原因）或需先勾選列再按批量按鈕。',
      hans: '批量核准后，请看上方「Approved」数字是否增加；若 Ready 不减少，可能是稽核未通过（鼠标移到 TC Ready 看原因）或需先勾选行再按批量按钮。',
      en: 'After batch approve, confirm the Approved counts above increase. If Ready stays high, hover TC Ready for audit failures — or use Approve all ready (no checkbox needed).',
    },
    translateOne: { hant: '翻譯此行程', hans: '翻译此行程', en: 'Translate activity' },

    translationBatchProgress: { hant: '批次翻譯進行中', hans: '批次翻译进行中', en: 'Translation batch in progress' },
    healthTitle: { hant: '健康檢查', hans: '健康检查', en: 'Health' },
    healthSub: {
      hant: '即時探測與此部署的環境變數狀態。',
      hans: '即时探测与此部署的环境变量状态。',
      en: 'Live probes + environment flags for this deployment.',
    },
    envVarsTitle: { hant: '環境變數', hans: '环境变量', en: 'Environment variables' },
    envVarsSub: {
      hant: '僅顯示是否已設定 — 不會回傳實際值。',
      hans: '仅显示是否已设置 — 不会返回实际值。',
      en: 'Presence only — values are never returned.',
    },
    healthOverall: { hant: '整體狀態', hans: '整体状态', en: 'Overall' },
    healthHealthy: { hant: '正常', hans: '正常', en: 'healthy' },
    healthDegraded: { hant: '降級', hans: '降级', en: 'degraded' },
    healthUnhealthy: { hant: '異常', hans: '异常', en: 'unhealthy' },
    healthTranslationLoading: {
      hant: '翻譯統計載入中…',
      hans: '翻译统计加载中…',
      en: 'Loading translation stats…',
    },
    healthTranslationSummary: {
      hant: '翻譯佇列 {queue} · {pct}% 欄位覆蓋',
      hans: '翻译队列 {queue} · {pct}% 字段覆盖',
      en: 'Translation queue {queue} · {pct}% field coverage',
    },
    healthTranslationError: {
      hant: '翻譯統計無法載入：{msg}',
      hans: '翻译统计无法加载：{msg}',
      en: 'Translation stats unavailable: {msg}',
    },
    healthHeavyLoading: {
      hant: '正在掃描 catalog 品質與翻譯覆蓋…',
      hans: '正在扫描 catalog 质量与翻译覆盖…',
      en: 'Scanning catalog quality and translation coverage…',
    },
    healthCatalogIssuesTitle: {
      hant: '需處理的行程',
      hans: '需处理的行程',
      en: 'Activities to review',
    },
    healthUntrustedPriceHint: {
      hant: '下列產品 v2 catalog 牌價未通過自動稽核（過低、疑似佣金或誤標幣別），前台不顯示牌價。通過稽核的產品無需人工處理。重新執行詳情同步可更新 priceDisplay。',
      hans: '下列产品 v2 catalog 牌价未通过自动稽核（过低、疑似佣金或误标币种），前台不显示牌价。通过稽核的产品无需人工处理。',
      en: 'These products failed automated v2 catalog price checks (too low, commission-like, or mislabeled). Trusted products need no manual action.',
    },
    healthVerifyPricesBtn: { hant: '重新稽核（v2）', hans: '重新稽核（v2）', en: 'Re-audit (v2)' },
    healthTrustPricesBtn: { hant: '核准前台牌價', hans: '核准前台牌价', en: 'Approve display price' },
    healthRevokePricesBtn: { hant: '撤回核准', hans: '撤回核准', en: 'Revoke approval' },
    healthColRefUsd: { hant: '核准來源', hans: '核准来源', en: 'Trust source' },
    healthColReason: { hant: '原因', hans: '原因', en: 'Reason' },
    healthImplausiblePriceHint: {
      hant: '快取展示價低於 USD {min}（多為 tour 防呆門檻）。景點門票（ATTRACTION）低於 {min} 視為正常；其餘請在 Bókun 核對後按「核准前台牌價」，或於 Activities 觸發詳情同步。',
      hans: '缓存展示价低于 USD {min}（多为 tour 防呆门槛）。景点门票（ATTRACTION）低于 {min} 视为正常；其余请在 Bókun 核对后按「核准前台牌价」，或在 Activities 触发详情同步。',
      en: 'Cached display price is below USD {min} (tour sanity floor). ATTRACTION tickets below {min} are expected — verify others in Bókun, then Approve display price or run a detail sync from Activities.',
    },
    healthMissingV2Hint: {
      hant: '尚未完成詳情同步，或快取缺少 v2 詳情欄位。通道同步每次最多處理「詳情批次上限」筆；請多跑幾次並勾選強制詳情，或提高批次上限（建議 80–120）。',
      hans: '尚未完成详情同步，或缓存缺少 v2 详情字段。通道同步每次最多处理「详情批次上限」笔；请多跑几次并勾选强制详情，或提高批次上限（建议 80–120）。',
      en: 'Detail sync not done yet, or cache lacks v2 detail fields. Each catalog run only processes up to “detail batch limit” — rerun with force detail and/or raise the limit (try 80–120).',
    },
    syncDetailPendingHint: {
      hant: '尚有 {pending} 筆待詳情同步（本輪已處理 {queued} / 共需 {total}）',
      hans: '尚有 {pending} 笔待详情同步（本轮已处理 {queued} / 共需 {total}）',
      en: '{pending} still need detail sync ({queued} processed this run of {total})',
    },
    syncDetailCatalog: {
      hant: '詳情進度（全庫）',
      hans: '详情进度（全库）',
      en: 'Detail progress (catalog)',
    },
    syncDetailCatalogErr: {
      hant: '詳情進度（全庫 · 本輪 {n} 錯）',
      hans: '详情进度（全库 · 本轮 {n} 错）',
      en: 'Detail progress (catalog · {n} err. this run)',
    },
    syncDetailCatalogHint: {
      hant: '本輪成功 {run} 筆 · 全庫尚缺 {missing} 筆',
      hans: '本轮成功 {run} 笔 · 全库尚缺 {missing} 笔',
      en: '+{run} this run · {missing} still missing catalog-wide',
    },
    syncDetailCatalogHintErr: {
      hant: '本輪成功 {run} 筆、{errors} 筆錯誤 · 全庫尚缺 {missing} 筆',
      hans: '本轮成功 {run} 笔、{errors} 笔错误 · 全库尚缺 {missing} 笔',
      en: '+{run} this run, {errors} error(s) · {missing} still missing catalog-wide',
    },
    syncDetailCatalogComplete: {
      hant: '全庫詳情已齊',
      hans: '全库详情已齐',
      en: 'All catalog details complete',
    },
    syncDetailThisRun: {
      hant: '本輪 queue',
      hans: '本轮 queue',
      en: 'This run queue',
    },
    syncDetailRunQueueHint: {
      hant: '本輪排程 {queued} / 共 {total}（含 force detail 時分母固定）',
      hans: '本轮排程 {queued} / 共 {total}（含 force detail 时分母固定）',
      en: 'Queued {queued} of {total} this run (force detail keeps run total high)',
    },
    healthPickupHostedNote: {
      hant: '「僅 Hosted 結帳選接送點」為 Bókun v2 常態（共 {n} 筆），通常無需修復。',
      hans: '「仅 Hosted 结账选接送点」为 Bókun v2 常态（共 {n} 笔），通常无需修复。',
      en: '"Hosted pick-up only" is expected for Bókun v2 ({n} activities) — usually no fix needed.',
    },
    healthColActivityId: { hant: 'Bókun ID', hans: 'Bókun ID', en: 'Bókun ID' },
    healthColTitle: { hant: '標題', hans: '标题', en: 'Title' },
    healthColMaxUsd: { hant: '最高 USD', hans: '最高 USD', en: 'Max USD' },
    healthViewTour: { hant: '前台', hans: '前台', en: 'View' },
    healthCopyId: { hant: '複製 ID', hans: '复制 ID', en: 'Copy ID' },

    langHant: { hant: '繁中', hans: '繁中', en: 'Traditional Chinese' },
    langHans: { hant: '簡中', hans: '简中', en: 'Simplified Chinese' },
    langEn: { hant: '英文', hans: '英文', en: 'English' },
    working: { hant: '處理中', hans: '处理中', en: 'Working' },

    syncComplete: { hant: '同步完成', hans: '同步完成', en: 'Sync complete' },
    syncThisRun: { hant: '本次同步', hans: '本次同步', en: 'This sync run' },
    syncVendorsFinished: {
      hant: '{n} 個供應商 · 耗時 {dur}',
      hans: '{n} 个供应商 · 耗时 {dur}',
      en: '{n} vendor(s) · finished in {dur}',
    },
    syncGroupChannel: { hant: '通道（來源）', hans: '通道（来源）', en: 'Channel (source)' },
    syncGroupWrites: { hant: '寫入', hans: '写入', en: 'Writes' },
    syncGroupMaintenance: { hant: '維護', hans: '维护', en: 'Maintenance' },
    syncUniqueChannel: { hant: '通道不重複', hans: '通道不重复', en: 'Unique in channel' },
    syncContractProducts: { hant: '合約產品', hans: '合约产品', en: 'Contract products' },
    syncUpserted: { hant: '已更新', hans: '已更新', en: 'Upserted' },
    syncUnchanged: { hant: '未變更', hans: '未变更', en: 'Unchanged' },
    syncDeactivated: { hant: '已下架', hans: '已下架', en: 'Deactivated' },
    syncVendorLinks: { hant: '供應商關聯', hans: '供应商关联', en: 'Vendor links' },
    syncImagesMirrored: { hant: '圖片已鏡像', hans: '图片已镜像', en: 'Images mirrored' },
    syncDetailSynced: { hant: '詳情已同步', hans: '详情已同步', en: 'Detail synced' },
    syncDetailSyncedErr: { hant: '詳情已同步（{n} 錯）', hans: '详情已同步（{n} 错）', en: 'Detail synced ({n} err.)' },
    syncTimingFetch: { hant: 'Bókun 抓取', hans: 'Bókun 抓取', en: 'Bókun fetch' },
    syncTimingWrite: { hant: '處理與寫入', hans: '处理与写入', en: 'Process & persist' },
    syncChipUpserted: { hant: '{n} 筆已更新', hans: '{n} 笔已更新', en: '{n} upserted' },
    syncChipUnchanged: { hant: '{n} 筆未變', hans: '{n} 笔未变', en: '{n} unchanged' },
    syncChipDeactivated: { hant: '{n} 筆已下架', hans: '{n} 笔已下架', en: '{n} deactivated' },
    syncChipFetchFailed: {
      hant: '{n} 筆元件抓取失敗（仍留在合約，未下架）',
      hans: '{n} 笔元件抓取失败（仍在合约，未下架）',
      en: '{n} component fetch failed (still on contract)',
    },
    syncComponentsFailed: { hant: '元件抓取失敗', hans: '元件抓取失败', en: 'Component fetch failed' },
    syncChipImages: { hant: '{n} 張圖已鏡像', hans: '{n} 张图已镜像', en: '{n} images mirrored' },
    syncChipDetailTruncated: {
      hant: '詳情因時間上限提前結束，請再跑一次',
      hans: '详情因时间上限提前结束，请再跑一次',
      en: 'Detail sync stopped early (time limit) — run again',
    },
    syncChipDetailErr: { hant: '{n} 筆詳情錯誤', hans: '{n} 笔详情错误', en: '{n} detail error(s)' },
    syncChipPriceWarn: {
      hant: '{n} 筆價格異常',
      hans: '{n} 笔价格异常',
      en: '{n} implausible price(s)',
    },
    syncChipPickupHosted: {
      hant: '{n} 筆接送僅結帳選點',
      hans: '{n} 笔接送仅结账选点',
      en: '{n} pick-up at hosted checkout',
    },
    syncDetailPriceWarnings: {
      hant: '詳情價格警示',
      hans: '详情价格警示',
      en: 'Detail price warnings',
    },
    syncDetailPickupHosted: {
      hant: '接送（結帳選點）',
      hans: '接送（结账选点）',
      en: 'Pick-up (hosted checkout)',
    },
    syncChipVendorLinks: {
      hant: '供應商關聯：+{add} / −{rem}',
      hans: '供应商关联：+{add} / −{rem}',
      en: 'Vendor links: +{add} added, −{rem} removed',
    },
    syncChipUpToDate: { hant: '目錄已是最新', hans: '目录已是最新', en: 'Catalog already up to date' },
    syncLinkHint: { hant: '+{add} 新增 · −{rem} 移除', hans: '+{add} 新增 · −{rem} 移除', en: '+{add} new · −{rem} removed' },

    explainerTitle: { hant: '數字如何對應', hans: '数字如何对应', en: 'How the numbers relate' },
    explainerBody: {
      hant: '{contract} 合約產品 = 各供應商 Bókun 搜尋列加總（同一行程可能出現在多個供應商）。{unique} 不重複 = 通道去重行程。{active} 網站上架 = 行程頁與翻譯腳本使用（{inactive} 已下架 / 共 {total} 筆）。',
      hans: '{contract} 合约产品 = 各供应商 Bókun 搜索行加总（同一行程可能出现在多个供应商）。{unique} 不重复 = 通道去重行程。{active} 网站上架 = 行程页与翻译脚本使用（{inactive} 已下架 / 共 {total} 笔）。',
      en: '{contract} contract products = Bókun search rows per vendor summed. {unique} unique = deduped channel trips. {active} active on site = Tours & translations ({inactive} deactivated of {total} in DB).',
    },
    explainerFoot: {
      hant: '側欄使用 {active} 個上架供應商{hidden}。',
      hans: '侧栏使用 {active} 个上架供应商{hidden}。',
      en: 'Sidebar uses {active} active vendor(s){hidden}.',
    },
    explainerHidden: {
      hant: '（另有 {n} 個未上架不計入合計）',
      hans: '（另有 {n} 个未上架不计入合计）',
      en: ' ({n} inactive hidden from totals)',
    },

    thTitle: { hant: '標題', hans: '标题', en: 'Title' },
    thActions: { hant: '操作', hans: '操作', en: 'Actions' },
    thPriceFrom: { hant: '起價', hans: '起价', en: 'Price from' },
    thContractPricing: {
      hant: '合約價格（B2B）',
      hans: '合约价格（B2B）',
      en: 'Contract pricing (B2B)',
    },
    pricingListLabel: { hant: '牌價', hans: '牌价', en: 'List' },
    pricingCommissionLabel: { hant: '佣金', hans: '佣金', en: 'Commission' },
    pricingCostLabel: { hant: '估算成本', hans: '估算成本', en: 'Est. cost' },
    pricingLoading: { hant: '讀取合約價…', hans: '读取合约价…', en: 'Loading contract…' },
    pricingUnavailable: { hant: '無法取得', hans: '无法取得', en: 'Unavailable' },
    pricingNoContract: { hant: '無 Marketplace 合約', hans: '无 Marketplace 合约', en: 'No marketplace contract' },
    pricingHint: {
      hant: '牌價為合約價目表售價；成本 ≈ 牌價 × (1 − 佣金%)',
      hans: '牌价为合约价目表售价；成本 ≈ 牌价 × (1 − 佣金%)',
      en: 'List = contract catalog sell price; cost ≈ list × (1 − commission%).',
    },
    thRank: { hant: '排序', hans: '排序', en: 'Rank' },
    thOrder: { hant: '順序', hans: '顺序', en: 'Order' },
    thSlug: { hant: 'Slug', hans: 'Slug', en: 'Slug' },
    thFilter: { hant: '篩選', hans: '筛选', en: 'Filter' },
    thCreated: { hant: '建立時間', hans: '创建时间', en: 'Created' },
    thContact: { hant: '聯絡人', hans: '联系人', en: 'Contact' },
    thItems: { hant: '項目', hans: '项目', en: 'Items' },
    thHostedUrl: { hant: '代管結帳連結', hans: '代管结账链接', en: 'Hosted URL' },
    thCoverage: { hant: '覆蓋率', hans: '覆盖率', en: 'Coverage' },
    thMissing: { hant: '缺少', hans: '缺少', en: 'Missing' },
    thStale: { hant: '過期', hans: '过期', en: 'Stale' },

    filterAllStatuses: { hant: '全部狀態', hans: '全部状态', en: 'All statuses' },
    filterActiveOnly: { hant: '僅上架', hans: '仅上架', en: 'Active' },
    filterInactiveOnly: { hant: '僅下架', hans: '仅下架', en: 'Inactive' },
    filterAllVendors: { hant: '全部供應商', hans: '全部供应商', en: 'All vendors' },
    activitiesMatching: { hant: '符合 {n} 筆', hans: '符合 {n} 笔', en: '{n} matching rows' },
    noActivitiesMatch: { hant: '沒有符合的行程', hans: '没有符合的行程', en: 'No activities match.' },
    resyncDetail: { hant: '重抓詳情', hans: '重抓详情', en: 'Re-sync detail' },
    viewSite: { hant: '檢視網站', hans: '查看网站', en: 'View site' },
    contentBtn: { hant: '內容', hans: '内容', en: 'Content' },
    pagePrev: { hant: '上一頁', hans: '上一页', en: 'Prev' },
    pageNext: { hant: '下一頁', hans: '下一页', en: 'Next' },
    pageOf: { hant: '第 {page} / {total} 頁', hans: '第 {page} / {total} 页', en: 'Page {page} / {total}' },

    featuredSection: { hant: '首頁精選', hans: '首页精选', en: 'Homepage featured' },
    featuredDesc: {
      hant: '顯示於 djstour.com；若無精選則顯示前六個行程。',
      hans: '显示于 djstour.com；若无精选则显示前六个行程。',
      en: 'Shown on djstour.com when featured; otherwise first six tours.',
    },
    featuredIdPlaceholder: { hant: 'Bókun 行程 ID…', hans: 'Bókun 行程 ID…', en: 'Bókun activity ID to feature…' },
    noFeatured: { hant: '尚無精選行程', hans: '尚无精选行程', en: 'No featured activities yet.' },
    remove: { hant: '移除', hans: '移除', en: 'Remove' },
    vendorProfile: { hant: '供應商檔案', hans: '供应商档案', en: 'Vendor profile' },
    selectVendor: { hant: '選擇供應商…', hans: '选择供应商…', en: 'Select vendor…' },
    vendorSaved: { hant: '供應商檔案已儲存', hans: '供应商档案已保存', en: 'Vendor profile saved.' },

    newCollection: { hant: '新增集合', hans: '新增集合', en: 'New collection' },
    editCollection: { hant: '編輯集合', hans: '编辑集合', en: 'Edit collection' },
    noCollections: {
      hant: '尚無集合 — 新增後才會顯示首頁區塊',
      hans: '尚无集合 — 新增后才会显示首页区块',
      en: 'No collections yet — add one to show homepage rails.',
    },
    collectionSaved: { hant: '集合已儲存', hans: '集合已保存', en: 'Collection saved.' },
    badgeOn: { hant: '開', hans: '开', en: 'on' },
    badgeOffShort: { hant: '關', hans: '关', en: 'off' },

    inquiriesMatching: {
      hant: '符合 {n} 筆 · 代辦詢價與代管結帳',
      hans: '符合 {n} 笔 · 代办询价与代管结账',
      en: '{n} matching · concierge leads + hosted-checkout redirects.',
    },
    abandonedCartsOnly: { hant: '僅未完成結帳', hans: '仅未完成结账', en: 'Abandoned carts only' },
    noInquiries: { hant: '尚無詢價', hans: '尚无询价', en: 'No inquiries yet.' },
    savedOk: { hant: '已儲存', hans: '已保存', en: 'Saved.' },

    fieldCoverage: { hant: '欄位覆蓋', hans: '字段覆盖', en: 'Field coverage' },
    queueDepthLabel: { hant: '佇列深度', hans: '队列深度', en: 'Queue depth' },
    queueDepthHint: { hant: '待翻譯行程數', hans: '待翻译行程数', en: 'activities need translation work' },
    fullyTranslated: { hant: '已完成', hans: '已完成', en: 'Fully translated' },
    cronEstimate: { hant: '排程預估', hans: '排程预估', en: 'Cron estimate' },
    runTranslationBatch: { hant: '執行翻譯批次', hans: '执行翻译批次', en: 'Run translation batch' },
    runTranslationBatchDesc: {
      hant: '與 Vercel cron 相同 — 每批最多 N 個行程（標題、摘要、說明、站點）。',
      hans: '与 Vercel cron 相同 — 每批最多 N 个行程（标题、摘要、说明、站点）。',
      en: 'Same worker as Vercel cron — translates up to N activities per run.',
    },
    batchSize: { hant: '批次大小', hans: '批次大小', en: 'Batch size' },
    translating: { hant: '翻譯中…', hans: '翻译中…', en: 'Translating…' },
    runBatchNow: { hant: '立即執行批次', hans: '立即执行批次', en: 'Run batch now' },
    pendingQueue: { hant: '待處理佇列', hans: '待处理队列', en: 'Pending queue' },
    scanningCatalog: { hant: '掃描目錄中…', hans: '扫描目录中…', en: 'Scanning catalog…' },
    queueEmpty: {
      hant: '佇列為空 — 已掃描行程皆為最新',
      hans: '队列为空 — 已扫描行程皆为最新',
      en: 'Queue empty — all scanned activities are up to date.',
    },
    translateBtn: { hant: '翻譯', hans: '翻译', en: 'Translate' },

    checking: { hant: '檢查中…', hans: '检查中…', en: 'Checking…' },
    rerunChecks: { hant: '重新檢查', hans: '重新检查', en: 'Re-run checks' },
    lastRun: { hant: '上次執行', hans: '上次执行', en: 'Last run' },
    envSet: { hant: '已設定', hans: '已设置', en: 'set' },
    envMissing: { hant: '缺少', hans: '缺少', en: 'missing' },
    loadActivitiesFailed: {
      hant: '無法載入行程',
      hans: '无法加载行程',
      en: 'Failed to load activities',
    },
    loadInquiriesFailed: {
      hant: '無法載入詢價',
      hans: '无法加载询价',
      en: 'Failed to load inquiries',
    },
    loadCollectionsFailed: {
      hant: '無法載入集合',
      hans: '无法加载集合',
      en: 'Failed to load collections',
    },
    loadQueueFailed: {
      hant: '無法載入佇列',
      hans: '无法加载队列',
      en: 'Failed to load queue',
    },
    healthCheckFailed: {
      hant: '健康檢查失敗',
      hans: '健康检查失败',
      en: 'Health check failed',
    },
    actionFailed: { hant: '操作失敗', hans: '操作失败', en: 'Action failed' },
    batchFailed: { hant: '批次失敗', hans: '批次失败', en: 'Batch failed' },
  };

  const CATALOG_STEPS = [
    'catalogStep0', 'catalogStep1', 'catalogStep2', 'catalogStep3', 'catalogStep4', 'catalogStep5',
  ];

  function pick(lang, key) {
    const entry = COPY[key];
    if (!entry) return '';
    if (entry[lang] != null && entry[lang] !== '') return entry[lang];
    if (lang === 'en') return entry.en || '';
    return '';
  }

  function format(key, lang, vars) {
    let s = pick(lang, key);
    if (vars && typeof vars === 'object') {
      Object.keys(vars).forEach((k) => {
        s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(vars[k]));
      });
    }
    return s;
  }

  function createT(lang) {
    return function t(key, vars) {
      return format(key, lang, vars);
    };
  }

  function catalogSteps(lang) {
    return CATALOG_STEPS.map((k) => pick(lang, k));
  }

  function timeAgo(iso, lang) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return '';
    const diff = Date.now() - t;
    if (diff < 0) return '';
    const m = Math.floor(diff / 60000);
    if (m < 1) return pick(lang, 'timeJustNow');
    if (m < 60) return format('timeMinAgo', lang, { n: m });
    const h = Math.floor(m / 60);
    if (h < 24) return format('timeHourAgo', lang, { n: h });
    const d = Math.floor(h / 24);
    return format('timeDayAgo', lang, { n: d });
  }

  window.AuralisAdminCopy = {
    COPY,
    createT,
    catalogSteps,
    timeAgo,
    pick,
  };
})();

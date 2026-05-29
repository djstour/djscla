/**
 * Admin health probes — live checks + env flags (Phase 5).
 */

const { discoverContractProducts } = require('./bokunV2Catalog');
const { supabaseRestFetch, getSupabaseConfig } = require('./supabase');
const { scanTranslationQueue } = require('./translationQueue');
const { auditActivityPayload, MIN_PLAUSIBLE_DISPLAY_PRICE } = require('./catalogQuality');

function envHealth() {
  function flag(key) {
    const v = process.env[key];
    return { set: !!(v && String(v).trim()), key };
  }
  return {
    bokun: {
      accessKey: flag('BOKUN_ACCESS_KEY').set,
      secretKey: flag('BOKUN_SECRET_KEY').set,
      apiHost: process.env.BOKUN_API_HOST || null,
      shopUrl: process.env.BOKUN_SHOP_URL || null,
    },
    supabase: {
      url: !!(process.env.SUPABASE_URL || '').trim(),
      anonKey: !!(process.env.SUPABASE_ANON_KEY || '').trim(),
      serviceKey: !!(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
    },
    openai: {
      apiKey: flag('OPENAI_API_KEY').set,
      model: process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4o-mini',
    },
    cron: {
      cronSecret: !!(process.env.CRON_SECRET || '').trim(),
      catalogSyncSecret: !!(process.env.CATALOG_SYNC_SECRET || '').trim(),
      translationSyncSecret: !!(process.env.TRANSLATION_SYNC_SECRET || '').trim(),
    },
    catalog: {
      source: process.env.CATALOG_SOURCE || 'db',
    },
    admin: {
      password: !!(process.env.ADMIN_PASSWORD || '').trim(),
    },
  };
}

async function probeSupabase() {
  const started = Date.now();
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    return {
      id: 'supabase',
      label: 'Supabase REST',
      status: 'fail',
      latencyMs: 0,
      message: 'SUPABASE_URL or service key not configured',
    };
  }
  try {
    await supabaseRestFetch('/rest/v1/vendors?select=id&limit=1');
    return {
      id: 'supabase',
      label: 'Supabase REST',
      status: 'ok',
      latencyMs: Date.now() - started,
      message: 'Connected',
    };
  } catch (err) {
    return {
      id: 'supabase',
      label: 'Supabase REST',
      status: 'fail',
      latencyMs: Date.now() - started,
      message: err.message,
    };
  }
}

async function probeBokun() {
  const started = Date.now();
  if (!process.env.BOKUN_ACCESS_KEY || !process.env.BOKUN_SECRET_KEY) {
    return {
      id: 'bokun',
      label: 'Bókun v2 marketplace',
      status: 'fail',
      latencyMs: 0,
      message: 'BOKUN_ACCESS_KEY or BOKUN_SECRET_KEY missing',
    };
  }
  try {
    const products = await discoverContractProducts();
    const contracts = new Set(products.map((p) => p.contractId).filter(Boolean));
    return {
      id: 'bokun',
      label: 'Bókun v2 marketplace',
      status: 'ok',
      latencyMs: Date.now() - started,
      message: `OK · ${contracts.size} contracts · ${products.length} experiences`,
    };
  } catch (err) {
    return {
      id: 'bokun',
      label: 'Bókun v2 marketplace',
      status: 'fail',
      latencyMs: Date.now() - started,
      message: err.message,
    };
  }
}

function probeOpenAIConfig() {
  const set = !!(process.env.OPENAI_API_KEY || '').trim();
  return {
    id: 'openai',
    label: 'OpenAI (translation)',
    status: set ? 'ok' : 'fail',
    latencyMs: 0,
    message: set
      ? `API key set · model ${process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4o-mini'}`
      : 'OPENAI_API_KEY missing',
  };
}

function activityTitleFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return String(payload.title || payload.name || '').trim();
}

async function probeCatalogPayloadQuality() {
  const started = Date.now();
  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    return {
      id: 'catalog-quality',
      label: 'Catalog payload quality',
      status: 'warn',
      latencyMs: 0,
      message: 'Supabase not configured',
    };
  }
  try {
    const pageSize = 100;
    const maxScan = Math.min(
      Math.max(Number(process.env.CATALOG_HEALTH_MAX_SCAN) || 500, 80),
      2000,
    );
    let scanned = 0;
    let pickupHostedOnly = 0;
    const priceImplausibleActivities = [];
    const priceUntrustedActivities = [];
    const missingV2Activities = [];

    for (let offset = 0; offset < maxScan; offset += pageSize) {
      const params = new URLSearchParams({
        select: 'bokun_activity_id,bokun_payload,detail_synced_at',
        is_active: 'eq.true',
        limit: String(pageSize),
        offset: String(offset),
      });
      const rows = await supabaseRestFetch(`/rest/v1/activities?${params}`);
      if (!rows || !rows.length) break;
      scanned += rows.length;
      rows.forEach((row) => {
        const payload = row.bokun_payload || {};
        const audit = auditActivityPayload(payload, { detailSyncedAt: row.detail_synced_at });
        const id = String(row.bokun_activity_id);
        const title = activityTitleFromPayload(payload);
        if (audit.priceImplausible) {
          priceImplausibleActivities.push({
            id,
            title,
            maxDisplayUsd: audit.maxDisplayUsd,
          });
        }
        if (audit.priceUntrusted) {
          priceUntrustedActivities.push({
            id,
            title,
            maxDisplayUsd: audit.maxDisplayUsd,
            source: payload.priceDisplay?.source || null,
            reason: audit.priceVerifyReason,
            message: payload.priceDisplay?.message || null,
          });
        }
        if (audit.missingV2Detail) {
          missingV2Activities.push({
            id,
            title,
            detailSyncedAt: row.detail_synced_at || null,
            neverSynced: !!audit.detailNeverSynced,
            thinPayload: !!audit.detailSyncedThin,
          });
        }
        if (audit.pickupHostedOnly) pickupHostedOnly += 1;
      });
      if (rows.length < pageSize) break;
    }

    const priceImplausible = priceImplausibleActivities.length;
    const priceUntrusted = priceUntrustedActivities.length;
    const missingV2 = missingV2Activities.length;
    const status = priceImplausible > 0 || priceUntrusted > 0 || missingV2 > 0 ? 'warn' : 'ok';
    const parts = [`scanned ${scanned} active`];
    if (priceImplausible) parts.push(`${priceImplausible} implausible price`);
    if (priceUntrusted) parts.push(`${priceUntrusted} price not verified`);
    if (pickupHostedOnly) parts.push(`${pickupHostedOnly} hosted pick-up only`);
    if (missingV2) parts.push(`${missingV2} missing v2 detail shape`);
    if (!priceImplausible && !missingV2 && scanned > 0) {
      parts.push('prices OK');
    }
    return {
      id: 'catalog-quality',
      label: 'Catalog payload quality',
      status: scanned ? status : 'warn',
      latencyMs: Date.now() - started,
      message: parts.join(' · '),
      priceImplausible,
      priceUntrusted,
      pickupHostedOnly,
      missingV2Detail: missingV2,
      scanned,
      minPlausibleUsd: MIN_PLAUSIBLE_DISPLAY_PRICE,
      issues: {
        priceImplausible: priceImplausibleActivities,
        priceUntrusted: priceUntrustedActivities,
        missingV2Detail: missingV2Activities,
      },
    };
  } catch (err) {
    return {
      id: 'catalog-quality',
      label: 'Catalog payload quality',
      status: 'fail',
      latencyMs: Date.now() - started,
      message: err.message,
    };
  }
}

async function probeCatalogFreshness() {
  const started = Date.now();
  try {
    const params = new URLSearchParams({
      select: 'last_synced_at',
      order: 'last_synced_at.desc.nullslast',
      limit: '1',
    });
    const rows = await supabaseRestFetch(`/rest/v1/activities?${params}`);
    const last = rows && rows[0] ? rows[0].last_synced_at : null;
    if (!last) {
      return {
        id: 'catalog',
        label: 'Catalog sync freshness',
        status: 'warn',
        latencyMs: Date.now() - started,
        message: 'No last_synced_at on activities',
      };
    }
    const ageMs = Date.now() - new Date(last).getTime();
    const ageHours = Math.round(ageMs / 3600000);
    const status = ageHours > 48 ? 'warn' : 'ok';
    return {
      id: 'catalog',
      label: 'Catalog sync freshness',
      status,
      latencyMs: Date.now() - started,
      message: `Last sync ${ageHours}h ago · ${last}`,
      lastSyncedAt: last,
    };
  } catch (err) {
    return {
      id: 'catalog',
      label: 'Catalog sync freshness',
      status: 'fail',
      latencyMs: Date.now() - started,
      message: err.message,
    };
  }
}

function probeCronConfig() {
  const cron = !!(process.env.CRON_SECRET || '').trim();
  const translation = !!(process.env.TRANSLATION_SYNC_SECRET || '').trim();
  const ok = cron || translation;
  return {
    id: 'translation-cron',
    label: 'Translation cron auth',
    status: ok ? 'ok' : 'warn',
    latencyMs: 0,
    message: ok
      ? `CRON_SECRET ${cron ? 'set' : '—'} · TRANSLATION_SYNC_SECRET ${translation ? 'set' : '—'}`
      : 'Set CRON_SECRET or TRANSLATION_SYNC_SECRET for cron/manual sync',
  };
}

function overallFromChecks(checks) {
  if (checks.some((c) => c.status === 'fail')) return 'unhealthy';
  if (checks.some((c) => c.status === 'warn')) return 'degraded';
  return 'healthy';
}

async function runAdminHealthChecks({ includeTranslationQueue = true } = {}) {
  const checks = await Promise.all([
    probeSupabase(),
    probeBokun(),
    Promise.resolve(probeOpenAIConfig()),
    probeCatalogFreshness(),
    probeCatalogPayloadQuality(),
    Promise.resolve(probeCronConfig()),
  ]);

  let translation = null;
  if (includeTranslationQueue) {
    try {
      translation = await scanTranslationQueue({ maxScan: 300, pendingLimit: 5 });
    } catch (err) {
      translation = { error: err.message };
    }
  }

  const env = envHealth();
  const overall = overallFromChecks(checks);

  return {
    ok: overall !== 'unhealthy',
    overall,
    generatedAt: new Date().toISOString(),
    checks,
    env,
    translation: translation ? {
      queueDepth: translation.stats?.queueDepth,
      percentComplete: translation.coverage?.percentComplete,
      pendingSample: translation.pending?.length || 0,
    } : null,
  };
}

module.exports = {
  envHealth,
  runAdminHealthChecks,
};

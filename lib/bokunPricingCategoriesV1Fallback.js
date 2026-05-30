/**
 * v2 components often expose pricing category IDs without titles
 * ("Category 52805"). Graft labels from v1 activity.json (narrow read).
 * @see lib/bokunAvailabilityV1Fallback.js
 */

const { bokunRequest } = require('./bokunClient');

function v1FallbackEnabled() {
  const flag = String(process.env.BOKUN_PRICING_CATEGORIES_V1_FALLBACK || '1').trim();
  return flag !== '0' && flag.toLowerCase() !== 'false';
}

function looksLikePlaceholderCategory(cat) {
  if (!cat) return true;
  const title = String(cat.fullTitle || cat.title || '').trim();
  if (!title) return true;
  if (/^Category \d+$/i.test(title)) return true;
  return false;
}

function categoriesNeedV1Titles(categories) {
  if (!Array.isArray(categories) || !categories.length) return true;
  return categories.some(looksLikePlaceholderCategory);
}

async function fetchV1PricingCategories(experienceId) {
  if (!v1FallbackEnabled() || experienceId == null) return [];
  try {
    const raw = await bokunRequest({
      method: 'GET',
      path: `/activity.json/${encodeURIComponent(String(experienceId))}`,
    });
    return Array.isArray(raw.pricingCategories) ? raw.pricingCategories : [];
  } catch (err) {
    console.warn('[bokunPricingCategoriesV1Fallback]', experienceId, err.message || err);
    return [];
  }
}

function normalizeV1Category(cat) {
  if (!cat || cat.id == null) return null;
  const title = cat.title || cat.fullTitle || 'Traveler';
  const fullTitle = cat.fullTitle || cat.title || title;
  return {
    id: cat.id,
    title,
    fullTitle,
    ticketCategory: cat.ticketCategory || null,
    minAge: cat.minAge ?? null,
    maxAge: cat.maxAge ?? null,
    defaultCategory: !!cat.defaultCategory,
    internalUseOnly: !!cat.internalUseOnly,
  };
}

/**
 * Prefer v1 category rows when v2 titles are placeholders.
 */
async function enrichPricingCategoriesFromV1(activity) {
  if (!activity || activity.id == null) return activity;
  const current = Array.isArray(activity.pricingCategories) ? activity.pricingCategories : [];
  if (!categoriesNeedV1Titles(current)) return activity;

  const v1Rows = await fetchV1PricingCategories(activity.id);
  if (!v1Rows.length) return activity;

  const v1ById = new Map();
  v1Rows.forEach((row) => {
    const norm = normalizeV1Category(row);
    if (norm) v1ById.set(String(norm.id), norm);
  });

  const merged = current
    .map((cat) => {
      const hit = v1ById.get(String(cat.id));
      if (!hit) return looksLikePlaceholderCategory(cat) ? null : cat;
      return {
        ...cat,
        title: hit.title,
        fullTitle: hit.fullTitle,
        ticketCategory: hit.ticketCategory || cat.ticketCategory,
        minAge: hit.minAge ?? cat.minAge,
        maxAge: hit.maxAge ?? cat.maxAge,
        defaultCategory: hit.defaultCategory || cat.defaultCategory,
        internalUseOnly: hit.internalUseOnly || cat.internalUseOnly,
      };
    })
    .filter(Boolean);

  const usedIds = new Set(merged.map((c) => String(c.id)));
  v1Rows.forEach((row) => {
    const norm = normalizeV1Category(row);
    if (!norm || usedIds.has(String(norm.id))) return;
    merged.push(norm);
  });

  if (!merged.length) return activity;
  return { ...activity, pricingCategories: merged };
}

module.exports = {
  v1FallbackEnabled,
  looksLikePlaceholderCategory,
  categoriesNeedV1Titles,
  fetchV1PricingCategories,
  enrichPricingCategoriesFromV1,
};

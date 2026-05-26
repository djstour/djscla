/**
 * Strip list-view payloads — heavy detail fields still come from GET /api/bokun/activity,
 * but a plain-text summary is kept so cards/detail previews can show copy immediately.
 */
function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function slimActivityForList(activity) {
  if (!activity || typeof activity !== 'object') return activity;
  const plain = stripHtml(activity.summary || activity.description || '');
  const summary = plain.length > 520 ? `${plain.slice(0, 520)}…` : plain;
  return {
    id: activity.id,
    externalId: activity.externalId,
    slug: activity.slug,
    title: activity.title,
    summary,
    durationText: activity.durationText,
    durationMinutes: activity.durationMinutes,
    bookingType: activity.bookingType,
    currency: activity.currency,
    defaultCurrency: activity.defaultCurrency,
    vendor: activity.vendor,
    pricingCategories: activity.pricingCategories,
    pricing: activity.pricing,
    nextDefaultPrice: activity.nextDefaultPrice,
    availability: activity.availability,
    categories: activity.categories,
    categoryLabels: activity.categoryLabels,
    chipIds: activity.chipIds,
    routeIds: activity.routeIds,
    facetIds: activity.facetIds,
    coverImageUrl: activity.coverImageUrl,
    coverImagePlaceholder: activity.coverImagePlaceholder,
    coverImageOwnedUrl: activity.coverImageOwnedUrl || null,
    coverImageCardUrl: activity.coverImageCardUrl || null,
    coverImageHeroUrl: activity.coverImageHeroUrl || null,
    coverImageGalleryUrl: activity.coverImageGalleryUrl || null,
    averageRating: activity.averageRating,
    reviewCount: activity.reviewCount,
    tags: activity.tags,
    cancellationCutoffMinutes: activity.cancellationCutoffMinutes,
  };
}

module.exports = { slimActivityForList };

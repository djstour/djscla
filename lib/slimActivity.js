/**
 * Strip list-view payloads — detail fields fetched via GET /api/bokun/activity only.
 */
function slimActivityForList(activity) {
  if (!activity || typeof activity !== 'object') return activity;
  return {
    id: activity.id,
    externalId: activity.externalId,
    slug: activity.slug,
    title: activity.title,
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
    coverImageUrl: activity.coverImageUrl,
    coverImagePlaceholder: activity.coverImagePlaceholder,
    averageRating: activity.averageRating,
    reviewCount: activity.reviewCount,
    tags: activity.tags,
    cancellationCutoffMinutes: activity.cancellationCutoffMinutes,
  };
}

module.exports = { slimActivityForList };

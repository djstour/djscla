/* TripPlaybookPicker — Hero curated itinerary bundles (rank boost, not filter). */

(function () {
  const { useState, useEffect, useMemo } = React;
  const {
    Icon, pick, normalizeTripSearch, tripNightCountFromSearch, formatTripSearchSummary,
  } = window.AuralisUI;

  function formatPlaybookFitSubtitle(pb, nights, lang) {
    const min = pb.minNights;
    const max = pb.maxNights;
    if (nights > 0 && min != null && max != null && nights >= min && nights <= max) {
      return pick(lang, {
        hant: `適合你的 ${nights} 晚行程`,
        hans: `适合你的 ${nights} 晚行程`,
        en: `Fits your ${nights}-night trip`,
      });
    }
    if (nights > 0 && min != null && max == null && nights >= min) {
      return pick(lang, {
        hant: `你的 ${nights} 晚符合（建議 ${min} 晚以上）`,
        hans: `你的 ${nights} 晚符合（建议 ${min} 晚以上）`,
        en: `Your ${nights} nights fit (${min}+ nights recommended)`,
      });
    }
    return pb.subtitle || '';
  }

  function TripPlaybookPicker({ tripSearch, lang, onBrowseAll, onSelectPlaybook }) {
    const T = (opts) => pick(lang, opts);
    const search = useMemo(() => normalizeTripSearch(tripSearch), [tripSearch]);
    const nights = tripNightCountFromSearch(search);
    const tripSummary = formatTripSearchSummary(search, lang);
    const [playbooks, setPlaybooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedSlug, setSelectedSlug] = useState(null);

    useEffect(() => {
      setSelectedSlug(null);
    }, [search.startDate, search.endDate, search.hubId, nights, lang]);

    useEffect(() => {
      let cancelled = false;
      setLoading(true);
      const qs = new URLSearchParams({ lang });
      if (nights > 0) qs.set('nights', String(nights));
      if (search.startDate) qs.set('startDate', search.startDate);
      if (search.hubId) qs.set('hubId', search.hubId);
      fetch(`/api/catalog/playbooks?${qs}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          setPlaybooks(Array.isArray(data.playbooks) ? data.playbooks : []);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) {
            setPlaybooks([]);
            setLoading(false);
          }
        });
      return () => { cancelled = true; };
    }, [lang, nights, search.startDate, search.hubId]);

    return (
      <div className="trip-playbooks">
        <p className="trip-playbooks__label">
          {T({
            hant: '熱門行程組合（可選）',
            hans: '热门行程组合（可选）',
            en: 'Popular trip combos (optional)',
          })}
        </p>
        {tripSummary && (
          <p className="trip-playbooks__context">
            {T({
              hant: `依你的設定：${tripSummary}`,
              hans: `依你的设定：${tripSummary}`,
              en: `Based on your trip: ${tripSummary}`,
            })}
          </p>
        )}
        {loading && (
          <p className="trip-playbooks__loading">
            {T({ hant: '載入中…', hans: '加载中…', en: 'Loading…' })}
          </p>
        )}
        {!loading && playbooks.length === 0 && (
          <p className="trip-playbooks__empty">
            {T({
              hant: '目前沒有符合你日期與季節的預設組合，可直接瀏覽下方全部體驗。',
              hans: '目前没有符合你日期与季节的预设组合，可直接浏览下方全部体验。',
              en: 'No preset combos match your dates and season — browse all tours below.',
            })}
          </p>
        )}
        {!loading && playbooks.length > 0 && (
          <div className="trip-playbooks__grid" role="list">
            {playbooks.map((pb) => (
              <button
                key={pb.slug}
                type="button"
                role="listitem"
                className={`trip-playbooks__card${selectedSlug === pb.slug ? ' is-active' : ''}`}
                aria-pressed={selectedSlug === pb.slug}
                onClick={() => {
                  setSelectedSlug(pb.slug);
                  if (onSelectPlaybook) onSelectPlaybook(pb);
                }}
              >
                <span className="trip-playbooks__card-title">{pb.title}</span>
                <span className="trip-playbooks__card-sub">
                  {formatPlaybookFitSubtitle(pb, nights, lang)}
                </span>
              </button>
            ))}
          </div>
        )}
        <button type="button" className="trip-playbooks__browse" onClick={onBrowseAll}>
          <Icon name="arrow-right" size={18} />
          {T({
            hant: '瀏覽全部體驗（依你的日期排序）',
            hans: '浏览全部体验（依你的日期排序）',
            en: 'Browse all tours (sorted for your dates)',
          })}
        </button>
        <p className="trip-playbooks__hint">
          {T({
            hant: '空位與價格在詳情頁即時確認；列表會優先顯示你的日期有空位的體驗。',
            hans: '空位与价格在详情页即时确认；列表会优先显示你的日期有空位的体验。',
            en: 'Availability and prices are confirmed on each tour page. We prioritize tours with open slots on your dates.',
          })}
        </p>
      </div>
    );
  }

  window.AuralisUI.TripPlaybookPicker = TripPlaybookPicker;
})();

/* HomeSections — Phase 1 home IA: destinations, theme tiles, trust pillars. */

(function () {
  const { useMemo } = React;
  const {
    Icon, pick, formatCatalogCount,
    HOME_DESTINATIONS, HOME_THEME_TILES, HOME_TRUST_PILLARS,
    countActivitiesForHomeFilter, formatHomeActivityCount, fakePhoto,
    homeDestinationToFilters,
  } = window.AuralisUI;

  function DestinationChipsSection({ lang, activities, tripSearch, onSelectDestination }) {
    const T = (opts) => pick(lang, opts);
    const counts = useMemo(() => (
      HOME_DESTINATIONS.map((dest) => ({
        ...dest,
        count: countActivitiesForHomeFilter(activities, {
          chipId: dest.chipId,
          routeId: dest.routeId,
          hubId: dest.hubId,
        }),
      }))
    ), [activities]);

    return (
      <section className="auralis-section home-destinations" aria-labelledby="home-destinations-title">
        <div className="auralis-container">
          <div className="home-section-head">
            <div>
              <span className="overline home-section-head__overline">
                {T({ hant: '冰島出發', hans: '冰岛出发', en: 'Start exploring' })}
              </span>
              <h2 id="home-destinations-title" className="home-section-head__title">
                {T({
                  hant: '無論你想去哪，都有行程',
                  hans: '无论你想去哪，都有行程',
                  en: 'Things to do wherever you\'re going',
                })}
              </h2>
            </div>
          </div>
        </div>
        <div className="home-destinations__rail-wrap">
          <div className="home-destinations__rail" role="list">
            {counts.map((dest) => {
              const countLabel = formatHomeActivityCount(dest.count, lang);
              return (
                <button
                  key={dest.id}
                  type="button"
                  className="home-destination-chip"
                  role="listitem"
                  onClick={() => onSelectDestination(homeDestinationToFilters(dest, tripSearch))}
                >
                  <span className="home-destination-chip__icon" aria-hidden="true">
                    <Icon name={dest.icon} size={18} />
                  </span>
                  <span className="home-destination-chip__text">
                    <span className="home-destination-chip__label">{pick(lang, dest.label)}</span>
                    <span className="home-destination-chip__count">{countLabel}</span>
                  </span>
                  <Icon name="chevron-right" size={16} className="home-destination-chip__chevron" />
                </button>
              );
            })}
          </div>
        </div>
      </section>
    );
  }

  function ThemeTilesSection({ lang, activities, onSelectTheme, onSelectCollection }) {
    const T = (opts) => pick(lang, opts);
    const { findIcelandCollectionBySlug } = window.AuralisUI;
    const tiles = useMemo(() => (
      HOME_THEME_TILES.map((tile) => ({
        ...tile,
        count: countActivitiesForHomeFilter(activities, {
          chipId: tile.chipId,
          routeId: tile.routeId,
        }),
      }))
    ), [activities]);

    return (
      <section className="auralis-section home-themes" aria-labelledby="home-themes-title">
        <div className="auralis-container">
          <div className="home-section-head home-section-head--compact">
            <div>
              <span className="overline home-section-head__overline">
                {T({ hant: '必訪主題', hans: '必访主题', en: 'Don\'t miss' })}
              </span>
              <h2 id="home-themes-title" className="home-section-head__title">
                {T({
                  hant: '冰島不能錯過的體驗',
                  hans: '冰岛不能错过的体验',
                  en: 'Attractions you can\'t miss',
                })}
              </h2>
            </div>
          </div>
          <div className="home-themes__grid" role="list">
            {tiles.map((tile) => (
              <button
                key={tile.id}
                type="button"
                className="home-theme-tile"
                role="listitem"
                style={{ backgroundImage: fakePhoto(tile.photo) }}
                onClick={() => {
                  const col = findIcelandCollectionBySlug(tile.slug);
                  if (col && onSelectCollection) onSelectCollection(col);
                  else if (onSelectTheme) onSelectTheme({
                    chipId: tile.chipId || null,
                    routeId: tile.routeId || null,
                  });
                }}
              >
                <span className="home-theme-tile__scrim" aria-hidden="true" />
                <span className="home-theme-tile__content">
                  <span className="home-theme-tile__label">{pick(lang, tile.label)}</span>
                  <span className="home-theme-tile__count">
                    {formatHomeActivityCount(tile.count, lang)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  function TrustSection({ lang, catalogTotal }) {
    const T = (opts) => pick(lang, opts);
    const countLabel = formatCatalogCount(catalogTotal, lang);

    return (
      <section className="auralis-section home-trust" aria-labelledby="home-trust-title">
        <div className="auralis-container">
          <div className="home-section-head home-section-head--center">
            <span className="overline home-section-head__overline">
              {T({ hant: '為何選 DJS Tour', hans: '为何选 DJS Tour', en: 'Why DJS Tour' })}
            </span>
            <h2 id="home-trust-title" className="home-section-head__title">
              {T({
                hant: '為什麼在這裡預訂？',
                hans: '为什么在这里预订？',
                en: 'Why book with us?',
              })}
            </h2>
            {catalogTotal > 0 && (
              <p className="home-trust__lead">
                {T({
                  hant: `${countLabel} 個即時行程 · 中文客服 · 先排再訂`,
                  hans: `${countLabel} 个即时行程 · 中文客服 · 先排再订`,
                  en: `${countLabel} live tours · Mandarin support · Plan first, book later`,
                })}
              </p>
            )}
          </div>
          <div className="home-trust__grid">
            {HOME_TRUST_PILLARS.map((pillar) => (
              <div key={pillar.id} className="glass home-trust__card">
                <span className="home-trust__icon" aria-hidden="true">
                  <Icon name={pillar.icon} size={22} color="var(--coral)" />
                </span>
                <h3 className="home-trust__card-title">{pick(lang, pillar.title)}</h3>
                <p className="home-trust__card-body">{pick(lang, pillar.body)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  window.AuralisUI.DestinationChipsSection = DestinationChipsSection;
  window.AuralisUI.ThemeTilesSection = ThemeTilesSection;
  window.AuralisUI.TrustSection = TrustSection;
})();

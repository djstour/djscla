/* NavDestinationsMenu — Iceland destination mega menu (Phase 3). */

(function () {
  const { useState, useRef, useEffect } = React;
  const {
    Icon, pick,
    HOME_DESTINATIONS, HOME_THEME_TILES, ICELAND_COLLECTIONS,
    findIcelandCollectionBySlug, buildIcelandCollectionPath,
  } = window.AuralisUI;

  function NavDestinationsMenu({ lang, onSelectCollection, onCloseMenu, className = '' }) {
    const T = (opts) => pick(lang, opts);
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
      if (!open) return undefined;
      function onPointerDown(e) {
        if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
      }
      function onKey(e) {
        if (e.key === 'Escape') setOpen(false);
      }
      document.addEventListener('mousedown', onPointerDown, true);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onPointerDown, true);
        document.removeEventListener('keydown', onKey);
      };
    }, [open]);

    function selectSlug(slug) {
      const col = findIcelandCollectionBySlug(slug);
      if (col && onSelectCollection) onSelectCollection(col);
      setOpen(false);
      if (onCloseMenu) onCloseMenu();
    }

    const destinationCols = HOME_DESTINATIONS
      .map((d) => findIcelandCollectionBySlug(d.slug))
      .filter(Boolean);
    const destinationSlugs = new Set(destinationCols.map((col) => col.slug));
    const themeCols = HOME_THEME_TILES
      .map((t) => findIcelandCollectionBySlug(t.slug))
      .filter(Boolean)
      // Same /iceland/:slug as Popular areas — keep one link per destination.
      .filter((col) => !destinationSlugs.has(col.slug));
    const categoryCols = ICELAND_COLLECTIONS.filter((c) => c.navGroup === 'category').slice(0, 8);

    return (
      <div ref={rootRef} className={`nav-destinations${className ? ` ${className}` : ''}`}>
        <button
          type="button"
          className={`nav-destinations__trigger${open ? ' is-open' : ''}`}
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((v) => !v)}
        >
          {T({ hant: '冰島目的地', hans: '冰岛目的地', en: 'Iceland' })}
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} />
        </button>

        {open && (
          <div className="nav-destinations__panel" role="menu">
            <div className="nav-destinations__grid">
              <section className="nav-destinations__col">
                <h3 className="nav-destinations__heading">
                  {T({ hant: '熱門出發地', hans: '热门出发地', en: 'Popular areas' })}
                </h3>
                <ul className="nav-destinations__list">
                  {destinationCols.map((col) => (
                    <li key={col.slug}>
                      <a
                        href={buildIcelandCollectionPath(col.slug)}
                        role="menuitem"
                        className="nav-destinations__link"
                        onClick={(e) => { e.preventDefault(); selectSlug(col.slug); }}
                      >
                        {pick(lang, col.label)}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="nav-destinations__col">
                <h3 className="nav-destinations__heading">
                  {T({ hant: '必訪主題', hans: '必访主题', en: 'Don\'t miss' })}
                </h3>
                <ul className="nav-destinations__list">
                  {themeCols.map((col) => (
                    <li key={col.slug}>
                      <a
                        href={buildIcelandCollectionPath(col.slug)}
                        role="menuitem"
                        className="nav-destinations__link"
                        onClick={(e) => { e.preventDefault(); selectSlug(col.slug); }}
                      >
                        {pick(lang, col.label)}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="nav-destinations__col">
                <h3 className="nav-destinations__heading">
                  {T({ hant: '體驗類型', hans: '体验类型', en: 'Experience types' })}
                </h3>
                <ul className="nav-destinations__list nav-destinations__list--compact">
                  {categoryCols.map((col) => (
                    <li key={col.slug}>
                      <a
                        href={buildIcelandCollectionPath(col.slug)}
                        role="menuitem"
                        className="nav-destinations__link"
                        onClick={(e) => { e.preventDefault(); selectSlug(col.slug); }}
                      >
                        {pick(lang, col.label)}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )}
      </div>
    );
  }

  function MobileDestinationsSection({ lang, onSelectCollection }) {
    const T = (opts) => pick(lang, opts);
    const links = ICELAND_COLLECTIONS.filter((c) => c.navGroup !== 'category').slice(0, 10);

    return (
      <div className="nav-mobile-destinations">
        <p className="nav-mobile-destinations__label">
          {T({ hant: '冰島目的地', hans: '冰岛目的地', en: 'Explore Iceland' })}
        </p>
        <div className="nav-mobile-destinations__chips">
          {links.map((col) => (
            <a
              key={col.slug}
              href={buildIcelandCollectionPath(col.slug)}
              className="nav-mobile-destinations__chip"
              onClick={(e) => {
                e.preventDefault();
                if (onSelectCollection) onSelectCollection(col);
              }}
            >
              {pick(lang, col.label)}
            </a>
          ))}
        </div>
      </div>
    );
  }

  window.AuralisUI.NavDestinationsMenu = NavDestinationsMenu;
  window.AuralisUI.MobileDestinationsSection = MobileDestinationsSection;
})();

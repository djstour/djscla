/* SearchOverlay — global typeahead palette (Cmd/Ctrl + K).
 * --------------------------------------------------------------------------
 * Mounts via createPortal to document.body so it floats above every screen.
 * Calls BokunAdapter.searchCatalog() with a 200ms debounce; results render
 * as Tour rows the user can keyboard-navigate. Selecting a result opens the
 * activity detail; the footer link sends remaining results to /tours?q=…
 */

(function () {
  const { useState, useEffect, useRef, useMemo } = React;
  const { createPortal } = ReactDOM;
  const {
    Icon, pick, proxyImageUrl, formatDisplayPriceCompact,
  } = window.AuralisUI;

  const SUGGESTED_QUERIES = [
    { hant: 'Northern Lights', hans: 'Northern Lights', en: 'Northern Lights' },
    { hant: 'Golden Circle',   hans: 'Golden Circle',   en: 'Golden Circle' },
    { hant: 'Glacier hike',    hans: 'Glacier hike',    en: 'Glacier hike' },
    { hant: 'Blue Lagoon',     hans: 'Blue Lagoon',     en: 'Blue Lagoon' },
    { hant: 'Ice cave',        hans: 'Ice cave',        en: 'Ice cave' },
  ];

  const RECENT_KEY = 'auralis.searchRecent';
  const RECENT_MAX = 6;

  function readRecent() {
    try {
      const raw = window.localStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
    } catch (_) {
      return [];
    }
  }

  function pushRecent(query) {
    const q = String(query || '').trim();
    if (!q) return;
    try {
      const arr = readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase());
      arr.unshift(q);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(arr.slice(0, RECENT_MAX)));
    } catch (_) { /* ignore */ }
  }

  function SearchOverlay({
    open, onClose, lang = 'hant', displayCurrency = 'USD', fxRates = { USD: 1 },
    onOpenDetail, onSeeAll,
  }) {
    const T = (opts) => pick(lang, opts);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const reqTokenRef = useRef(0);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [meta, setMeta] = useState({ total: 0 });
    const [loading, setLoading] = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);
    const [recent, setRecent] = useState(() => readRecent());

    const trimmed = query.trim();

    useEffect(() => {
      if (!open) return undefined;
      setRecent(readRecent());
      const t = setTimeout(() => {
        if (inputRef.current) inputRef.current.focus();
      }, 30);
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        clearTimeout(t);
        document.body.style.overflow = prevOverflow;
      };
    }, [open]);

    useEffect(() => {
      if (!open) {
        setQuery('');
        setResults([]);
        setMeta({ total: 0 });
        setActiveIdx(0);
        setLoading(false);
      }
    }, [open]);

    useEffect(() => {
      if (!open) return undefined;
      if (!trimmed) {
        setResults([]);
        setMeta({ total: 0 });
        setLoading(false);
        return undefined;
      }
      const token = ++reqTokenRef.current;
      setLoading(true);
      const handle = setTimeout(() => {
        if (!window.AuralisData || !window.AuralisData.BokunAdapter) return;
        window.AuralisData.BokunAdapter
          .searchCatalog(trimmed, { lang, limit: 8 })
          .then((data) => {
            if (token !== reqTokenRef.current) return;
            setResults(data.activities || []);
            setMeta(data.meta || { total: 0 });
            setActiveIdx(0);
            setLoading(false);
          })
          .catch((err) => {
            if (token !== reqTokenRef.current) return;
            console.warn('[Auralis] search failed:', err && err.message);
            setResults([]);
            setMeta({ total: 0 });
            setLoading(false);
          });
      }, 200);
      return () => clearTimeout(handle);
    }, [trimmed, lang, open]);

    function handleKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (results.length === 0) return;
        setActiveIdx((i) => (i + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (results.length === 0) return;
        setActiveIdx((i) => (i - 1 + results.length) % results.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results.length > 0) {
          activate(results[activeIdx] || results[0]);
        } else if (trimmed) {
          seeAll();
        }
      }
    }

    function activate(vm) {
      if (!vm) return;
      pushRecent(trimmed || vm.title);
      onOpenDetail && onOpenDetail(vm);
      onClose();
    }

    function seeAll() {
      pushRecent(trimmed);
      onSeeAll && onSeeAll(trimmed);
      onClose();
    }

    function runSuggestion(q) {
      setQuery(q);
      if (inputRef.current) inputRef.current.focus();
    }

    if (!open) return null;

    const showSuggestions = !trimmed;
    const empty = !loading && trimmed && results.length === 0;
    const totalResults = Number((meta && meta.total) || 0);

    return createPortal(
      <div
        className="search-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={T({ hant: '搜尋', hans: '搜索', en: 'Search' })}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="search-overlay__panel" onKeyDown={handleKey}>
          <div className="search-overlay__input-row">
            <Icon name="search" size={18} color="var(--fg-3)" />
            <input
              ref={inputRef}
              type="text"
              className="search-overlay__input"
              placeholder={T({
                hant: '搜尋行程、體驗、目的地…',
                hans: '搜索行程、体验、目的地…',
                en: 'Search tours, experiences, destinations…',
              })}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                className="search-overlay__clear"
                onClick={() => { setQuery(''); inputRef.current && inputRef.current.focus(); }}
                aria-label={T({ hant: '清除', hans: '清除', en: 'Clear' })}
              >
                <Icon name="x" size={14} />
              </button>
            )}
            <kbd className="search-overlay__kbd">Esc</kbd>
          </div>

          <div className="search-overlay__body" ref={listRef}>
            {showSuggestions && (
              <div className="search-overlay__group">
                {recent.length > 0 && (
                  <>
                    <div className="search-overlay__group-label">
                      {T({ hant: '最近搜尋', hans: '最近搜索', en: 'Recent' })}
                    </div>
                    <div className="search-overlay__chips">
                      {recent.map((q) => (
                        <button key={`r-${q}`} type="button"
                                className="search-overlay__chip"
                                onClick={() => runSuggestion(q)}>
                          <Icon name="history" size={12} />
                          {q}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="search-overlay__group-label">
                  {T({ hant: '熱門關鍵字', hans: '热门关键字', en: 'Popular' })}
                </div>
                <div className="search-overlay__chips">
                  {SUGGESTED_QUERIES.map((q, i) => {
                    const label = pick(lang, q);
                    return (
                      <button key={`s-${i}`} type="button"
                              className="search-overlay__chip"
                              onClick={() => runSuggestion(label)}>
                        <Icon name="sparkles" size={12} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {!showSuggestions && loading && results.length === 0 && (
              <div className="search-overlay__empty">
                {T({ hant: '搜尋中…', hans: '搜索中…', en: 'Searching…' })}
              </div>
            )}

            {!showSuggestions && empty && (
              <div className="search-overlay__empty">
                {T({
                  hant: `找不到符合「${trimmed}」的行程`,
                  hans: `找不到符合「${trimmed}」的行程`,
                  en: `No tours match "${trimmed}"`,
                })}
              </div>
            )}

            {!showSuggestions && results.length > 0 && (
              <ul className="search-overlay__results" role="listbox">
                {results.map((vm, i) => {
                  const vendor = (vm.vendor || (vm.raw && vm.raw.vendor)) || {};
                  const supplier = vendor.titleOriginal || vendor.title || vm.supplier;
                  const cover = vm.coverImageGalleryUrl
                    || vm.coverImageCardUrl
                    || (vm.coverImageUrl
                      ? proxyImageUrl(vm.coverImageUrl, { w: 96, q: 70 })
                      : null);
                  const active = i === activeIdx;
                  return (
                    <li
                      key={vm.id}
                      role="option"
                      aria-selected={active}
                      className={'search-overlay__result' + (active ? ' is-active' : '')}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => activate(vm)}
                    >
                      <div className="search-overlay__thumb">
                        {cover
                          ? <img src={cover} alt="" loading="lazy" />
                          : <Icon name="image" size={18} color="var(--fg-3)" />}
                      </div>
                      <div className="search-overlay__meta">
                        <div className="search-overlay__title">{vm.title}</div>
                        <div className="search-overlay__sub">
                          {supplier ? <span>{supplier}</span> : null}
                          {vm.duration ? <span aria-hidden="true">·</span> : null}
                          {vm.duration ? <span>{vm.duration}</span> : null}
                        </div>
                      </div>
                      <div className="search-overlay__price">
                        {vm.priceUsd != null || vm.price != null
                          ? formatDisplayPriceCompact(vm.priceUsd ?? vm.price, displayCurrency, fxRates)
                          : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {!showSuggestions && trimmed && (
            <button type="button" className="search-overlay__footer" onClick={seeAll}>
              <span>
                {T({
                  hant: `查看「${trimmed}」全部 ${totalResults || results.length} 個結果`,
                  hans: `查看「${trimmed}」全部 ${totalResults || results.length} 个结果`,
                  en: `See all ${totalResults || results.length} results for "${trimmed}"`,
                })}
              </span>
              <Icon name="arrow-right" size={14} />
            </button>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  window.AuralisUI.SearchOverlay = SearchOverlay;
})();

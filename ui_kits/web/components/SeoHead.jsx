/* SeoHead — thin wrapper; logic lives in _shared applyPageDocument + mountProductJsonLd. */

(function () {
  const { useEffect } = React;
  const { applyPageDocument, mountProductJsonLd, unmountProductJsonLd } = window.AuralisUI;

  function SeoHead({
    lang, screen, tour, collection, query, path,
    displayCurrency, fxRates, enableProductSchema = false,
  }) {
    useEffect(() => {
      applyPageDocument({ lang, screen, tour, collection, query, path });
    }, [lang, screen, tour, collection, query, path]);

    useEffect(() => {
      if (screen === 'detail' && tour && enableProductSchema) {
        mountProductJsonLd(tour, { displayCurrency, fxRates, lang });
        return () => unmountProductJsonLd();
      }
      unmountProductJsonLd();
      return undefined;
    }, [screen, tour, displayCurrency, fxRates, lang, enableProductSchema]);

    return null;
  }

  window.AuralisUI.SeoHead = SeoHead;
})();

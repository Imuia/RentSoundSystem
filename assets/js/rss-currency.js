/**
 * RentSoundSystem - Moteur Multi-Devise Autonome Indépendant (Client-side)
 * Effectue un formateur visuel à l'affichage des prix SANS toucher aux montants bruts Stripe / Supabase.
 * Toutes les transactions restent exécutées à 100% en EUR.
 */
(function() {
  'use strict';

  if (window.__rssCurrencyBoot) return;
  window.__rssCurrencyBoot = true;

  const DEFAULT_CURRENCY = 'EUR';
  const SUPPORTED_CURRENCIES = {
    EUR: { symbol: '€', name: 'Euro', rate: 1.0, format: 'de-DE' },
    USD: { symbol: '$', name: 'US Dollar', rate: 1.08, format: 'en-US' },
    GBP: { symbol: '£', name: 'British Pound', rate: 0.85, format: 'en-GB' },
    MAD: { symbol: 'MAD', name: 'Dirham Marocain', rate: 10.8, format: 'fr-MA' },
    AED: { symbol: 'AED', name: 'Dirham des Émirats', rate: 3.96, format: 'ar-AE' },
    CHF: { symbol: 'CHF', name: 'Franc Suisse', rate: 0.95, format: 'de-CH' },
    CAD: { symbol: 'CA$', name: 'Dollar Canadien', rate: 1.48, format: 'en-CA' },
    JPY: { symbol: '¥', name: 'Yen Japonais', rate: 168.0, format: 'ja-JP' },
    CNY: { symbol: '元', name: 'Yuan Chinois', rate: 7.82, format: 'zh-CN' }
  };

  let currentCurrency = DEFAULT_CURRENCY;
  let customRates = {};

  function normalizeCurrency(code) {
    if (!code) return DEFAULT_CURRENCY;
    const clean = String(code).toUpperCase().trim();
    return SUPPORTED_CURRENCIES[clean] ? clean : DEFAULT_CURRENCY;
  }

  function detectCurrency() {
    try {
      const saved = localStorage.getItem('rss_currency');
      if (saved && SUPPORTED_CURRENCIES[saved]) {
        return normalizeCurrency(saved);
      }
    } catch (e) {}
    return DEFAULT_CURRENCY;
  }

  async function fetchLiveRates() {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/EUR');
      if (res.ok) {
        const data = await res.json();
        if (data && data.rates) {
          Object.keys(SUPPORTED_CURRENCIES).forEach(code => {
            if (data.rates[code]) {
              SUPPORTED_CURRENCIES[code].rate = data.rates[code];
            }
          });
        }
      }
    } catch (err) {
      console.warn('[rss-currency] Utilisation des taux de change fallbacks.', err);
    }
  }

  function convertPrice(amountEUR, targetCurrency) {
    const num = Number(amountEUR || 0);
    if (!num || isNaN(num)) return 0;

    const curr = normalizeCurrency(targetCurrency || currentCurrency);
    const info = SUPPORTED_CURRENCIES[curr];
    const rate = customRates[curr] || info.rate || 1.0;

    return num * rate;
  }

  function formatPrice(amountEUR, targetCurrency, options) {
    const curr = normalizeCurrency(targetCurrency || currentCurrency);
    const info = SUPPORTED_CURRENCIES[curr];
    const converted = convertPrice(amountEUR, curr);

    const locale = (options && options.locale) || info.format || 'fr-FR';
    const showDecimals = options && options.decimals !== undefined ? options.decimals : (curr === 'JPY' ? 0 : 0);

    try {
      const formatted = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: curr,
        maximumFractionDigits: showDecimals,
        minimumFractionDigits: showDecimals
      }).format(converted);

      return formatted;
    } catch (e) {
      return Math.round(converted) + ' ' + info.symbol;
    }
  }

  function applyCurrencyToDOM(rootElement) {
    const root = rootElement || document;
    const elements = root.querySelectorAll('[data-rss-price-eur]');

    elements.forEach(el => {
      const amountEUR = parseFloat(el.getAttribute('data-rss-price-eur'));
      if (isNaN(amountEUR)) return;

      const formatOption = el.getAttribute('data-rss-price-format'); // ex: 'per_day'
      const formatted = formatPrice(amountEUR, currentCurrency);

      if (formatOption === 'per_day') {
        el.innerHTML = `${formatted} <small class="text-xs opacity-75">/ jour</small>`;
      } else {
        el.textContent = formatted;
      }
    });
  }

  function setCurrency(code) {
    code = normalizeCurrency(code);
    currentCurrency = code;

    try {
      localStorage.setItem('rss_currency', code);
    } catch (e) {}

    applyCurrencyToDOM(document);
    window.dispatchEvent(new CustomEvent('rss:currencyChanged', { detail: { currency: code } }));
  }

  const RssCurrency = {
    init: function() {
      currentCurrency = detectCurrency();
      fetchLiveRates().then(() => {
        applyCurrencyToDOM(document);
      });
      applyCurrencyToDOM(document);
    },
    setCurrency: setCurrency,
    getCurrency: function() { return currentCurrency; },
    format: formatPrice,
    convert: convertPrice,
    apply: applyCurrencyToDOM,
    SUPPORTED_CURRENCIES: SUPPORTED_CURRENCIES
  };

  window.RssCurrency = RssCurrency;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RssCurrency.init());
  } else {
    RssCurrency.init();
  }
})();

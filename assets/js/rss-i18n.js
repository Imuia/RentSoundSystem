/**
 * RentSoundSystem - Moteur i18n Natif Autonome (Client-side)
 * Ne modifie QUE les éléments explicitement ciblés par [data-i18n*].
 * Ne touche JAMAIS aux ID, classes, names de formulaires, valeurs métier, Supabase ou Stripe.
 */
(function() {
  'use strict';

  if (window.__rssI18nBoot) return;
  window.__rssI18nBoot = true;

  const SUPPORTED_LANGS = [
    'fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ca', 'pl', 'uk', 'zh', 'ja', 'ar'
  ];

  const RTL_LANGS = ['ar'];

  let currentLang = 'fr';
  let dictionary = {};
  const cache = {};

  function normalizeLang(lang) {
    if (!lang) return 'fr';
    const clean = String(lang).toLowerCase().trim().split('-')[0].split('_')[0];
    return SUPPORTED_LANGS.includes(clean) ? clean : 'fr';
  }

  function detectLanguage() {
    // 1. Détection via préfixe d'URL (ex: /en/catalog ou /es/...)
    const path = window.location.pathname;
    const parts = path.split('/').filter(Boolean);
    if (parts.length > 0 && SUPPORTED_LANGS.includes(parts[0].toLowerCase())) {
      return normalizeLang(parts[0]);
    }

    // 2. Détection via localStorage
    try {
      const saved = localStorage.getItem('rss_language');
      if (saved && SUPPORTED_LANGS.includes(saved)) {
        return normalizeLang(saved);
      }
    } catch (e) {}

    // 3. Détection via le navigateur
    try {
      const navLang = navigator.language || (navigator.languages && navigator.languages[0]);
      if (navLang) {
        const norm = normalizeLang(navLang);
        if (norm !== 'fr') return norm;
      }
    } catch (e) {}

    return 'fr';
  }

  async function loadDictionary(lang) {
    lang = normalizeLang(lang);
    if (cache[lang]) {
      dictionary = cache[lang];
      return dictionary;
    }

    if (lang === 'fr') {
      dictionary = {};
      cache['fr'] = dictionary;
      return dictionary;
    }

    try {
      const res = await fetch(`/i18n/${lang}.json`, { cache: 'default' });
      if (res.ok) {
        dictionary = await res.json();
        cache[lang] = dictionary;
      } else {
        dictionary = {};
      }
    } catch (err) {
      console.warn(`[rss-i18n] Impossible de charger /i18n/${lang}.json`, err);
      dictionary = {};
    }
    return dictionary;
  }

  function translateText(key, fallbackText) {
    if (!key) return fallbackText || '';
    if (currentLang === 'fr') return fallbackText || key;
    return dictionary[key] || fallbackText || key;
  }

  function applyTranslations(rootElement) {
    if (!window.RSS_I18N_ENABLED) return;

    const root = rootElement || document;

    // Directives explicites data-i18n
    const elements = root.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;

      if (!el.hasAttribute('data-i18n-original')) {
        el.setAttribute('data-i18n-original', el.textContent.trim());
      }
      const fallback = el.getAttribute('data-i18n-original');
      const translated = translateText(key, fallback);
      if (translated) {
        el.textContent = translated;
      }
    });

    // Placeholders explicites
    const placeholders = root.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (!key) return;

      if (!el.hasAttribute('data-i18n-placeholder-original')) {
        el.setAttribute('data-i18n-placeholder-original', el.getAttribute('placeholder') || '');
      }
      const fallback = el.getAttribute('data-i18n-placeholder-original');
      const translated = translateText(key, fallback);
      if (translated) {
        el.setAttribute('placeholder', translated);
      }
    });

    // Titles explicites
    const titles = root.querySelectorAll('[data-i18n-title]');
    titles.forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (!key) return;

      if (!el.hasAttribute('data-i18n-title-original')) {
        el.setAttribute('data-i18n-title-original', el.getAttribute('title') || '');
      }
      const fallback = el.getAttribute('data-i18n-title-original');
      const translated = translateText(key, fallback);
      if (translated) {
        el.setAttribute('title', translated);
      }
    });

    // Aria-label explicites
    const arias = root.querySelectorAll('[data-i18n-aria]');
    arias.forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (!key) return;

      if (!el.hasAttribute('data-i18n-aria-original')) {
        el.setAttribute('data-i18n-aria-original', el.getAttribute('aria-label') || '');
      }
      const fallback = el.getAttribute('data-i18n-aria-original');
      const translated = translateText(key, fallback);
      if (translated) {
        el.setAttribute('aria-label', translated);
      }
    });
  }

  function updateDocumentDirection(lang) {
    const html = document.documentElement;
    html.setAttribute('lang', lang);

    if (RTL_LANGS.includes(lang)) {
      html.setAttribute('dir', 'rtl');
      document.body.classList.add('rss-rtl');
    } else {
      html.removeAttribute('dir');
      document.body.classList.remove('rss-rtl');
    }
  }

  async function setLanguage(lang) {
    lang = normalizeLang(lang);
    currentLang = lang;

    try {
      localStorage.setItem('rss_language', lang);
    } catch (e) {}

    window.rssHeaderLanguage = lang;
    updateDocumentDirection(lang);

    if (window.RSS_I18N_ENABLED) {
      await loadDictionary(lang);
      applyTranslations(document);
    }

    window.dispatchEvent(new CustomEvent('rss:languageChanged', { detail: { lang } }));
  }

  const RssI18n = {
    init: async function() {
      if (!window.RSS_I18N_ENABLED) return;

      currentLang = detectLanguage();
      updateDocumentDirection(currentLang);
      await loadDictionary(currentLang);
      applyTranslations(document);

      // Observer pour réappliquer sur les éléments injectés dynamiquement avec data-i18n
      const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.hasAttribute('data-i18n') || node.querySelector('[data-i18n]')) {
                applyTranslations(node);
              }
            }
          });
        });
      });

      observer.observe(document.body, { childList: true, subtree: true });
    },
    setLanguage: setLanguage,
    getLanguage: function() { return currentLang; },
    t: translateText,
    apply: applyTranslations,
    SUPPORTED_LANGS: SUPPORTED_LANGS
  };

  window.RssI18n = RssI18n;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => RssI18n.init());
  } else {
    RssI18n.init();
  }
})();

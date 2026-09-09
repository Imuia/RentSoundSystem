/* RentSoundSystem - composants globaux + traduction globale */
if (window.__rssComponentsGlobalBoot) {
  console.warn("RentSoundSystem components.js déjà initialisé.");
} else {
window.__rssComponentsGlobalBoot = true;

/*
 * Feature Flag d'arrêt d'urgence i18n natif.
 * Valeur par défaut en production : false (Weglot / FR natif d'origine actif).
 * Peut être activé via URL (?i18n_preview=1) ou localStorage pour tests isolés.
 */
if (typeof window.RSS_I18N_ENABLED === "undefined") {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("i18n_preview") === "1") {
      window.RSS_I18N_ENABLED = true;
    } else if (localStorage.getItem("rss_i18n_enabled") === "true") {
      window.RSS_I18N_ENABLED = true;
    } else {
      window.RSS_I18N_ENABLED = false;
    }
  } catch (e) {
    window.RSS_I18N_ENABLED = false;
  }
}

const RSS_WEGLOT_API_KEY = "wg_404ba8763ad2fbd7361777eb8a48a0e08";

/* SEO global :
   ajoute la directive robots sur les pages qui n'en ont pas déjà une.
   Une page avec son propre noindex/index spécifique reste prioritaire. */
function ensureGlobalRobotsMeta() {
  if (document.querySelector('meta[name="robots"]')) return;

  const meta = document.createElement("meta");
  meta.setAttribute("name", "robots");
  meta.setAttribute(
    "content",
    "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
  );

  document.head.appendChild(meta);
}


async function loadComponent(id, file) {
  const el = document.getElementById(id);
  if (!el) return;

  el.style.minHeight = id === "header-container" ? "75px" : "300px";

  try {
    const response = await fetch(file, { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const html = await response.text();
    el.innerHTML = html;
    el.style.minHeight = "";

    if (id === "header-container") {
      setTimeout(bindGlobalLanguageSelector, 0);
      setTimeout(syncHeaderLanguageUI, 150);
    }
  } catch (err) {
    console.error("Erreur chargement composant :", file, err);
    el.style.minHeight = "";
  }
}

const RSS_SUPPORTED_LANGUAGES = [
  'fr', 'en', 'es', 'de', 'it', 'pt', 'nl', 'ca', 'pl', 'uk', 'zh', 'ja', 'ar'
];

function rssNormalizeLanguage(value) {
  if (!value) return "fr";
  const clean = String(value).toLowerCase().trim().split('-')[0].split('_')[0];
  return RSS_SUPPORTED_LANGUAGES.includes(clean) ? clean : "fr";
}

function rssSavedLanguage() {
  try {
    return rssNormalizeLanguage(localStorage.getItem("rss_language") || "fr");
  } catch (e) {
    return "fr";
  }
}

function rssSaveLanguage(language) {
  language = rssNormalizeLanguage(language);

  try {
    localStorage.setItem("rss_language", language);
  } catch (e) {}

  document.documentElement.setAttribute("lang", language);
  window.rssHeaderLanguage = language;

  return language;
}

function syncHeaderLanguageUI() {
  const language = rssSavedLanguage();

  document.querySelectorAll("[data-rss-language-label]").forEach((node) => {
    node.textContent = language.toUpperCase();
  });

  document.querySelectorAll("[data-rss-language-flag]").forEach((node) => {
    node.classList.toggle("rss-flag-en", language === "en");
    node.classList.toggle("rss-flag-fr", language !== "en");
  });

  document.querySelectorAll("[data-rss-language-choice]").forEach((button) => {
    const active = button.getAttribute("data-rss-language-choice") === language;
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function closeLanguageMenus() {
  document.querySelectorAll("[data-rss-pref-menu='language']").forEach((menu) => {
    menu.classList.remove("is-open");
  });

  document.querySelectorAll("[data-rss-pref-toggle='language']").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
  });
}

function bindGlobalLanguageSelector() {
  document.querySelectorAll("[data-rss-pref-toggle='language']").forEach((button) => {
    if (button.dataset.rssGlobalLangToggleBound === "1") return;
    button.dataset.rssGlobalLangToggleBound = "1";

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const menuId = button.getAttribute("aria-controls");
      const menu = menuId ? document.getElementById(menuId) : null;
      if (!menu) return;

      const opening = !menu.classList.contains("is-open");
      closeLanguageMenus();

      if (opening) {
        menu.classList.add("is-open");
        button.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.querySelectorAll("[data-rss-language-choice]").forEach((button) => {
    if (button.dataset.rssGlobalLangChoiceBound === "1") return;
    button.dataset.rssGlobalLangChoiceBound = "1";

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const language = rssNormalizeLanguage(
        button.getAttribute("data-rss-language-choice")
      );

      rssSaveLanguage(language);
      syncHeaderLanguageUI();
      closeLanguageMenus();
      rssSwitchWholeSite(language);
    });
  });

  if (!window.__rssGlobalLanguageDocumentBound) {
    window.__rssGlobalLanguageDocumentBound = true;

    document.addEventListener("click", function (event) {
      if (!event.target.closest("[data-rss-pref-toggle='language'], [data-rss-pref-menu='language']")) {
        closeLanguageMenus();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeLanguageMenus();
    });
  }
}

function rssSwitchWholeSite(language) {
  language = rssNormalizeLanguage(language);
  rssSaveLanguage(language);
  syncHeaderLanguageUI();

  if (window.RssI18n && typeof window.RssI18n.setLanguage === "function") {
    window.RssI18n.setLanguage(language);
  }
  return true;
}

function loadScriptIfNeeded(src, checkVar, callback) {
  if (window[checkVar]) {
    if (callback) callback();
    return;
  }
  const script = document.createElement("script");
  script.src = src;
  script.async = true;
  if (callback) script.onload = callback;
  document.head.appendChild(script);
}

async function bootGlobalComponents() {
  ensureGlobalRobotsMeta();
  rssSaveLanguage(rssSavedLanguage());

  // Chargement asynchrone des moteurs autonomes i18n & devises
  loadScriptIfNeeded("/assets/js/rss-i18n.js", "RssI18n");
  loadScriptIfNeeded("/assets/js/rss-currency.js", "RssCurrency");

  await Promise.all([
    loadComponent("header-container", "/header.html"),
    loadComponent("footer-container", "/footer.html")
  ]);

  bindGlobalLanguageSelector();
  syncHeaderLanguageUI();

  setTimeout(function () {
    rssSwitchWholeSite(rssSavedLanguage());
  }, 300);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootGlobalComponents, {
    once: true
  });
} else {
  bootGlobalComponents();
}

}

/* RentSoundSystem - composants globaux + traduction globale */
if (window.__rssComponentsGlobalBoot) {
  console.warn("RentSoundSystem components.js déjà initialisé.");
} else {
window.__rssComponentsGlobalBoot = true;
const RSS_WEGLOT_API_KEY = "wg_404ba8763ad2fbd7361777eb8a48a0e08";

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

function rssNormalizeLanguage(value) {
  return String(value || "").toLowerCase() === "en" ? "en" : "fr";
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

  if (
    window.Weglot &&
    window.Weglot.initialized &&
    typeof window.Weglot.switchTo === "function"
  ) {
    try {
      const current =
        typeof window.Weglot.getCurrentLang === "function"
          ? rssNormalizeLanguage(window.Weglot.getCurrentLang())
          : "";

      if (current !== language) {
        window.Weglot.switchTo(language);
      }

      window.__rssTranslationStatus = "translated-" + language;
      return true;
    } catch (err) {
      console.error("Erreur changement langue Weglot :", err);
    }
  }

  window.__rssPendingLanguage = language;
  return false;
}

function initGlobalWeglot() {
  if (!window.Weglot || window.__rssGlobalWeglotInitialized) return;

  window.__rssGlobalWeglotInitialized = true;

  try {
    window.Weglot.on("initialized", function () {
      window.__rssTranslationStatus = "ready";

      const wanted = window.__rssPendingLanguage || rssSavedLanguage();
      rssSwitchWholeSite(wanted);
    });

    window.Weglot.on("languageChanged", function (language) {
      const normalized = rssSaveLanguage(language);
      syncHeaderLanguageUI();
      window.__rssTranslationStatus = "translated-" + normalized;
    });

    window.Weglot.initialize({
      api_key: RSS_WEGLOT_API_KEY,
      hide_switcher: true,
      cache: true,
      wait_transition: true,
      translate_search: true,
      excluded_blocks: [
        { value: ".rss-preference-controls" },
        { value: ".rss-mobile-preferences" },
        { value: ".material-symbols-outlined" },
        { value: ".StripeElement" },
        { value: "#stripe-card-element" },
        { value: ".leaflet-container" },
        { value: ".notranslate" }
      ]
    });
  } catch (err) {
    window.__rssGlobalWeglotInitialized = false;
    window.__rssTranslationStatus = "init-error";
    console.error("Erreur initialisation Weglot :", err);
  }
}

function loadGlobalWeglot() {
  if (window.Weglot) {
    initGlobalWeglot();
    return;
  }

  const existing = document.querySelector("script[data-rss-global-weglot]");
  if (existing) {
    existing.addEventListener("load", initGlobalWeglot, { once: true });
    return;
  }

  const script = document.createElement("script");
  script.src = "https://cdn.weglot.com/weglot.min.js";
  script.async = true;
  script.dataset.rssGlobalWeglot = "1";

  script.onload = initGlobalWeglot;
  script.onerror = function () {
    window.__rssTranslationStatus = "sdk-error";
    console.error("Impossible de charger Weglot.");
  };

  document.head.appendChild(script);
}

/*
 * IMPORTANT :
 * Weglot est initialisé ici, dans components.js, donc UNE SEULE FOIS
 * pour toute la page. Le header ne sert plus qu'à choisir FR / EN.
 */
async function bootGlobalComponents() {
  rssSaveLanguage(rssSavedLanguage());

  // Démarre la traduction sur le document complet.
  loadGlobalWeglot();

  await Promise.all([
    loadComponent("header-container", "/header.html"),
    loadComponent("footer-container", "/footer.html")
  ]);

  bindGlobalLanguageSelector();
  syncHeaderLanguageUI();

  // Réapplique la langue sauvegardée une fois header/footer injectés.
  setTimeout(function () {
    rssSwitchWholeSite(rssSavedLanguage());
  }, 300);

  setTimeout(function () {
    rssSwitchWholeSite(rssSavedLanguage());
  }, 1200);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootGlobalComponents, {
    once: true
  });
} else {
  bootGlobalComponents();
}

}

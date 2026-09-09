const fs = require('fs');
const path = require('path');

/**
 * Script de pré-génération des pages HTML localisées pour le SEO.
 * Génère les variantes /en/index.html, /es/index.html, etc. avec HTML pré-traduit.
 * Cela garantit que Googlebot et les moteurs de recherche reçoivent du vrai HTML traduit avec hreflang et canonical.
 */

const ROOT_DIR = path.join(__dirname, '..');
const I18N_DIR = path.join(ROOT_DIR, 'i18n');

const PAGES_TO_LOCALIZE = [
  'index.html',
  'catalog.html',
  'demande-de-devis.html',
  'contact.html',
  'faq.html',
  'mentions-legales.html',
  'politique-confidentialite.html',
  'langues.html'
];

const TARGET_LANGS = ['en', 'es', 'de', 'it', 'pt', 'nl', 'ca', 'pl', 'uk', 'zh', 'ja', 'ar'];

function getHrefLangTags(page) {
  const pageName = page === 'index.html' ? '' : page.replace('.html', '');
  let tags = `\n<link rel="alternate" hreflang="fr" href="https://rentsoundsystem.com/${pageName}">\n`;

  TARGET_LANGS.forEach(lang => {
    tags += `<link rel="alternate" hreflang="${lang}" href="https://rentsoundsystem.com/${lang}/${pageName}">\n`;
  });
  tags += `<link rel="alternate" hreflang="x-default" href="https://rentsoundsystem.com/${pageName}">\n`;
  return tags;
}

function buildLocalizedPages() {
  TARGET_LANGS.forEach(lang => {
    const langDir = path.join(ROOT_DIR, lang);
    if (!fs.existsSync(langDir)) {
      fs.mkdirSync(langDir, { recursive: true });
    }

    const dictPath = path.join(I18N_DIR, `${lang}.json`);
    const dictionary = fs.existsSync(dictPath) ? JSON.parse(fs.readFileSync(dictPath, 'utf8')) : {};

    PAGES_TO_LOCALIZE.forEach(page => {
      const srcPath = path.join(ROOT_DIR, page);
      if (!fs.existsSync(srcPath)) return;

      let html = fs.readFileSync(srcPath, 'utf8');

      // 1. Mise à jour de la balise <html lang="...">
      html = html.replace(/<html([^>]*)\blang="[^"]*"/i, `<html$1lang="${lang}"`);
      if (lang === 'ar') {
        html = html.replace(/<html([^>]*)>/i, `<html$1 dir="rtl">`);
      }

      // 2. Injection des hreflang
      const hreflangTags = getHrefLangTags(page);
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${hreflangTags}\n</head>`);
      }

      // 3. Remplacement des textes explicitement marqués data-i18n
      Object.entries(dictionary).forEach(([key, val]) => {
        if (!val) return;
        const escapedVal = String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // data-i18n
        const attrRegex = new RegExp(`(data-i18n=["']${safeKey}["'][^>]*>)([^<]*)(<)`, 'g');
        html = html.replace(attrRegex, `$1${escapedVal}$3`);
      });

      const destPath = path.join(langDir, page);
      fs.writeFileSync(destPath, html, 'utf8');
    });
  });

  console.log(`[build-localized-pages] Variantes HTML localisées prégénérées avec succès pour ${TARGET_LANGS.length} langues.`);
}

buildLocalizedPages();

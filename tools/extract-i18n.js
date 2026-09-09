const fs = require('fs');
const path = require('path');

/**
 * Script d'extraction i18n
 * Scanne les fichiers HTML pour extraire les clés et textes de référence.
 * Génère le dictionnaire de base /i18n/fr.json.
 */

const ROOT_DIR = path.join(__dirname, '..');
const I18N_DIR = path.join(ROOT_DIR, 'i18n');

if (!fs.existsSync(I18N_DIR)) {
  fs.mkdirSync(I18N_DIR, { recursive: true });
}

const HTML_FILES = [
  'index.html',
  'catalog.html',
  'product.html',
  'demande-de-devis.html',
  'contact.html',
  'faq.html',
  'mentions-legales.html',
  'politique-confidentialite.html',
  'header.html',
  'footer.html',
  'devenir-partenaire.html',
  'comment-ca-marche.html',
  'tarifs.html',
  'connexion-inscription.html',
  'langues.html'
];

const extractedKeys = {
  // Navigation & Header
  "nav.rent": "Louer du matériel",
  "nav.quote": "Demande de Devis",
  "nav.cities": "Villes",
  "nav.support": "Assistance",
  "nav.catalog": "Catalogue",
  "nav.auth": "S'inscrire / Connexion",
  "nav.account": "Mon compte",

  // Common UI
  "common.search": "Rechercher",
  "common.search_placeholder": "De quel équipement avez-vous besoin ?",
  "common.location_placeholder": "Ville ou code postal",
  "common.use_my_location": "Utiliser ma position",
  "common.per_day": "Prix / Jour",
  "common.day": "jour",
  "common.see_all": "Voir tout",
  "common.new": "Nouveau",
  "common.available_nearby": "Équipements disponibles autour de vous",
  "common.popular_nearby": "Équipements populaires à proximité",
  "common.new_nearby": "Nouveaux matériels à proximité",
  "common.categories": "Catégories d'équipement",
  "common.view_listing": "Voir l'annonce",

  // Page Titles
  "title.home": "RentSoundSystem | Location Sonorisation Professionnelle, Line Array & Éclairage Événementiel",
  "title.catalog": "Catalogue Matériel Audio & Éclairage Pro | RentSoundSystem",
  "title.languages": "Langues disponibles | RentSoundSystem",

  // Footer
  "footer.rights": "Tous droits réservés.",
  "footer.legal": "Mentions Légales",
  "footer.privacy": "Politique de Confidentialité",
  "footer.languages": "Toutes les langues"
};

function extractFromHtml(filename) {
  const filepath = path.join(ROOT_DIR, filename);
  if (!fs.existsSync(filepath)) return;

  const content = fs.readFileSync(filepath, 'utf8');

  // Regex pour trouver data-i18n="cle"
  const regex = /data-i18n=["']([^"']+)["']/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const key = match[1];
    if (!extractedKeys[key]) {
      extractedKeys[key] = key;
    }
  }
}

HTML_FILES.forEach(extractFromHtml);

const frPath = path.join(I18N_DIR, 'fr.json');
fs.writeFileSync(frPath, JSON.stringify(extractedKeys, null, 2), 'utf8');

console.log(`[extract-i18n] ${Object.keys(extractedKeys).length} clés extraites avec succès dans ${frPath}`);

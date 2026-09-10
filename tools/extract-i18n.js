const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const I18N_DIR = path.join(ROOT_DIR, 'i18n');

if (!fs.existsSync(I18N_DIR)) {
  fs.mkdirSync(I18N_DIR, { recursive: true });
}

const extractedKeys = {
  // Navigation & Header
  "nav.rent": "Louer du matériel",
  "nav.quote": "Demande de Devis",
  "nav.cities": "Villes",
  "nav.support": "Assistance",
  "nav.catalog": "Catalogue",
  "nav.auth": "S'inscrire / Connexion",
  "nav.account": "Mon compte",

  // Home Hero & Sections
  "home.hero_title": "Location de sono et matériel DJ professionnel",
  "home.hero_subtitle": "Louez une sono professionnelle, du matériel DJ, des enceintes, systèmes line array, consoles et éclairages auprès de partenaires vérifiés pour vos soirées, mariages, concerts et événements.",
  "home.new_nearby_subtitle": "Découvrez les dernières annonces publiées autour de votre position ou de la ville sélectionnée.",
  "home.categories_subtitle": "Explorez notre vaste inventaire de matériel de qualité professionnelle pour vos productions les plus exigeantes.",
  "home.bottom_seo_title": "Location de sono et matériel DJ professionnel",
  "home.bottom_seo_text": "RentSoundSystem permet de trouver facilement du matériel de sonorisation professionnel à louer pour une soirée, un mariage, un concert, un festival ou un événement d’entreprise. Comparez les offres de location de sono, enceintes, caissons de basses, platines DJ, consoles, systèmes line array et éclairages proposés par des partenaires vérifiés.",

  // Catalogue & Filtres
  "catalog.title": "Catalogue de Location",
  "catalog.filters": "Filtres",
  "catalog.category": "Catégorie",
  "catalog.daily_rate": "Tarif Journalier",
  "catalog.location": "Lieu",
  "catalog.rental_dates": "Dates de Location",
  "catalog.pickup": "Retrait",
  "catalog.return": "Retour",
  "catalog.clear_filters": "Effacer les Filtres",
  "catalog.sort_by": "Trier par :",
  "catalog.recommended": "Recommandé",
  "catalog.price_asc": "Prix: Croissant",
  "catalog.price_desc": "Prix: Décroissant",
  "catalog.top_rated": "Mieux Noté",
  "catalog.search_placeholder": "Rechercher du matériel...",
  "catalog.view_listing": "Voir l’annonce",
  "catalog.available": "Disponible",

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

  // Catégories
  "cat.headphones": "Casques & écouteurs",
  "cat.dj": "DJ & DJing",
  "cat.event": "Événementiel & production",
  "cat.instruments": "Instruments music",
  "cat.multimedia": "Multimédia & digital",
  "cat.soundlight": "Sonorisation & éclairage",

  // Page Titles
  "title.home": "RentSoundSystem | Location Sonorisation Professionnelle, Line Array & Éclairage Événementiel",
  "title.catalog": "Catalogue Matériel Audio & Éclairage Pro | RentSoundSystem",
  "title.languages": "Langues disponibles | RentSoundSystem",

  // Footer
  "footer.about_text": "La plateforme de référence pour la location de matériel de sonorisation et d'éclairage professionnel entre experts de l'événementiel.",
  "footer.col_marketplace": "Marketplace",
  "footer.col_categories": "Catégories",
  "footer.col_support": "Support",
  "footer.our_brands": "Nos marques",
  "footer.become_partner": "Devenir Partenaire",
  "footer.how_it_works": "Comment ça marche",
  "footer.insurance": "Assurance & Protection",
  "footer.our_process": "Notre Processus",
  "footer.our_solutions": "Nos Solutions",
  "footer.our_rates": "Nos tarifs",
  "footer.rights": "Tous droits réservés.",
  "footer.legal": "Mentions Légales",
  "footer.privacy": "Politique de Confidentialité",
  "footer.languages": "Toutes les langues",
  "footer.help_center": "Centre d'aide",
  "footer.contact_us": "Contactez-nous",
  "footer.terms": "Conditions d'utilisation"
};

const frPath = path.join(I18N_DIR, 'fr.json');
fs.writeFileSync(frPath, JSON.stringify(extractedKeys, null, 2), 'utf8');

console.log(`[extract-i18n] ${Object.keys(extractedKeys).length} clés extraites avec succès dans ${frPath}`);

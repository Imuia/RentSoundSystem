/**
 * RentSoundSystem - Module de gestion multilingue dynamique des fiches produits
 * Permet de basculer en temps réel entre FR, EN (et autres langues supportées)
 * sans rechargement, sans modifier les données de réservation ni les calculs de prix.
 */
(function () {
  'use strict';

  // Dictionnaire des fiches produits connues ayant des versions multilingues spécifiques
  const PRODUCT_TRANSLATIONS = {
    '452': {
      fr: {
        title: '🔊 Location Pack Son JBL – Agadir',
        description: '<p>Profitez d\'un <strong>système de sonorisation professionnel</strong>, à la fois <strong>compact et puissant</strong>, idéal pour vos <strong>soirées privées, sets DJ, cocktails ou événements d\'entreprise à Agadir</strong>. 🎶✨</p>\n' +
          '<h3>🎼 Le pack comprend :</h3>\n' +
          '<p>🔊 <strong>2 × Enceintes Haut/Médium JBL VRX900</strong> – 875 W ×2<br>\n' +
          '🔉 <strong>1 × Caisson de basses JBL</strong> – 800 W<br>\n' +
          '🎧 <strong>Régie DJ Professionnelle</strong> :</p>\n' +
          '<ul>\n' +
          '<li><p>2 × Pioneer CDJ 3000</p></li>\n' +
          '<li><p>1 × Pioneer DJM 900 Nexus 2</p></li>\n' +
          '</ul>\n' +
          '<p>✅ Installation, livraison &amp; technicien inclus<br>\n' +
          '📍 Disponible exclusivement à <strong>Agadir</strong></p>'
      },
      en: {
        title: '🔊 JBL Sound System Pack Rental – Agadir',
        description: '<p>Enjoy a <strong>professional sound system</strong>, both <strong>compact and powerful</strong>, perfect for your <strong>private parties, DJ sets, cocktails, or corporate events in Agadir</strong>. 🎶✨</p>\n' +
          '<h3>🎼 The pack includes:</h3>\n' +
          '<p>🔊 <strong>2 × JBL VRX900 Hi-Mid Speakers</strong> – 875 W ×2<br>\n' +
          '🔉 <strong>1 × JBL Subwoofer</strong> – 800 W<br>\n' +
          '🎧 <strong>Professional DJ Kit</strong>:</p>\n' +
          '<ul>\n' +
          '<li><p>2 × Pioneer CDJ 3000</p></li>\n' +
          '<li><p>1 × Pioneer DJM 900 Nexus 2</p></li>\n' +
          '</ul>\n' +
          '<p>✅ Installation, delivery &amp; technician included<br>\n' +
          '📍 Available exclusively in <strong>Agadir</strong></p>'
      }
    },
    '467': {
      fr: {
        title: '🔊 Location Pack Son JBL – Agadir',
        description: 'Profitez d\'un système de sonorisation professionnel, à la fois compact et puissant, idéal pour vos soirées privées, sets DJ, cocktails ou événements d\'entreprise à Agadir. 🎶✨\n' +
          '🎼 Le pack comprend :\n' +
          '🔊 2 × Enceintes Haut/Médium JBL VRX900 – 875 W ×2\n' +
          '🔉 1 × Caisson de basses JBL – 800 W\n' +
          '🎧 Régie DJ Professionnelle :\n\n' +
          '2 × Pioneer CDJ 3000\n\n' +
          '1 × Pioneer DJM 900 Nexus 2\n\n' +
          '✅ Installation, livraison & technicien inclus\n' +
          '📍 Disponible exclusivement à Agadir'
      },
      en: {
        title: '🔊 JBL Sound System Pack Rental – Agadir',
        description: 'Enjoy a professional sound system, both compact and powerful, perfect for your private parties, DJ sets, cocktails, or corporate events in Agadir. 🎶✨\n' +
          '🎼 The pack includes:\n' +
          '🔊 2 × JBL VRX900 Hi-Mid Speakers – 875 W ×2\n' +
          '🔉 1 × JBL Subwoofer – 800 W\n' +
          '🎧 Professional DJ Kit:\n\n' +
          '2 × Pioneer CDJ 3000\n\n' +
          '1 × Pioneer DJM 900 Nexus 2\n\n' +
          '✅ Installation, delivery & technician included\n' +
          '📍 Available exclusively in Agadir'
      }
    },
    '398': {
      fr: {
        title: 'Location à Casablanca, Maroc – Système Son VOID Acoustics + Kit DJ',
        description: 'Faites de votre événement à Casablanca un moment inoubliable grâce à ce système de sonorisation haut de gamme VOID Acoustics – associant un design emblématique, une puissance remarquable et une clarté sonore haute précision. Que ce soit pour une soirée club, un mariage ou un événement privé, ce système offre une expérience acoustique incomparable.\n\n' +
          'Ce pack haute performance comprend :\n\n' +
          ' 2 x VOID Stasys X Air\n\nDouble caisson de basses passif 18"\n\nPuissance : 2 x 3200W RMS\n\nBasses profondes, nettes et percutantes – idéal pour les grandes salles et pistes de danse\n\n' +
          ' 2 x VOID Air Vantage\n\nEnceintes 2 voies médiums/aigus (500W)\n\nConçues pour les espaces à faible hauteur de plafond, offrant un son précis et détaillé\n\n' +
          ' 2 x VOID Airten V3\n\nEnceintes de diffusion médiums/aigus haut de gamme\n\nRéponse linéaire optimisée, clarté améliorée et moteurs HF 1.4" pour des hautes fréquences précises et douces\n\n' +
          ' Régie DJ complète incluse :\n\n2 x Pioneer CDJ 3000\n\n1 x Pioneer DJM 900 Nexus\n\n' +
          'La série Air de VOID est mondialement reconnue pour son élégance esthétique et ses performances sonores supérieures. Idéal pour DJs, événements prestigieux et professionnels exigeants.\n\n' +
          '- Disponible à la location sur Casablanca et sa région\n' +
          '- Idéal pour clubs, mariages, événements privés, rooftops & festivals\n' +
          '- Livraison, installation et régisseur son disponibles sur demande'
      },
      en: {
        title: 'VOID Acoustics Sound System + DJ Kit Rental in Casablanca, Morocco',
        description: 'Make your event in Casablanca stand out with a premium VOID Acoustics sound system – combining iconic design, unmatched power, and crystal-clear audio precision. Whether it\'s for a club night, wedding, or private party, this system delivers an unforgettable sonic experience.\n\n' +
          'This high-performance package includes:\n\n' +
          ' 2 x VOID Stasys X Air\n\nDual 18" passive subwoofers\n\nPower: 2 x 3200W RMS\n\nDeep, clean, and punchy bass – ideal for large venues and dancefloors\n\n' +
          ' 2 x VOID Air Vantage\n\n2-way mid-high speakers (500W)\n\nDesigned for low-ceiling venues, offering tight and detailed sound\n\n' +
          ' 2 x VOID Airten V3\n\nPremium mid-high loudspeakers\n\nEnhanced linear response, improved clarity, and upgraded 1.4" HF drivers for smooth and accurate high frequencies\n\n' +
          ' Complete DJ Kit Included:\n\n2 x Pioneer CDJ 3000\n\n1 x Pioneer DJM 900 Nexus\n\n' +
          'VOID’s Air Series is known worldwide for delivering aesthetic elegance and superior sound quality. This system is as visually striking as it is sonically impressive — ideal for DJs, luxury events, and discerning audio professionals.\n\n' +
          '- Available for rental in Casablanca and nearby areas\n' +
          '- Perfect for clubs, weddings, private events, rooftops & festivals\n' +
          '- Delivery, setup, and sound technician available upon request'
      }
    }
  };

  // Vocabulaire d'interface produit multilingue
  const UI_STRINGS = {
    fr: {
      'overview': 'Aperçu',
      'specs': 'Spécifications techniques',
      'included': 'Inclus',
      'included_in_rental': 'Inclus dans la location',
      'speakers': 'Enceintes',
      'amplification': 'Amplification',
      'base_rate': 'Tarif de base',
      'per_day': '/ jour',
      'rental_dates': 'Dates de location',
      'click_to_select_dates': 'Cliquez sur une ou plusieurs dates pour les sélectionner.',
      'delivery_fee': 'Frais de livraison',
      'technical_installation': 'Installation technique',
      'total': 'Total :',
      'book_now': 'Réserver maintenant',
      'request_quote': 'Faire une demande de devis',
      'contact_partner': 'Contacter le partenaire',
      'view_profile': 'Voir le profil',
      'added_by': 'Ajouté par',
      'complementary_accessories': 'Accessoires Complémentaires',
      'see_listing': 'Voir l\'annonce',
      'loading_related': 'Chargement des annonces complémentaires...',
      'date_required': 'Veuillez sélectionner au moins une date de location avant de réserver.',
      'date_past': 'Date passée indisponible',
      'select_date': 'Sélectionner cette date',
      'selected_dates': 'Dates sélectionnées : ',
      'inventory_breadcrumb': 'Inventaire',
      'partner_desc_default': 'Partenaire RentSoundSystem spécialisé dans la location de matériel événementiel professionnel.',
      'main_item_from_listing': 'Matériel principal selon l’annonce',
      'basic_cabling_if_specified': 'Câblage de base si précisé par le loueur',
      'functional_check_on_pickup': 'Vérification fonctionnelle au retrait',
      'delivery_install_options': 'Options livraison et installation disponibles',
      'headphones_qty_from_listing': 'Casques audio selon quantité indiquée dans l’annonce',
      'uhf_transmitter_from_listing': 'Émetteur UHF / base selon configuration loueur',
      'functional_check_before_pickup': 'Vérification fonctionnelle avant retrait',
      'months': ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'],
      'days_of_week': ['Di','Lu','Ma','Me','Je','Ve','Sa'],
      // Tech field labels
      'tech.type': 'Type',
      'tech.brand_model': 'Marque / modèle',
      'tech.application': 'Application',
      'tech.configuration': 'Configuration',
      'tech.connectivity': 'Connectique',
      'tech.location': 'Localisation',
      'tech.category': 'Catégorie',
      'tech.daily_rate': 'Tarif journalier',
      'tech.power': 'Puissance',
      'tech.frequency_response': 'Réponse en fréquence',
      'tech.range': 'Portée',
      'tech.quantity': 'Quantité',
      'tech.condition': 'État',
      'tech.uhf_channels': 'Canaux UHF',
      'tech.transmission': 'Transmission',
      'tech.autonomy': 'Autonomie',
      'tech.included_pack': 'Inclus pack',
      'tech.lighting_control': 'Pilotage',
      'tech.lighting_source': 'Source',
      'tech.mid_high': 'Médiums-Aigus',
      'tech.subwoofers': 'Caissons de basses',
      'tech.place': 'Lieu',
      'tech.info': 'Info',
      // Tech values
      'tech_val.silent_disco': 'Silent Disco / casques audio',
      'tech_val.headphone_kit': 'Kit casques audio',
      'tech_val.uhf_channels_default': '1 ou 2 canaux',
      'tech_val.uhf_wireless_default': 'Sans fil selon annonce',
      'tech_val.as_per_listing': 'Selon annonce',
      'tech_val.headphones_accessories': 'Casques + accessoires selon annonce',
      'tech_val.dj_mixing': 'Régie DJ / matériel de mixage',
      'tech_val.dj_application': 'DJ set, club, festival, événement privé ou corporate',
      'tech_val.scenic_lighting': 'Éclairage scénique',
      'tech_val.lighting_application': 'Show lumière, scène, club, événementiel',
      'tech_val.general_application': 'Concerts, clubs, DJ sets, soirées privées et événements corporate',
      'tech_val.line_array_system': 'Système line array',
      'tech_val.pro_system_as_per_listing': 'Système professionnel selon annonce',
      'tech_val.as_per_owner': 'Selon disponibilité loueur',
      'tech_val.city_unspecified': 'Ville non précisée'
    },
    en: {
      'overview': 'Overview',
      'specs': 'Technical specifications',
      'included': 'Included',
      'included_in_rental': 'Included in rental',
      'speakers': 'Speakers',
      'amplification': 'Amplification',
      'base_rate': 'Base rate',
      'per_day': '/ day',
      'rental_dates': 'Rental dates',
      'click_to_select_dates': 'Click on one or more dates to select them.',
      'delivery_fee': 'Delivery fee',
      'technical_installation': 'Technical setup',
      'total': 'Total:',
      'book_now': 'Book now',
      'request_quote': 'Request a quote',
      'contact_partner': 'Contact partner',
      'view_profile': 'View profile',
      'added_by': 'Added by',
      'complementary_accessories': 'Complementary Accessories',
      'see_listing': 'View listing',
      'loading_related': 'Loading complementary equipment...',
      'date_required': 'Please select at least one rental date before booking.',
      'date_past': 'Past date unavailable',
      'select_date': 'Select this date',
      'selected_dates': 'Selected dates: ',
      'inventory_breadcrumb': 'Inventory',
      'partner_desc_default': 'RentSoundSystem verified partner specialized in professional event equipment rental.',
      'main_item_from_listing': 'Main equipment as described in the listing',
      'basic_cabling_if_specified': 'Standard cables if provided by the owner',
      'functional_check_on_pickup': 'Functional verification upon pickup',
      'delivery_install_options': 'Delivery and installation options available',
      'headphones_qty_from_listing': 'Audio headphones according to quantity stated in listing',
      'uhf_transmitter_from_listing': 'UHF transmitter / base station per rental setup',
      'functional_check_before_pickup': 'Functional check prior to handover',
      'months': ['January','February','March','April','May','June','July','August','September','October','November','December'],
      'days_of_week': ['Su','Mo','Tu','We','Th','Fr','Sa'],
      // Tech field labels
      'tech.type': 'Type',
      'tech.brand_model': 'Brand / model',
      'tech.application': 'Application',
      'tech.configuration': 'Configuration',
      'tech.connectivity': 'Connectivity',
      'tech.location': 'Location',
      'tech.category': 'Category',
      'tech.daily_rate': 'Daily rate',
      'tech.power': 'Power',
      'tech.frequency_response': 'Frequency response',
      'tech.range': 'Range',
      'tech.quantity': 'Quantity',
      'tech.condition': 'Condition',
      'tech.uhf_channels': 'UHF channels',
      'tech.transmission': 'Transmission',
      'tech.autonomy': 'Battery life',
      'tech.included_pack': 'Pack included',
      'tech.lighting_control': 'Control',
      'tech.lighting_source': 'Light source',
      'tech.mid_high': 'Mids-Highs',
      'tech.subwoofers': 'Subwoofers',
      'tech.place': 'Location',
      'tech.info': 'Info',
      // Tech values
      'tech_val.silent_disco': 'Silent Disco / audio headphones',
      'tech_val.headphone_kit': 'Audio headphone kit',
      'tech_val.uhf_channels_default': '1 or 2 channels',
      'tech_val.uhf_wireless_default': 'Wireless per listing details',
      'tech_val.as_per_listing': 'As stated in listing',
      'tech_val.headphones_accessories': 'Headphones + accessories per listing',
      'tech_val.dj_mixing': 'DJ Booth / mixing console',
      'tech_val.dj_application': 'DJ set, club, festival, private or corporate event',
      'tech_val.scenic_lighting': 'Stage & scenic lighting',
      'tech_val.lighting_application': 'Light show, stage, club, event production',
      'tech_val.general_application': 'Concerts, clubs, DJ sets, private parties & corporate events',
      'tech_val.line_array_system': 'Line array system',
      'tech_val.pro_system_as_per_listing': 'Professional system per listing',
      'tech_val.as_per_owner': 'Subject to owner availability',
      'tech_val.city_unspecified': 'City not specified'
    }
  };

  /**
   * Retourne la langue active normalisée
   */
  function getActiveLanguage() {
    if (window.RssI18n && typeof window.RssI18n.getLanguage === 'function') {
      const l = window.RssI18n.getLanguage();
      if (l) return l === 'en' ? 'en' : 'fr';
    }

    try {
      const saved = localStorage.getItem('rss_language');
      if (saved === 'en') return 'en';
    } catch (e) {}

    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length > 0 && parts[0].toLowerCase() === 'en') return 'en';

    return 'fr';
  }

  /**
   * Retourne une chaîne d'interface traduite
   */
  function t(key, fallback) {
    const lang = getActiveLanguage();
    const dict = UI_STRINGS[lang] || UI_STRINGS.fr;
    return dict[key] || (UI_STRINGS.fr && UI_STRINGS.fr[key]) || fallback || key;
  }

  /**
   * Résout le titre et la description d'un item selon la langue active
   */
  function resolveLocalizedProduct(item, targetLang) {
    if (!item) return { title: '', description: '' };
    const lang = targetLang || getActiveLanguage();
    const origId = String(item.original_id ?? item.id ?? '');

    // 1. Colonnes Supabase dédiées si présentes
    const titleKey = lang === 'en' ? 'title_en' : 'title_fr';
    const descKey = lang === 'en' ? 'description_en' : 'description_fr';

    let resolvedTitle = item[titleKey];
    let resolvedDesc = item[descKey];

    // 2. Dictionnaire localisé codifié (pour 452, 467, 398 et futures annonces)
    if ((!resolvedTitle || !resolvedDesc) && PRODUCT_TRANSLATIONS[origId]) {
      const entry = PRODUCT_TRANSLATIONS[origId][lang];
      if (entry) {
        if (!resolvedTitle) resolvedTitle = entry.title;
        if (!resolvedDesc) resolvedDesc = entry.description;
      }
    }

    // 3. Fallback FR obligatoire pour éviter l'anglais sauvage sur page FR
    if (lang === 'fr') {
      if (!resolvedTitle) {
        // Si le titre original est francophone ou standard, on l'utilise
        resolvedTitle = item.title_fr || item.title;
      }
      if (!resolvedDesc) {
        resolvedDesc = item.description_fr || item.description;
      }
    } else if (lang === 'en') {
      // Si aucune version anglaise n'existe pour ce produit, fallback propre sur la version originale / FR
      if (!resolvedTitle) resolvedTitle = item.title_fr || item.title;
      if (!resolvedDesc) resolvedDesc = item.description_fr || item.description;
    }

    return {
      title: resolvedTitle || item.title || '',
      description: resolvedDesc || item.description || ''
    };
  }

  window.RssProductI18n = {
    getActiveLanguage: getActiveLanguage,
    t: t,
    resolveLocalizedProduct: resolveLocalizedProduct,
    UI_STRINGS: UI_STRINGS,
    PRODUCT_TRANSLATIONS: PRODUCT_TRANSLATIONS
  };
})();

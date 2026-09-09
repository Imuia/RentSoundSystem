const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Script de traduction automatique sécurisé (Backend / Build)
 * Utilise la variable d'environnement OPENAI_API_KEY.
 * Aucune clé d'API ne sera exposée au client ou dans Git.
 * Si OPENAI_API_KEY est absente, bascule sur les dictionnaires locaux prédéfinis.
 */

const ROOT_DIR = path.join(__dirname, '..');
const I18N_DIR = path.join(ROOT_DIR, 'i18n');
const FR_PATH = path.join(I18N_DIR, 'fr.json');

if (!fs.existsSync(FR_PATH)) {
  console.error("[auto-translate] /i18n/fr.json introuvable. Exécutez d'abord extract-i18n.js");
  process.exit(1);
}

const frData = JSON.parse(fs.readFileSync(FR_PATH, 'utf8'));

const TARGET_LANGS = {
  en: "English (US)",
  es: "Spanish",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  nl: "Dutch",
  ca: "Catalan",
  pl: "Polish",
  uk: "Ukrainian",
  zh: "Chinese (Simplified)",
  ja: "Japanese",
  ar: "Arabic"
};

// Traductions fallbacks immédiates si pas de clé API OpenAI lors du build
const FALLBACK_TRANSLATIONS = {
  en: {
    "nav.rent": "Rent equipment",
    "nav.quote": "Request a Quote",
    "nav.cities": "Cities",
    "nav.support": "Support",
    "nav.catalog": "Catalog",
    "nav.auth": "Register / Sign in",
    "nav.account": "My account",
    "common.search": "Search",
    "common.search_placeholder": "What equipment do you need?",
    "common.location_placeholder": "City or postal code",
    "common.use_my_location": "Use my location",
    "common.per_day": "Price / Day",
    "common.day": "day",
    "common.see_all": "See all",
    "common.new": "New",
    "common.available_nearby": "Equipment available near you",
    "common.popular_nearby": "Popular equipment nearby",
    "common.new_nearby": "New equipment nearby",
    "common.categories": "Equipment categories",
    "common.view_listing": "View listing",
    "title.home": "RentSoundSystem | Professional Sound System, Line Array & Event Lighting Rental",
    "title.catalog": "Pro Audio & Lighting Equipment Catalog | RentSoundSystem",
    "title.languages": "Available Languages | RentSoundSystem",
    "footer.rights": "All rights reserved.",
    "footer.legal": "Legal Mentions",
    "footer.privacy": "Privacy Policy",
    "footer.languages": "All languages"
  },
  es: {
    "nav.rent": "Alquilar equipo",
    "nav.quote": "Solicitar presupuesto",
    "nav.cities": "Ciudades",
    "nav.support": "Asistencia",
    "nav.catalog": "Catálogo",
    "nav.auth": "Registrarse / Iniciar sesión",
    "nav.account": "Mi cuenta",
    "common.search": "Buscar",
    "common.search_placeholder": "¿Qué equipo necesitas?",
    "common.location_placeholder": "Ciudad o código postal",
    "common.use_my_location": "Usar mi ubicación",
    "common.per_day": "Precio / Día",
    "common.day": "día",
    "common.see_all": "Ver todo",
    "common.new": "Nuevo",
    "common.available_nearby": "Equipos disponibles cerca de ti",
    "common.popular_nearby": "Equipos populares cerca",
    "common.new_nearby": "Nuevos equipos cerca",
    "common.categories": "Categorías de equipos",
    "common.view_listing": "Ver anuncio",
    "title.home": "RentSoundSystem | Alquiler de Sonido Profesional, Line Array e Iluminación",
    "title.catalog": "Catálogo de Equipos de Audio e Iluminación Pro | RentSoundSystem",
    "title.languages": "Idiomas disponibles | RentSoundSystem",
    "footer.rights": "Todos los derechos reservados.",
    "footer.legal": "Aviso legal",
    "footer.privacy": "Política de privacidad",
    "footer.languages": "Todos los idiomas"
  }
};

async function translateWithOpenAI(targetLangCode, targetLangName) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log(`[auto-translate] OPENAI_API_KEY absente. Utilisation des traductions fallbacks pour ${targetLangCode}.`);
    return FALLBACK_TRANSLATIONS[targetLangCode] || frData;
  }

  const prompt = `You are a professional translator for a pro audio and lighting rental marketplace (RentSoundSystem).
Translate the following JSON key-value object from French to ${targetLangName}.
Keep technical audio terms accurate (e.g. Line Array, DJ, Shure, Pioneer, L-Acoustics).
Return ONLY a valid JSON object matching the input keys.

JSON to translate:
${JSON.stringify(frData, null, 2)}`;

  try {
    const responseText = await callOpenAI(apiKey, prompt);
    const cleaned = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn(`[auto-translate] Échec API OpenAI pour ${targetLangCode}. Fallback local.`, e.message);
    return FALLBACK_TRANSLATIONS[targetLangCode] || frData;
  }
}

function callOpenAI(apiKey, prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });

    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.choices && parsed.choices[0] && parsed.choices[0].message) {
            resolve(parsed.choices[0].message.content);
          } else {
            reject(new Error(data));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function generateLanguageFiles() {
  for (const [code, name] of Object.entries(TARGET_LANGS)) {
    const filePath = path.join(I18N_DIR, `${code}.json`);
    console.log(`[auto-translate] Génération de ${code}.json (${name})...`);

    const translatedData = await translateWithOpenAI(code, name);
    fs.writeFileSync(filePath, JSON.stringify(translatedData, null, 2), 'utf8');
  }
  console.log("[auto-translate] Génération de tous les fichiers i18n terminée avec succès.");
}

generateLanguageFiles();

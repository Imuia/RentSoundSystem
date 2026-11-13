const SUPABASE_URL = process.env.SUPABASE_URL || 'https://crxofkxinsspfgdsxpiy.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj';

async function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (_) { return {}; }
  }
  return req.body;
}

async function requireUser(req) {
  const authorization = String(req.headers.authorization || '');
  if (!authorization.startsWith('Bearer ')) return null;

  const response = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authorization
    }
  });

  if (!response.ok) return null;
  return response.json();
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
}

function safeError(error) {
  return String(error?.message || error || 'Erreur inconnue').slice(0, 500);
}

function component(components, types) {
  const item = (components || []).find((entry) =>
    (entry.types || []).some((type) => types.includes(type))
  );
  return item?.longText || '';
}

async function autocomplete(req, res, body) {
  const input = String(body.input || '').trim().slice(0, 200);
  const sessionToken = String(body.sessionToken || '').trim().slice(0, 120);
  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || '').trim();

  if (input.length < 3) return res.status(200).json({ suggestions: [] });
  if (!sessionToken) return res.status(400).json({ error: 'Session de recherche manquante.' });
  if (!apiKey) return res.status(503).json({ error: 'Google Maps n’est pas configuré sur Vercel.' });

  const googleResponse = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat'
    },
    body: JSON.stringify({
      input,
      sessionToken,
      languageCode: 'fr',
      includeQueryPredictions: false
    })
  });

  const googleData = await googleResponse.json().catch(() => ({}));
  if (!googleResponse.ok) {
    console.error('Google autocomplete:', googleData);
    return res.status(502).json({ error: 'Recherche Google Maps indisponible.' });
  }

  const suggestions = (googleData.suggestions || [])
    .map((item) => item.placePrediction)
    .filter(Boolean)
    .map((prediction) => ({
      placeId: prediction.placeId || '',
      description: prediction.text?.text || '',
      primaryText: prediction.structuredFormat?.mainText?.text || prediction.text?.text || '',
      secondaryText: prediction.structuredFormat?.secondaryText?.text || ''
    }))
    .filter((item) => item.placeId && item.description)
    .slice(0, 5);

  return res.status(200).json({ suggestions });
}

async function placeDetails(req, res, body) {
  const placeId = String(body.placeId || '').trim().slice(0, 250);
  const sessionToken = String(body.sessionToken || '').trim().slice(0, 120);
  const apiKey = String(process.env.GOOGLE_MAPS_API_KEY || '').trim();

  if (!placeId) return res.status(400).json({ error: 'Adresse sélectionnée manquante.' });
  if (!sessionToken) return res.status(400).json({ error: 'Session de recherche manquante.' });
  if (!apiKey) return res.status(503).json({ error: 'Google Maps n’est pas configuré sur Vercel.' });

  const url = 'https://places.googleapis.com/v1/places/' +
    encodeURIComponent(placeId) +
    '?sessionToken=' + encodeURIComponent(sessionToken) +
    '&languageCode=fr';

  const googleResponse = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,formattedAddress,addressComponents,location'
    }
  });

  const place = await googleResponse.json().catch(() => ({}));
  if (!googleResponse.ok) {
    console.error('Google place details:', place);
    return res.status(502).json({ error: 'Validation de l’adresse indisponible.' });
  }

  const components = place.addressComponents || [];
  const city = component(components, ['locality']) ||
    component(components, ['postal_town']) ||
    component(components, ['administrative_area_level_3']) ||
    component(components, ['administrative_area_level_2']);
  const country = component(components, ['country']);
  const postalCode = component(components, ['postal_code']);

  return res.status(200).json({
    placeId: place.id || placeId,
    formattedAddress: place.formattedAddress || '',
    address: place.formattedAddress || '',
    city,
    country,
    postalCode,
    latitude: place.location?.latitude ?? null,
    longitude: place.location?.longitude ?? null
  });
}

module.exports = async function handler(req, res) {
  noStore(res);

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  const mode = String(req.query?.mode || '');
  if (mode !== 'autocomplete' && mode !== 'place') {
    return res.status(400).json({ error: 'Mode Google Maps invalide.' });
  }

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Connexion requise.' });

    const body = await readBody(req);
    if (mode === 'autocomplete') {
      return await autocomplete(req, res, body);
    }
    return await placeDetails(req, res, body);
  } catch (error) {
    console.error('maps endpoint:', error);
    return res.status(500).json({ error: safeError(error) });
  }
};

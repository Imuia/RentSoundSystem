const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-5.6-luna';

function extractOutputText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();

  const chunks = [];
  for (const item of data?.output || []) {
    for (const part of item?.content || []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text);
      else if (typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('\n').trim();
}

function parseJsonText(text) {
  if (!text) throw new Error('Réponse IA vide.');
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Réponse IA non exploitable.');
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: 'OPENAI_API_KEY absente dans les variables Vercel.'
    });
  }

  try {
    const body = req.body || {};
    const campaignName = String(body.campaignName || '').slice(0, 180);
    const productName = String(body.product?.name || 'Gamme Shure Axient Digital').slice(0, 180);
    const productDescription = String(body.product?.description || '').slice(0, 240);
    const audiences = Array.isArray(body.audiences) ? body.audiences.slice(0, 8).map(String) : [];
    const platforms = Array.isArray(body.platforms) ? body.platforms.slice(0, 4).map(String) : [];
    const tone = String(body.tone || 'Stabilité & Fiabilité Absolue').slice(0, 160);
    const target = ['all', 'instagram', 'linkedin'].includes(body.target) ? body.target : 'all';

    if (!audiences.length) return res.status(400).json({ error: 'Audience cible manquante.' });
    if (!platforms.length) return res.status(400).json({ error: 'Plateforme sociale manquante.' });

    const systemPrompt = [
      'Tu es le studio éditorial professionnel de RentSoundSystem.',
      'Tu rédiges en français des contenus B2B crédibles pour la location de matériel audio professionnel.',
      'Le ton doit être premium, précis, concret et sans promesse non vérifiable.',
      'Ne prétends jamais qu’un produit est disponible, en stock, certifié ou garanti si cette information n’est pas fournie.',
      'Conserve exactement les noms de marque et de modèle.',
      'Retourne uniquement un JSON valide, sans markdown ni commentaire.',
      'Schéma obligatoire : {"instagram":"texte","linkedin":{"title":"titre","body":"texte"}}.'
    ].join(' ');

    const userPrompt = [
      `Campagne : ${campaignName || 'Campagne Shure'}`,
      `Produit : ${productName}`,
      `Description produit : ${productDescription || 'non précisée'}`,
      `Audience : ${audiences.join(', ')}`,
      `Plateformes sélectionnées : ${platforms.join(', ')}`,
      `Axe de communication : ${tone}`,
      `Cible de régénération : ${target}`,
      '',
      'Instagram : 90 à 150 mots, lisible, 4 à 7 hashtags pertinents.',
      'LinkedIn : un titre court puis 130 à 220 mots, style professionnel.',
      'Évite les formulations génériques et les superlatifs invérifiables.'
    ].join('\n');

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_output_tokens: 1400
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      const message = data?.error?.message || `Erreur OpenAI HTTP ${openaiResponse.status}`;
      return res.status(502).json({ error: message });
    }

    const generated = parseJsonText(extractOutputText(data));

    return res.status(200).json({
      instagram: String(generated.instagram || '').trim(),
      linkedin: {
        title: String(generated.linkedin?.title || '').trim(),
        body: String(generated.linkedin?.body || '').trim()
      },
      model: DEFAULT_MODEL
    });
  } catch (error) {
    console.error('[Studio IA]', error);
    return res.status(500).json({ error: error?.message || 'Erreur interne Studio IA.' });
  }
}

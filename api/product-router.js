const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  'https://crxofkxinsspfgdsxpiy.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method Not Allowed');
  }

  const originalId = Array.isArray(req.query.original_id)
    ? req.query.original_id[0]
    : req.query.original_id;

  const productId = Array.isArray(req.query.id)
    ? req.query.id[0]
    : req.query.id;

  let query = supabase
    .from('listings')
    .select('id, original_id, status')
    .eq('status', 'publish');

  if (originalId !== undefined && originalId !== '') {
    if (!/^\d+$/.test(String(originalId))) {
      return res.status(404).send('Produit introuvable');
    }
    query = query.eq('original_id', Number(originalId));
  } else if (productId !== undefined && productId !== '') {
    query = query.eq('id', String(productId));
  } else {
    return res.status(404).send('Produit introuvable');
  }

  let result;
  try {
    result = await query.maybeSingle();
  } catch (error) {
    console.error('product-router Supabase exception:', error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send('Service temporairement indisponible');
  }

  if (result.error) {
    console.error('product-router Supabase error:', result.error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).send('Service temporairement indisponible');
  }

  if (!result.data) {
    // A missing published result does not prove permanent deletion.
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(404).send('Produit introuvable');
  }

  const productHtmlPath = path.join(process.cwd(), 'product.html');
  if (!fs.existsSync(productHtmlPath)) {
    console.error('product-router: product.html is missing');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send('Page produit indisponible');
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

  if (req.method === 'HEAD') {
    return res.status(200).end();
  }

  return res.status(200).send(fs.readFileSync(productHtmlPath, 'utf8'));
};

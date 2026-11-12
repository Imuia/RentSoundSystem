const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://crxofkxinsspfgdsxpiy.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

module.exports = async function handler(req, res) {
  const { original_id, id } = req.query;

  let query = supabase.from('listings').select('id, original_id, status').eq('status', 'publish');
  if (original_id && !isNaN(Number(original_id))) {
    query = query.eq('original_id', Number(original_id)).maybeSingle();
  } else if (id) {
    query = query.eq('id', id).maybeSingle();
  } else {
    query = null;
  }

  let item = null;
  if (query) {
    const { data } = await query;
    item = data;
  }

  if (!item) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(410);
    const notFoundHtmlPath = path.join(process.cwd(), '404.html');
    if (fs.existsSync(notFoundHtmlPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(fs.readFileSync(notFoundHtmlPath, 'utf8'));
    }
    return res.send('Page non trouvée ou définitivement supprimée (410)');
  }

  // Active product exists: serve product.html with HTTP 200
  const productHtmlPath = path.join(process.cwd(), 'product.html');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  return res.status(200).send(fs.readFileSync(productHtmlPath, 'utf8'));
};

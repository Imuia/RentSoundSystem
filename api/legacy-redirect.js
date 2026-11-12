module.exports = function handler(req, res) {
  let slug = req.query && (req.query.slug || req.query.path);
  if (!slug && req.url) {
    const urlMatch = req.url.match(/\/louer-([^/?#]+)/);
    if (urlMatch) {
      slug = urlMatch[1];
    }
  }

  if (!slug) {
    res.statusCode = 404;
    return res.end('Not Found');
  }

  // Expression régulière stricte : capture le slug (avec tirets multiples)
  // et l'identifiant numérique situé exclusivement en fin de chaîne
  const match = String(slug).trim().match(/^(.+)-(\d+)$/);
  if (match) {
    const productSlug = match[1];
    const originalId = match[2];
    const targetUrl = `/produit/${originalId}/${productSlug}`;

    // Redirection HTTP 301 permanente
    if (typeof res.redirect === 'function') {
      return res.redirect(301, targetUrl);
    }
    res.setHeader('Location', targetUrl);
    res.statusCode = 301;
    return res.end();
  }

  res.statusCode = 404;
  return res.end('Not Found');
};

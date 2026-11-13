/**
 * RentSoundSystem — réponses HTTP 410 pour les anciens profils supprimés.
 * Route appelée uniquement par les réécritures exactes de vercel.json.
 * Aucun accès Supabase/Stripe et aucune modification des autres API.
 */
const DELETED_PROFILES = new Set([
  'fr/utilisateur/258',
  'fr/utilisateur/778',
  'fr/utilisateur/295',
  'fr/utilisateur/858',
  'en/utilisateur/66',
  'en/utilisateur/867',
  'en/utilisateur/271',
]);

module.exports = (req, res) => {
  const pathname = new URL(req.url, 'https://rentsoundsystem.com').pathname
    .replace(/^\/+|\/+$/g, '');

  if (!DELETED_PROFILES.has(pathname)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).send('Not Found');
  }

  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(410).send(`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="robots" content="noindex, nofollow">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Profil supprimé | RentSoundSystem</title>
</head>
<body>
  <main>
    <h1>Ce profil n’est plus disponible</h1>
    <p>Ce profil a été définitivement supprimé.</p>
    <p><a href="/">Retour à RentSoundSystem</a></p>
  </main>
</body>
</html>`);
};

RentSoundSystem - Correctif clés Stripe Connect

Les deux endpoints Connect utilisent maintenant :
STRIPE_CONNECT_SECRET_KEY

Ils n'utilisent plus :
STRIPE_SECRET_KEY

Aucun fichier de paiement client, caution ou webhook n'est modifié.

Fichiers :
- onboarding-link.js
- status.js

Après remplacement, redéployer Vercel puis tester :
Mon profil partenaire -> Confirmer les paiements.

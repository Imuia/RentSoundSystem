-- ==============================================================================
-- Migration SQL Additive et Réversible : Gestion Multilingue des Fiches Produits
-- RentSoundSystem - Supabase
-- Table cible : public.listings
-- ==============================================================================

-- 1. Ajout additif des colonnes multilingues
ALTER TABLE IF EXISTS public.listings
  ADD COLUMN IF NOT EXISTS title_fr TEXT,
  ADD COLUMN IF NOT EXISTS title_en TEXT,
  ADD COLUMN IF NOT EXISTS description_fr TEXT,
  ADD COLUMN IF NOT EXISTS description_en TEXT,
  ADD COLUMN IF NOT EXISTS features_fr TEXT,
  ADD COLUMN IF NOT EXISTS features_en TEXT,
  ADD COLUMN IF NOT EXISTS included_fr TEXT,
  ADD COLUMN IF NOT EXISTS included_en TEXT;

-- 2. Initialisation des annonces rédigées originellement en français
--    Par défaut, on préserve le contenu original dans les colonnes FR
UPDATE public.listings
SET
  title_fr = COALESCE(title_fr, title),
  description_fr = COALESCE(description_fr, description)
WHERE original_id NOT IN (452, 467, 398);

-- 3. Gestion spécifique des annonces dont la description d'origine était en anglais
-- Annonce 452 : Location Pack Son JBL – Agadir
UPDATE public.listings
SET
  title_fr = '🔊 Location Pack Son JBL – Agadir',
  title_en = '🔊 JBL Sound System Pack Rental – Agadir',
  description_en = COALESCE(description_en, description),
  description_fr = '<p>Profitez d''un <strong>système de sonorisation professionnel</strong>, à la fois <strong>compact et puissant</strong>, idéal pour vos <strong>soirées privées, sets DJ, cocktails ou événements d''entreprise à Agadir</strong>. 🎶✨</p>
<h3>🎼 Le pack comprend :</h3>
<p>🔊 <strong>2 × Enceintes Haut/Médium JBL VRX900</strong> – 875 W ×2<br>
🔉 <strong>1 × Caisson de basses JBL</strong> – 800 W<br>
🎧 <strong>Régie DJ Professionnelle</strong> :</p>
<ul>
<li><p>2 × Pioneer CDJ 3000</p></li>
<li><p>1 × Pioneer DJM 900 Nexus 2</p></li>
</ul>
<p>✅ Installation, livraison &amp; technicien inclus<br>
📍 Disponible exclusivement à <strong>Agadir</strong></p>',
  features_fr = 'Système JBL VRX900 compact & puissant, caisson de basses 800W, régie DJ Pioneer CDJ 3000 + DJM 900 Nexus 2',
  features_en = 'JBL VRX900 sound system compact & powerful, 800W subwoofer, Pioneer DJ kit CDJ 3000 + DJM 900 Nexus 2',
  included_fr = '2 Enceintes JBL VRX900, 1 Caisson de basses JBL, 2 Pioneer CDJ 3000, 1 Pioneer DJM 900 Nexus 2, Câblage, Livraison, Installation & Technicien',
  included_en = '2 JBL VRX900 Speakers, 1 JBL Subwoofer, 2 Pioneer CDJ 3000, 1 Pioneer DJM 900 Nexus 2, Cables, Delivery, Setup & Sound Technician'
WHERE original_id = 452;

-- Annonce 467 : Location Pack Son JBL – Agadir (variante texte brut)
UPDATE public.listings
SET
  title_fr = '🔊 Location Pack Son JBL – Agadir',
  title_en = '🔊 JBL Sound System Pack Rental – Agadir',
  description_en = COALESCE(description_en, description),
  description_fr = 'Profitez d''un système de sonorisation professionnel, à la fois compact et puissant, idéal pour vos soirées privées, sets DJ, cocktails ou événements d''entreprise à Agadir. 🎶✨
🎼 Le pack comprend :
🔊 2 × Enceintes Haut/Médium JBL VRX900 – 875 W ×2
🔉 1 × Caisson de basses JBL – 800 W
🎧 Régie DJ Professionnelle :

2 × Pioneer CDJ 3000
1 × Pioneer DJM 900 Nexus 2

✅ Installation, livraison & technicien inclus
📍 Disponible exclusivement à Agadir',
  features_fr = 'Système JBL VRX900 compact & puissant, caisson de basses 800W, régie DJ Pioneer CDJ 3000 + DJM 900 Nexus 2',
  features_en = 'JBL VRX900 sound system compact & powerful, 800W subwoofer, Pioneer DJ kit CDJ 3000 + DJM 900 Nexus 2',
  included_fr = '2 Enceintes JBL VRX900, 1 Caisson de basses JBL, 2 Pioneer CDJ 3000, 1 Pioneer DJM 900 Nexus 2, Câblage, Livraison, Installation & Technicien',
  included_en = '2 JBL VRX900 Speakers, 1 JBL Subwoofer, 2 Pioneer CDJ 3000, 1 Pioneer DJM 900 Nexus 2, Cables, Delivery, Setup & Sound Technician'
WHERE original_id = 467;

-- Annonce 398 : Système Son VOID Acoustics + Kit DJ à Casablanca
UPDATE public.listings
SET
  title_fr = 'Location à Casablanca, Maroc – Système Son VOID Acoustics + Kit DJ',
  title_en = 'VOID Acoustics Sound System + DJ Kit Rental in Casablanca, Morocco',
  description_en = COALESCE(description_en, description),
  description_fr = 'Faites de votre événement à Casablanca un moment inoubliable grâce à ce système de sonorisation haut de gamme VOID Acoustics – associant un design emblématique, une puissance remarquable et une clarté sonore haute précision. Que ce soit pour une soirée club, un mariage ou un événement privé, ce système offre une expérience acoustique incomparable.

Ce pack haute performance comprend :

 2 x VOID Stasys X Air
Double caisson de basses passif 18"
Puissance : 2 x 3200W RMS
Basses profondes, nettes et percutantes – idéal pour les grandes salles et pistes de danse

 2 x VOID Air Vantage
Enceintes 2 voies médiums/aigus (500W)
Conçues pour les espaces à faible hauteur de plafond, offrant un son précis et détaillé

 2 x VOID Airten V3
Enceintes de diffusion médiums/aigus haut de gamme
Réponse linéaire optimisée, clarté améliorée et moteurs HF 1.4" pour des hautes fréquences précises et douces

 Régie DJ complète incluse :
2 x Pioneer CDJ 3000
1 x Pioneer DJM 900 Nexus

La série Air de VOID est mondialement reconnue pour son élégance esthétique et ses performances sonores supérieures. Idéal pour DJs, événements prestigieux et professionnels exigeants.

- Disponible à la location sur Casablanca et sa région
- Idéal pour clubs, mariages, événements privés, rooftops & festivals
- Livraison, installation et régisseur son disponibles sur demande',
  features_fr = 'Système VOID Acoustics Air Series (Stasys X Air 6400W RMS, Air Vantage, Airten V3) avec régie DJ Pioneer CDJ 3000 + DJM 900 Nexus',
  features_en = 'VOID Acoustics Air Series system (Stasys X Air 6400W RMS, Air Vantage, Airten V3) with Pioneer DJ kit CDJ 3000 + DJM 900 Nexus',
  included_fr = '2 caissons VOID Stasys X Air, 2 enceintes VOID Air Vantage, 2 enceintes VOID Airten V3, 2 platines Pioneer CDJ 3000, 1 table Pioneer DJM 900 Nexus, câblage et amplification',
  included_en = '2 VOID Stasys X Air subwoofers, 2 VOID Air Vantage speakers, 2 VOID Airten V3 speakers, 2 Pioneer CDJ 3000, 1 Pioneer DJM 900 Nexus mixer, cabling and amplification'
WHERE original_id = 398;

-- ==============================================================================
-- Script de Rollback / Réversibilité (si nécessaire) :
--
-- ALTER TABLE public.listings
--   DROP COLUMN IF EXISTS title_fr,
--   DROP COLUMN IF EXISTS title_en,
--   DROP COLUMN IF EXISTS description_fr,
--   DROP COLUMN IF EXISTS description_en,
--   DROP COLUMN IF EXISTS features_fr,
--   DROP COLUMN IF EXISTS features_en,
--   DROP COLUMN IF EXISTS included_fr,
--   DROP COLUMN IF EXISTS included_en;
-- ==============================================================================

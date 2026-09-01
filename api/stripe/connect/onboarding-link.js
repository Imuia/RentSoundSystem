
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

function clean(value, max = 500) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function supabaseConfig() {
  const url = clean(process.env.SUPABASE_URL || "https://crxofkxinsspfgdsxpiy.supabase.co").replace(/\/+$/, "");
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const publishableKey = clean(
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj"
  );

  if (!url || !serviceKey || !publishableKey) {
    throw new Error("Configuration Supabase serveur incomplète.");
  }

  return { url, serviceKey, publishableKey };
}

async function getAuthenticatedUser(req) {
  const auth = clean(req.headers.authorization, 5000);
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";

  if (!token) {
    const error = new Error("Authentification partenaire requise.");
    error.status = 401;
    throw error;
  }

  const cfg = supabaseConfig();

  // Validation officielle du JWT par Supabase Auth.
  // On utilise exactement la publishable key du même projet que le navigateur.
  const authClient = createClient(cfg.url, cfg.publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });

  const { data, error: authError } = await authClient.auth.getUser(token);
  const user = data?.user || null;

  if (authError || !user?.id || !user?.email) {
    console.error("supabase-auth-getUser-rejected", {
      message: authError?.message || "Utilisateur absent",
      status: authError?.status || 401
    });
    const error = new Error("Session partenaire invalide ou expirée.");
    error.status = 401;
    throw error;
  }

  return user;
}

async function supabaseAdmin(path, options = {}) {
  const cfg = supabaseConfig();
  const response = await fetch(`${cfg.url}${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const raw = await response.text();
  const data = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
  if (!response.ok) {
    const error = new Error(
      typeof data === "string"
        ? data
        : data?.message || data?.error || `Erreur Supabase ${response.status}`
    );
    error.status = response.status;
    throw error;
  }
  return data;
}

async function getPartnerForUser(user) {
  const select = [
    "id","user_id","email","name","country","status",
    "stripe_account_id","stripe_connect_status",
    "stripe_charges_enabled","stripe_payouts_enabled",
    "stripe_details_submitted","commission_rate"
  ].join(",");

  const byUser = new URLSearchParams({
    select,
    user_id: `eq.${user.id}`,
    limit: "1"
  });
  let rows = await supabaseAdmin(`/rest/v1/partners?${byUser.toString()}`);
  if (Array.isArray(rows) && rows[0]) return rows[0];

  const email = clean(user.email, 254).toLowerCase();
  const byEmail = new URLSearchParams({
    select,
    email: `ilike.${email}`,
    limit: "1"
  });
  rows = await supabaseAdmin(`/rest/v1/partners?${byEmail.toString()}`);
  if (Array.isArray(rows) && rows[0]) return rows[0];

  const error = new Error("Aucun partenaire correspondant au compte connecté.");
  error.status = 404;
  throw error;
}

async function patchPartner(partnerId, body) {
  const query = new URLSearchParams({ id: `eq.${partnerId}` });
  const rows = await supabaseAdmin(`/rest/v1/partners?${query.toString()}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

function publicPartnerStatus(partner) {
  return {
    stripe_account_id: clean(partner?.stripe_account_id, 120),
    stripe_connect_status: clean(partner?.stripe_connect_status, 60) || "not_started",
    stripe_charges_enabled: Boolean(partner?.stripe_charges_enabled),
    stripe_payouts_enabled: Boolean(partner?.stripe_payouts_enabled),
    stripe_details_submitted: Boolean(partner?.stripe_details_submitted),
    commission_rate: Number.isFinite(Number(partner?.commission_rate))
      ? Number(partner.commission_rate)
      : 0.15
  };
}

function getStripe() {
  if (!process.env.STRIPE_CONNECT_SECRET_KEY) {
    throw new Error("STRIPE_CONNECT_SECRET_KEY manquante.");
  }
  return new Stripe(process.env.STRIPE_CONNECT_SECRET_KEY);
}


function appBase(req) {
  const configured = clean(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL, 500).replace(/\/+$/, "");
  if (configured) return configured;

  const proto = clean(req.headers["x-forwarded-proto"] || "https", 20);
  const host = clean(req.headers["x-forwarded-host"] || req.headers.host, 300);
  if (!host) throw new Error("APP_URL manquante dans Vercel.");
  return `${proto}://${host}`;
}

function normalizeCountry(value) {
  const raw = clean(value, 80).toUpperCase();
  if (/^[A-Z]{2}$/.test(raw)) return raw;
  const map = {
    FRANCE: "FR", BELGIQUE: "BE", BELGIUM: "BE",
    ESPAGNE: "ES", SPAIN: "ES", ITALIE: "IT", ITALY: "IT",
    ALLEMAGNE: "DE", GERMANY: "DE", PORTUGAL: "PT",
    "PAYS-BAS": "NL", NETHERLANDS: "NL",
    LUXEMBOURG: "LU", IRELAND: "IE", IRLANDE: "IE",
    MAROC: "MA", MOROCCO: "MA",
    MADAGASCAR: "MG",
    "UNITED KINGDOM": "GB", ROYAUMEUNI: "GB", "ROYAUME-UNI": "GB",
    USA: "US", "UNITED STATES": "US", "ÉTATS-UNIS": "US", "ETATS-UNIS": "US"
  };
  return map[raw] || "";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await getAuthenticatedUser(req);
    let partner = await getPartnerForUser(user);

    const allowed = ["approved","active","validated","valide","validé"];
    if (!allowed.includes(clean(partner.status, 40).toLowerCase())) {
      return res.status(403).json({ error: "Le compte partenaire doit être validé avant Stripe Connect." });
    }

    const stripe = getStripe();
    let accountId = clean(partner.stripe_account_id, 120);

    if (accountId) {
      // On vérifie que l'identifiant stocké existe réellement dans le même environnement Stripe.
      try {
        await stripe.accounts.retrieve(accountId);
      } catch (error) {
        if (error?.code === "resource_missing") {
          accountId = "";
        } else {
          throw error;
        }
      }
    }

    if (!accountId) {
      const country = normalizeCountry(partner.country);
      const account = await stripe.accounts.create({
        type: "express",
        ...(country ? { country } : {}),
        email: clean(partner.email || user.email, 254) || undefined,
        business_profile: {
          product_description: "Location de matériel audio et événementiel via RentSoundSystem"
        },
        capabilities: {
          transfers: { requested: true }
        },
        metadata: {
          source: "rentsoundsystem_connect",
          partner_id: clean(partner.id, 120),
          user_id: clean(user.id, 120),
          partner_email: clean(partner.email || user.email, 254)
        }
      }, {
        idempotencyKey: `rss:connect:${partner.id}`
      });

      accountId = account.id;
      partner = await patchPartner(partner.id, {
        stripe_account_id: account.id,
        stripe_connect_status: account.details_submitted ? "pending_verification" : "onboarding",
        stripe_charges_enabled: Boolean(account.charges_enabled),
        stripe_payouts_enabled: Boolean(account.payouts_enabled),
        stripe_details_submitted: Boolean(account.details_submitted)
      }) || partner;
    }

    const base = appBase(req);
    const returnUrl = `${base}/mon-profil-partenaire.html?stripe_connect=return`;
    const refreshUrl = `${base}/mon-profil-partenaire.html?stripe_connect=refresh`;

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding"
    });

    return res.status(200).json({
      ok: true,
      url: link.url,
      expires_at: link.expires_at,
      account_id: accountId
    });
  } catch (error) {
    console.error("stripe-connect-onboarding-link", error);
    return res.status(error.status || 500).json({
      error: error.message || "Impossible de démarrer Stripe Connect."
    });
  }
}

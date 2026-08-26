
import Stripe from "stripe";

function clean(value, max = 500) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function supabaseConfig() {
  const url = clean(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = clean(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !serviceKey) throw new Error("Configuration Supabase serveur incomplète.");
  return { url, serviceKey, anonKey };
}

async function getAuthenticatedUser(req) {
  const auth = clean(req.headers.authorization, 400);
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) {
    const error = new Error("Authentification partenaire requise.");
    error.status = 401;
    throw error;
  }

  const cfg = supabaseConfig();
  const response = await fetch(`${cfg.url}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: cfg.anonKey || cfg.serviceKey
    }
  });

  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id || !user?.email) {
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
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY manquante.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}


export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const user = await getAuthenticatedUser(req);
    let partner = await getPartnerForUser(user);
    const accountId = clean(partner.stripe_account_id, 120);

    if (!accountId) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json(publicPartnerStatus(partner));
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountId);

    let connectStatus = "onboarding";
    if (account.details_submitted && account.payouts_enabled) connectStatus = "active";
    else if (account.details_submitted) connectStatus = "pending_verification";

    partner = await patchPartner(partner.id, {
      stripe_connect_status: connectStatus,
      stripe_charges_enabled: Boolean(account.charges_enabled),
      stripe_payouts_enabled: Boolean(account.payouts_enabled),
      stripe_details_submitted: Boolean(account.details_submitted)
    }) || partner;

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      ...publicPartnerStatus(partner),
      stripe_account_id: account.id
    });
  } catch (error) {
    console.error("stripe-connect-status", error);
    return res.status(error.status || 500).json({
      error: error.message || "Statut Stripe Connect indisponible."
    });
  }
}

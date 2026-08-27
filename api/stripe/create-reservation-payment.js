import Stripe from "stripe";

/*
  RentSoundSystem — création sécurisée du paiement de réservation

  - Le serveur relit l'annonce publiée depuis Supabase.
  - Le montant envoyé par le navigateur est contrôlé avant la création Stripe.
  - Les taxes sont calculées selon les champs de l'annonce :
      price_tax_mode = legacy_public_price | tax_included | tax_excluded | tax_exempt | not_configured
      vat_rate = 0.20 ou 20 pour 20 %
  - legacy_public_price reprend le tarif affiché du site historique sans ajout de TVA.
  - En mode Stripe live, legacy_public_price ou une taxe non configurée bloque le paiement
    tant que l'émetteur de facture n'a pas défini son régime fiscal.
*/

function amount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function number(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function text(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function boolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "oui"].includes(normalized)) return true;
  if (["false", "0", "no", "non"].includes(normalized)) return false;
  return fallback;
}

function countryCode(value) {
  const code = text(value, 10).toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

function billingFromCustomer(customer = {}, reservationCustomer = {}) {
  const billing = customer.billing || customer.address || reservationCustomer.billing || reservationCustomer.address || {};
  return {
    addressLine1: text(billing.addressLine1 || billing.line1 || billing.address || billing.street, 300),
    postalCode: text(billing.postalCode || billing.postal_code || billing.zip || billing.zipCode, 40),
    city: text(billing.city || billing.town, 120),
    country: countryCode(billing.country || billing.countryCode),
    countryName: text(billing.countryName || billing.country_name || billing.country || "", 120),
    vatNumber: text(billing.vatNumber || billing.vat_number || billing.taxId || billing.tax_id, 80)
  };
}

function optionPrice(value, fallback) {
  const n = number(value, NaN);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function normalizeVatRate(value) {
  const rate = number(value, 0);
  return rate > 1 ? rate / 100 : Math.max(0, rate);
}

function normalizeTaxMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (["legacy_public_price", "legacy", "prix_public", "prix_affiche"].includes(mode)) return "legacy_public_price";
  if (["tax_included", "tva_incluse", "included"].includes(mode)) return "tax_included";
  if (["tax_excluded", "tva_exclue", "excluded"].includes(mode)) return "tax_excluded";
  if (["tax_exempt", "exempt", "non_taxable"].includes(mode)) return "tax_exempt";
  return "legacy_public_price";
}

function moneyToCents(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function isoDate(value) {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function dateAtMidnight(value) {
  const date = isoDate(value);
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function dateDiffInclusive(start, end) {
  const startDate = dateAtMidnight(start);
  const endDate = dateAtMidnight(end);
  if (!startDate || !endDate || endDate < startDate) return 0;
  return Math.floor((endDate - startDate) / 86400000) + 1;
}

function rentalDates(rental) {
  const selected = Array.isArray(rental?.selectedDates)
    ? Array.from(new Set(rental.selectedDates.map(isoDate).filter(Boolean))).sort()
    : [];

  const today = todayUtc();
  if (selected.length) {
    if (selected.some((value) => dateAtMidnight(value) < today)) {
      throw new Error("Une date de location est déjà passée.");
    }
    return {
      dates: selected,
      days: selected.length,
      startDate: selected[0],
      endDate: selected[selected.length - 1]
    };
  }

  const startDate = isoDate(rental?.startDate);
  const endDate = isoDate(rental?.endDate);
  const days = dateDiffInclusive(startDate, endDate);
  if (!days) throw new Error("Dates de location invalides.");
  if (dateAtMidnight(startDate) < today) throw new Error("La date de début est déjà passée.");

  return { dates: [], days, startDate, endDate };
}

function computePricing(listing, reservation) {
  const rental = reservation?.rental || {};
  const dates = rentalDates(rental);
  const quantity = Math.max(1, Math.floor(number(reservation?.item?.quantity, 1)));

  const maxQuantity = Math.floor(number(listing.available_quantity ?? listing.max_rental_quantity, 0));
  if (maxQuantity > 0 && quantity > maxQuantity) {
    throw new Error(`Quantité indisponible : maximum ${maxQuantity}.`);
  }

  const minDuration = Math.floor(number(listing.min_duration, 0));
  const maxDuration = Math.floor(number(listing.max_duration, 0));
  if (minDuration > 0 && dates.days < minDuration) {
    throw new Error(`Durée minimale : ${minDuration} jour(s).`);
  }
  if (maxDuration > 0 && dates.days > maxDuration) {
    throw new Error(`Durée maximale : ${maxDuration} jour(s).`);
  }

  const dailyPrice = optionPrice(
    listing.price ?? listing.dailyPrice ?? listing.price_day ?? listing.price_per_day,
    0
  );
  if (dailyPrice <= 0) throw new Error("Prix de location de l'annonce invalide.");

  const deliveryRequested = String(rental.delivery || "pickup") === "delivery";
  const deliveryEnabled = boolean(listing.delivery_enabled, true);
  const installationRequested = boolean(rental.technician, false);
  const installationEnabled = boolean(listing.installation_enabled, true);

  if (deliveryRequested && !deliveryEnabled) {
    throw new Error("La livraison n'est pas disponible pour cette annonce.");
  }
  if (installationRequested && !installationEnabled) {
    throw new Error("L'installation technique n'est pas disponible pour cette annonce.");
  }

  // Compatibilité avec les annonces existantes : mêmes valeurs par défaut que la fiche produit.
  const delivery = deliveryRequested ? optionPrice(listing.delivery_price, 50) : 0;
  const installation = installationRequested ? optionPrice(listing.installation_price, 150) : 0;
  const rentalAmount = dailyPrice * dates.days * quantity;
  const rawSubtotal = rentalAmount + delivery + installation;

  const vatRate = normalizeVatRate(listing.vat_rate ?? listing.tva_rate ?? listing.tax_rate);
  const taxMode = normalizeTaxMode(listing.price_tax_mode ?? listing.tax_mode);
  let amountExclTax = rawSubtotal;
  let tax = 0;
  let total = rawSubtotal;
  let taxPending = false;
  const taxReviewRequired = taxMode === "legacy_public_price";

  // Reprise du fonctionnement public du site historique :
  // aucun montant de TVA n'est ajouté au tarif affiché dans le tunnel.
  if (taxMode === "legacy_public_price") {
    amountExclTax = rawSubtotal;
    tax = 0;
    total = rawSubtotal;
  } else if (taxMode === "tax_included" && vatRate > 0) {
    amountExclTax = rawSubtotal / (1 + vatRate);
    tax = rawSubtotal - amountExclTax;
    total = rawSubtotal;
  } else if (taxMode === "tax_excluded" && vatRate > 0) {
    amountExclTax = rawSubtotal;
    tax = rawSubtotal * vatRate;
    total = rawSubtotal + tax;
  } else if (taxMode === "tax_exempt") {
    amountExclTax = rawSubtotal;
    tax = 0;
    total = rawSubtotal;
  } else {
    amountExclTax = rawSubtotal;
    tax = 0;
    total = rawSubtotal;
    taxPending = true;
  }

  const deposit = optionPrice(
    listing.caution ?? listing.deposit ?? listing.security_deposit ?? listing.deposit_amount,
    0
  );

  return {
    dates,
    quantity,
    currency: String(listing.currency || "eur").toLowerCase(),
    daily_price: dailyPrice,
    rental: rentalAmount,
    delivery,
    installation,
    subtotal: rawSubtotal,
    amount_excl_tax: amountExclTax,
    tax,
    total,
    deposit,
    vat_rate: (taxPending || taxMode === "legacy_public_price") ? 0 : vatRate,
    tax_mode: taxPending ? "not_configured" : taxMode,
    tax_pending: taxPending,
    tax_review_required: taxReviewRequired || taxPending,
    rental_cents: moneyToCents(total),
    deposit_cents: moneyToCents(deposit)
  };
}

async function getPublishedListing(body) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = String(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "");

  if (!supabaseUrl || !anonKey) {
    throw new Error("SUPABASE_URL ou SUPABASE_ANON_KEY manquante dans Vercel pour vérifier le tarif serveur.");
  }

  const listing = body.listing || body.reservation?.item || {};
  const listingId = text(listing.id || body.metadata?.listing_id, 100);
  const originalId = text(listing.original_id || body.metadata?.original_id, 100);
  if (!listingId && !originalId) throw new Error("Annonce manquante pour vérifier le tarif.");

  const url = new URL(`${supabaseUrl}/rest/v1/listings`);
  url.searchParams.set("select", "*");
  url.searchParams.set("status", "eq.publish");
  if (listingId) url.searchParams.set("id", `eq.${listingId}`);
  else url.searchParams.set("original_id", `eq.${originalId}`);
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) throw new Error(`Impossible de vérifier l'annonce (${response.status}).`);

  const rows = await response.json();
  const item = Array.isArray(rows) ? rows[0] : null;
  if (!item) throw new Error("Annonce introuvable ou non publiée.");
  return item;
}

function supabaseAdminConfig() {
  const url = text(process.env.SUPABASE_URL, 500).replace(/\/+$/, "");
  const serviceKey = text(
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY,
    5000
  );
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

async function supabaseAdminRequest(path) {
  const cfg = supabaseAdminConfig();
  if (!cfg) return null;

  const response = await fetch(`${cfg.url}${path}`, {
    headers: {
      apikey: cfg.serviceKey,
      Authorization: `Bearer ${cfg.serviceKey}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(`Impossible de vérifier Stripe Connect du partenaire (${response.status})${raw ? `: ${raw.slice(0,200)}` : ""}`);
  }
  return response.json();
}

function normalizeCommissionRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.15;
  const rate = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, rate));
}

async function getConnectPartnerForListing(listing) {
  const cfg = supabaseAdminConfig();
  if (!cfg) {
    return {
      eligible: false,
      reason: "missing_supabase_service_role",
      commission_rate: 0.15
    };
  }

  const select = [
    "id","user_id","legacy_user_id","email","status",
    "stripe_account_id","stripe_connect_status",
    "stripe_charges_enabled","stripe_payouts_enabled",
    "stripe_details_submitted","commission_rate"
  ].join(",");

  const legacyUserId = text(
    listing.legacy_user_id ?? listing.partner_id ?? listing.owner_id ?? "",
    100
  );

  const partnerEmail = text(
    listing.owner_email ?? listing.partner_email ?? listing.email ?? "",
    254
  ).toLowerCase();

  let rows = [];

  if (legacyUserId && /^-?\d+$/.test(legacyUserId)) {
    const q = new URLSearchParams({
      select,
      legacy_user_id: `eq.${legacyUserId}`,
      limit: "1"
    });
    rows = await supabaseAdminRequest(`/rest/v1/partners?${q.toString()}`) || [];
  }

  if ((!Array.isArray(rows) || !rows[0]) && partnerEmail) {
    const q = new URLSearchParams({
      select,
      email: `ilike.${partnerEmail}`,
      limit: "1"
    });
    rows = await supabaseAdminRequest(`/rest/v1/partners?${q.toString()}`) || [];
  }

  const partner = Array.isArray(rows) ? rows[0] || null : null;
  if (!partner) {
    return {
      eligible: false,
      reason: "partner_not_found",
      commission_rate: 0.15
    };
  }

  const status = text(partner.status, 40).toLowerCase();
  const connectStatus = text(partner.stripe_connect_status, 60).toLowerCase();
  const accountId = text(partner.stripe_account_id, 120);
  const commissionRate = normalizeCommissionRate(partner.commission_rate);

  const partnerValidated =
    ["approved","active","validated","valide","validé"].includes(status);

  const connectReady =
    accountId.startsWith("acct_") &&
    partnerValidated &&
    Boolean(partner.stripe_details_submitted) &&
    Boolean(partner.stripe_payouts_enabled) &&
    ["active","enabled","ready"].includes(connectStatus);

  return {
    partner,
    eligible: connectReady,
    reason: connectReady ? "active" : "connect_not_ready",
    stripe_account_id: accountId,
    commission_rate: commissionRate
  };
}

function buildRevenueSplit(pricing, connectPartner) {
  if (!connectPartner?.eligible) {
    return {
      enabled: false,
      platform_fee_cents: 0,
      partner_net_cents: 0,
      commission_rate: connectPartner?.commission_rate ?? 0.15
    };
  }

  const commissionRate = normalizeCommissionRate(connectPartner.commission_rate);
  const platformFeeCents = Math.max(
    0,
    Math.min(pricing.rental_cents, Math.round(pricing.rental_cents * commissionRate))
  );

  return {
    enabled: true,
    platform_fee_cents: platformFeeCents,
    partner_net_cents: Math.max(0, pricing.rental_cents - platformFeeCents),
    commission_rate: commissionRate
  };
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY manquante dans Vercel.");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function buildMetadata(body, paymentType, pricing) {
  const reservation = body.reservation || {};
  const rental = reservation.rental || {};
  const item = body.listing || reservation.item || {};
  const customer = body.customer || reservation.customer || {};
  const billing = billingFromCustomer(customer, reservation.customer || {});

  return {
    source: text(body.metadata?.source || "rentsoundsystem_marketplace", 80),
    type: paymentType,
    order_id: text(body.order_id, 100),
    listing_id: text(item.id || body.metadata?.listing_id, 100),
    original_id: text(item.original_id || body.metadata?.original_id, 100),
    listing_name: text(item.name || reservation.item?.name, 300),
    partner_name: text(item.partner_name || reservation.item?.ownerName, 200),
    partner_email: text(item.partner_email || reservation.item?.ownerEmail, 254),
    rental_start: text(pricing.dates.startDate || rental.startDate, 20),
    rental_end: text(pricing.dates.endDate || rental.endDate, 20),
    rental_days: text(pricing.dates.days, 20),
    rental_city: text(rental.city, 200),
    delivery_method: text(rental.delivery, 40),
    technician: rental.technician ? "yes" : "no",
    quantity: text(pricing.quantity, 20),
    customer_name: text(customer.name || [reservation.customer?.firstName, reservation.customer?.lastName].filter(Boolean).join(" "), 200),
    customer_email: text(customer.email || reservation.customer?.email, 254),
    customer_phone: text(customer.phone || reservation.customer?.phone, 50),
    customer_company: text(reservation.customer?.company || customer.company, 200),
    customer_billing_address: billing.addressLine1,
    customer_billing_postal_code: billing.postalCode,
    customer_billing_city: billing.city,
    customer_billing_country: billing.country,
    customer_billing_country_name: billing.countryName,
    customer_vat_number: billing.vatNumber,
    tax_mode: text(pricing.tax_mode, 40),
    tax_review_required: pricing.tax_review_required ? "yes" : "no",
    vat_rate: text(pricing.vat_rate, 20),
    amount_excl_tax: text(pricing.amount_excl_tax.toFixed(2), 30),
    tax_amount: text(pricing.tax.toFixed(2), 30),
    total_amount: text(pricing.total.toFixed(2), 30)
  };
}

function publicPricing(pricing) {
  return {
    currency: pricing.currency,
    days: pricing.dates.days,
    selected_dates: pricing.dates.dates,
    rental: pricing.rental,
    delivery: pricing.delivery,
    installation: pricing.installation,
    subtotal: pricing.subtotal,
    amount_excl_tax: pricing.amount_excl_tax,
    tax: pricing.tax,
    total: pricing.total,
    deposit: pricing.deposit,
    vat_rate: pricing.vat_rate,
    tax_mode: pricing.tax_mode,
    tax_pending: pricing.tax_pending,
    tax_review_required: pricing.tax_review_required,
    total_cents: pricing.rental_cents,
    deposit_cents: pricing.deposit_cents
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const orderId = text(body.order_id, 100);
    const customerEmail = text(body.customer?.email, 254);
    const customerName = text(body.customer?.name, 200);
    const customerPhone = text(body.customer?.phone, 50);
    const billing = billingFromCustomer(body.customer || {}, body.reservation?.customer || {});

    if (!orderId) return res.status(400).json({ error: "Référence de commande manquante." });
    if (!customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
      return res.status(400).json({ error: "E-mail client invalide." });
    }

    const listing = await getPublishedListing(body);
    const pricing = computePricing(listing, body.reservation || {});
    const currency = pricing.currency;
    if (!/^[a-z]{3}$/i.test(currency)) return res.status(400).json({ error: "Devise Stripe invalide." });

    const clientRentalAmount = amount(body.rental_amount);
    const clientDepositAmount = amount(body.deposit_amount);
    if (Math.abs(clientRentalAmount - pricing.rental_cents) > 1 || Math.abs(clientDepositAmount - pricing.deposit_cents) > 1) {
      return res.status(409).json({
        error: "Le tarif a été actualisé. Rechargez la page pour afficher le montant vérifié.",
        pricing: publicPricing(pricing)
      });
    }
    if (pricing.rental_cents < 50 && pricing.deposit_cents < 50) {
      return res.status(400).json({ error: "Montant Stripe insuffisant." });
    }

    const isLive = String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_");
    if (isLive && pricing.tax_review_required && process.env.RSS_ALLOW_LIVE_TAX_PENDING !== "true") {
      return res.status(422).json({
        error: "Régime fiscal et facture de l’émetteur à définir avant un paiement live.",
        pricing: publicPricing(pricing)
      });
    }

    const stripe = getStripe();
    const baseMetadata = buildMetadata(body, "reservation", pricing);

    let connectPartner = {
      eligible: false,
      reason: "not_checked",
      commission_rate: 0.15
    };

    try {
      connectPartner = await getConnectPartnerForListing(listing);
    } catch (error) {
      console.error("stripe-connect-partner-lookup", error);
      connectPartner = {
        eligible: false,
        reason: "lookup_error",
        commission_rate: 0.15
      };
    }

    const revenueSplit = buildRevenueSplit(pricing, connectPartner);

    const customer = await stripe.customers.create(
      {
        email: customerEmail,
        name: customerName || undefined,
        phone: customerPhone || undefined,
        address: billing.addressLine1 || billing.city || billing.postalCode || billing.country
          ? {
              line1: billing.addressLine1 || undefined,
              postal_code: billing.postalCode || undefined,
              city: billing.city || undefined,
              country: billing.country || undefined
            }
          : undefined,
        metadata: {
          source: baseMetadata.source,
          order_id: orderId,
          listing_id: baseMetadata.listing_id,
          customer_company: baseMetadata.customer_company,
          customer_billing_address: baseMetadata.customer_billing_address,
          customer_billing_postal_code: baseMetadata.customer_billing_postal_code,
          customer_billing_city: baseMetadata.customer_billing_city,
          customer_billing_country: baseMetadata.customer_billing_country,
          customer_vat_number: baseMetadata.customer_vat_number
        }
      },
      { idempotencyKey: `rss:${orderId}:customer` }
    );

    let rentalIntent = null;
    if (pricing.rental_cents >= 50) {
      rentalIntent = await stripe.paymentIntents.create(
        {
          amount: pricing.rental_cents,
          currency,
          customer: customer.id,
          receipt_email: customerEmail,
          automatic_payment_methods: { enabled: true },
          ...(revenueSplit.enabled
            ? {
                application_fee_amount: revenueSplit.platform_fee_cents,
                transfer_data: {
                  destination: connectPartner.stripe_account_id
                }
              }
            : {}),
          description: `Location RentSoundSystem – commande ${orderId}`,
          metadata: {
            ...baseMetadata,
            type: "rental_payment"
          }
        },
        { idempotencyKey: `rss:${orderId}:rental` }
      );
    }

    let depositIntent = null;
    if (pricing.deposit_cents >= 50) {
      depositIntent = await stripe.paymentIntents.create(
        {
          amount: pricing.deposit_cents,
          currency,
          customer: customer.id,
          capture_method: "manual",
          automatic_payment_methods: { enabled: true },
          description: `Caution RentSoundSystem – commande ${orderId}`,
          metadata: {
            ...baseMetadata,
            type: "deposit_authorization"
          }
        },
        { idempotencyKey: `rss:${orderId}:deposit` }
      );
    }

    if (rentalIntent && depositIntent) {
      await Promise.all([
        stripe.paymentIntents.update(rentalIntent.id, {
          metadata: {
            ...rentalIntent.metadata,
            linked_deposit_payment_intent_id: depositIntent.id
          }
        }),
        stripe.paymentIntents.update(depositIntent.id, {
          metadata: {
            ...depositIntent.metadata,
            linked_rental_payment_intent_id: rentalIntent.id
          }
        })
      ]);
    }

    return res.status(200).json({
      customer_id: customer.id,
      reservation_id: orderId,
      rental_payment_intent_id: rentalIntent?.id || null,
      rental_client_secret: rentalIntent?.client_secret || null,
      deposit_payment_intent_id: depositIntent?.id || null,
      deposit_client_secret: depositIntent?.client_secret || null,
      revenue_split: {
        enabled: revenueSplit.enabled,
        mode: revenueSplit.enabled ? "stripe_connect_destination_charge" : "platform_only",
        connected_account_id: revenueSplit.enabled ? connectPartner.stripe_account_id : null,
        commission_rate: revenueSplit.commission_rate,
        platform_fee_cents: revenueSplit.platform_fee_cents,
        partner_net_cents: revenueSplit.partner_net_cents,
        fallback_reason: revenueSplit.enabled ? null : connectPartner.reason
      },
      pricing: publicPricing(pricing)
    });
  } catch (err) {
    console.error("create-reservation-payment", err);
    return res.status(500).json({
      error: err.message || "Erreur Stripe lors de la création de la réservation."
    });
  }
}

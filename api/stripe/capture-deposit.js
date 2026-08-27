import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function text(value) {
  return String(value ?? "").trim();
}

function cents(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function requireScheduledDepositSecret(req) {
  const expected = text(process.env.RSS_ADMIN_ACTION_TOKEN);
  const received = text(req.headers["x-rss-admin-token"]);

  if (!expected) {
    const err = new Error("RSS_ADMIN_ACTION_TOKEN manquante dans Vercel.");
    err.status = 500;
    throw err;
  }
  if (!received || received !== expected) {
    const err = new Error("Action caution différée non autorisée.");
    err.status = 401;
    throw err;
  }
}

async function authorizeScheduledDeposit(req, body) {
  requireScheduledDepositSecret(req);

  const rentalId = text(body.rental_payment_intent_id);
  if (!/^pi_[A-Za-z0-9_]+$/.test(rentalId)) {
    const err = new Error("rental_payment_intent_id invalide.");
    err.status = 400;
    throw err;
  }

  const rental = await stripe.paymentIntents.retrieve(rentalId);
  if (rental.metadata?.type !== "rental_payment") {
    const err = new Error("Le PaymentIntent fourni n'est pas une location RentSoundSystem.");
    err.status = 400;
    throw err;
  }
  if (rental.status !== "succeeded") {
    const err = new Error(`Paiement location non finalisé (${rental.status}).`);
    err.status = 409;
    throw err;
  }

  const existingId = text(rental.metadata?.linked_deposit_payment_intent_id);
  if (existingId) {
    const existing = await stripe.paymentIntents.retrieve(existingId);
    if (!["canceled", "succeeded"].includes(existing.status)) {
      return {
        ok: true,
        reused: true,
        payment_intent: existing,
        authorized: existing.status === "requires_capture"
      };
    }
  }

  const customerId = typeof rental.customer === "string" ? rental.customer : rental.customer?.id;
  const paymentMethodId = typeof rental.payment_method === "string"
    ? rental.payment_method
    : rental.payment_method?.id;

  if (!customerId || !paymentMethodId) {
    const err = new Error("Aucun moyen de paiement sauvegardé pour cette réservation.");
    err.status = 409;
    throw err;
  }

  const depositAmount = cents(body.amount_to_authorize) || cents(rental.metadata?.deposit_amount_cents);
  if (depositAmount < 50) {
    const err = new Error("Montant de caution invalide.");
    err.status = 400;
    throw err;
  }

  const orderId = text(rental.metadata?.order_id || rental.id);

  const deposit = await stripe.paymentIntents.create({
    amount: depositAmount,
    currency: rental.currency || "eur",
    customer: customerId,
    payment_method: paymentMethodId,
    payment_method_types: ["card"],
    capture_method: "manual",
    confirm: true,
    off_session: true,
    description: `Caution RentSoundSystem – commande ${orderId}`,
    metadata: {
      ...rental.metadata,
      type: "deposit_authorization",
      linked_rental_payment_intent_id: rental.id,
      authorized_later: "true"
    }
  }, {
    idempotencyKey: `rss:${orderId}:scheduled-deposit`
  });

  await stripe.paymentIntents.update(rental.id, {
    metadata: {
      ...rental.metadata,
      linked_deposit_payment_intent_id: deposit.id,
      deposit_authorized_at: new Date().toISOString()
    }
  });

  return {
    ok: true,
    reused: false,
    payment_intent: deposit,
    authorized: deposit.status === "requires_capture"
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});

    /*
      NOUVEAU mode, sans casser l'ancien :
      action="authorize" + rental_payment_intent_id
      => crée l'empreinte de caution plus tard.
    */
    if (body.action === "authorize" || body.rental_payment_intent_id) {
      const result = await authorizeScheduledDeposit(req, body);
      return res.status(200).json(result);
    }

    /*
      ANCIEN comportement conservé à l'identique :
      payment_intent_id => capture d'une caution déjà autorisée.
    */
    const paymentIntentId = body.payment_intent_id;
    if (!paymentIntentId) return res.status(400).json({ error: "payment_intent_id manquant" });

    const params = {};
    if (body.amount_to_capture !== undefined && body.amount_to_capture !== null && body.amount_to_capture !== "") {
      params.amount_to_capture = Math.round(Number(body.amount_to_capture));
    }

    const captured = await stripe.paymentIntents.capture(paymentIntentId, params);
    return res.status(200).json({ ok: true, payment_intent: captured });
  } catch (err) {
    console.error("capture-deposit", err);

    if (err?.code === "authentication_required" || err?.decline_code === "authentication_required") {
      return res.status(409).json({
        error: "Une nouvelle authentification du client est requise pour autoriser la caution.",
        code: "authentication_required",
        payment_intent_id: err?.payment_intent?.id || null
      });
    }

    return res.status(err.status || 500).json({ error: err.message || "Stripe capture error" });
  }
}

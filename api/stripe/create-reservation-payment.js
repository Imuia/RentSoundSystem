import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function amount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const currency = String(body.currency || "eur").toLowerCase();
    const rentalAmount = amount(body.rental_amount);
    const depositAmount = amount(body.deposit_amount);

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "STRIPE_SECRET_KEY manquante dans Vercel." });
    }
    if (rentalAmount < 50 && depositAmount < 50) {
      return res.status(400).json({ error: "Montant Stripe insuffisant." });
    }

    const customer = await stripe.customers.create({
      email: body.customer?.email || undefined,
      name: body.customer?.name || undefined,
      phone: body.customer?.phone || undefined,
      metadata: body.metadata || {}
    });

    let rentalIntent = null;
    if (rentalAmount >= 50) {
      rentalIntent = await stripe.paymentIntents.create({
        amount: rentalAmount,
        currency,
        customer: customer.id,
        receipt_email: body.customer?.email || undefined,
        automatic_payment_methods: { enabled: true },
        metadata: {
          ...(body.metadata || {}),
          type: "rental_payment",
          order_id: body.order_id || "",
          listing_name: body.listing?.name || "",
          partner_email: body.listing?.partner_email || ""
        }
      });
    }

    let depositIntent = null;
    if (depositAmount >= 50) {
      depositIntent = await stripe.paymentIntents.create({
        amount: depositAmount,
        currency,
        customer: customer.id,
        capture_method: "manual",
        automatic_payment_methods: { enabled: true },
        metadata: {
          ...(body.metadata || {}),
          type: "deposit_authorization",
          order_id: body.order_id || "",
          listing_name: body.listing?.name || "",
          partner_email: body.listing?.partner_email || ""
        }
      });
    }

    res.status(200).json({
      customer_id: customer.id,
      reservation_id: body.order_id || "",
      rental_payment_intent_id: rentalIntent?.id || null,
      rental_client_secret: rentalIntent?.client_secret || null,
      deposit_payment_intent_id: depositIntent?.id || null,
      deposit_client_secret: depositIntent?.client_secret || null
    });
  } catch (err) {
    console.error("create-reservation-payment", err);
    res.status(500).json({ error: err.message || "Stripe error" });
  }
}

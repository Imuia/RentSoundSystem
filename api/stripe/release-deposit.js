import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const paymentIntentId = body.payment_intent_id;
    if (!paymentIntentId) return res.status(400).json({ error: "payment_intent_id manquant" });

    const canceled = await stripe.paymentIntents.cancel(paymentIntentId, {
      cancellation_reason: body.reason || "requested_by_customer"
    });
    res.status(200).json({ ok: true, payment_intent: canceled });
  } catch (err) {
    console.error("release-deposit", err);
    res.status(500).json({ error: err.message || "Stripe cancel error" });
  }
}

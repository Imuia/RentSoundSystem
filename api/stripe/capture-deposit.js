import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const paymentIntentId = body.payment_intent_id;
    if (!paymentIntentId) return res.status(400).json({ error: "payment_intent_id manquant" });

    const params = {};
    if (body.amount_to_capture !== undefined && body.amount_to_capture !== null && body.amount_to_capture !== "") {
      params.amount_to_capture = Math.round(Number(body.amount_to_capture));
    }

    const captured = await stripe.paymentIntents.capture(paymentIntentId, params);
    res.status(200).json({ ok: true, payment_intent: captured });
  } catch (err) {
    console.error("capture-deposit", err);
    res.status(500).json({ error: err.message || "Stripe capture error" });
  }
}

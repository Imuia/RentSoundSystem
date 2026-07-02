import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 80000, // 800 €
      currency: "eur",
      capture_method: "manual",
      automatic_payment_methods: {
        enabled: true
      },
      metadata: {
        type: "caution_test",
        site: "rentsoundsystem"
      }
    });

    res.status(200).json({
      ok: true,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
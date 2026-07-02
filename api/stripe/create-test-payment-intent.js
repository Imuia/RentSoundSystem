import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000, // 10,00 €
      currency: "eur",
      automatic_payment_methods: {
        enabled: true
      },
      metadata: {
        test: "rentsoundsystem"
      }
    });

    res.status(200).json({
      ok: true,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  try {
    const email = req.query.email || "ton-email-test@example.com";

    const paymentIntent = await stripe.paymentIntents.create({
      amount: 1000,
      currency: "eur",
      receipt_email: email,
      automatic_payment_methods: {
        enabled: true
      },
      metadata: {
        test: "rentsoundsystem",
        type: "location_payment"
      }
    });

    res.status(200).json({
      ok: true,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      receiptEmail: email
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
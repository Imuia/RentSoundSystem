export default async function handler(req, res) {
  res.status(200).json({
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ? "OK" : "MANQUANTE",
    secretKey: process.env.STRIPE_SECRET_KEY ? "OK" : "MANQUANTE"
  });
}
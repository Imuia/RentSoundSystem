import Stripe from "stripe";

function text(value, fallback = "") {
  const result = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return result || fallback;
}

function recipientStatus(metadata, recipient) {
  const modern = text(metadata?.[`email_${recipient}_status`]);
  if (modern) return modern;
  const legacy = text(metadata?.[`email_${recipient}_sent`]);
  if (legacy === "true") return "sent";
  if (legacy === "not_applicable") return "not_applicable";
  return "pending";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "STRIPE_SECRET_KEY manquante." });
    }

    const paymentIntentId = text(req.query?.payment_intent);
    const orderId = text(req.query?.order);

    if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
      return res.status(400).json({ error: "Référence Stripe invalide." });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const rental = await stripe.paymentIntents.retrieve(paymentIntentId);
    const metadata = rental.metadata || {};

    if (metadata.type !== "rental_payment") {
      return res.status(404).json({ error: "Paiement de location introuvable." });
    }
    if (orderId && text(metadata.order_id) !== orderId) {
      return res.status(404).json({ error: "Commande introuvable." });
    }

    let depositAuthorized = true;
    const depositIntentId = text(metadata.linked_deposit_payment_intent_id);
    if (depositIntentId) {
      const deposit = await stripe.paymentIntents.retrieve(depositIntentId);
      depositAuthorized = deposit.status === "requires_capture";
    }

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      payment_status: rental.status,
      deposit_authorized: depositAuthorized,
      notifications: {
        overall: text(metadata.notification_status, "pending"),
        customer: recipientStatus(metadata, "customer")
      }
    });
  } catch (error) {
    console.error("stripe-notification-status", error);
    return res.status(500).json({ error: "Statut e-mail temporairement indisponible." });
  }
}

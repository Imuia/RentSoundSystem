import Stripe from "stripe";

function amount(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

function text(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY manquante dans Vercel.");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function buildMetadata(body, paymentType) {
  const reservation = body.reservation || {};
  const rental = reservation.rental || {};
  const item = body.listing || reservation.item || {};
  const customer = body.customer || reservation.customer || {};

  return {
    source: text(body.metadata?.source || "rentsoundsystem_marketplace", 80),
    type: paymentType,
    order_id: text(body.order_id, 100),
    listing_id: text(item.id || body.metadata?.listing_id, 100),
    original_id: text(item.original_id || body.metadata?.original_id, 100),
    listing_name: text(item.name || reservation.item?.name, 300),
    partner_name: text(item.partner_name || reservation.item?.ownerName, 200),
    partner_email: text(item.partner_email || reservation.item?.ownerEmail, 254),
    rental_start: text(rental.startDate, 20),
    rental_end: text(rental.endDate, 20),
    rental_city: text(rental.city, 200),
    rental_days: text(rental.days, 20),
    delivery_method: text(rental.delivery, 40),
    technician: rental.technician ? "yes" : "no",
    quantity: text(reservation.item?.quantity || 1, 20),
    customer_company: text(reservation.customer?.company || customer.company, 200)
  };
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};

    const currency = String(body.currency || "eur").toLowerCase();
    const rentalAmount = amount(body.rental_amount);
    const depositAmount = amount(body.deposit_amount);
    const orderId = text(body.order_id, 100);
    const customerEmail = text(body.customer?.email, 254);
    const customerName = text(body.customer?.name, 200);
    const customerPhone = text(body.customer?.phone, 50);

    if (!orderId) {
      return res.status(400).json({ error: "Référence de commande manquante." });
    }
    if (!/^[a-z]{3}$/i.test(currency)) {
      return res.status(400).json({ error: "Devise Stripe invalide." });
    }
    if (!customerEmail || !/^\S+@\S+\.\S+$/.test(customerEmail)) {
      return res.status(400).json({ error: "E-mail client invalide." });
    }
    if (rentalAmount < 50 && depositAmount < 50) {
      return res.status(400).json({ error: "Montant Stripe insuffisant." });
    }

    const stripe = getStripe();
    const baseMetadata = buildMetadata(body, "reservation");

    // Les clés d'idempotence empêchent la création de doublons si le client
    // clique deux fois ou si le navigateur relance la même requête.
    const customer = await stripe.customers.create(
      {
        email: customerEmail,
        name: customerName || undefined,
        phone: customerPhone || undefined,
        metadata: {
          source: baseMetadata.source,
          order_id: orderId,
          listing_id: baseMetadata.listing_id
        }
      },
      { idempotencyKey: `rss:${orderId}:customer` }
    );

    let rentalIntent = null;
    if (rentalAmount >= 50) {
      rentalIntent = await stripe.paymentIntents.create(
        {
          amount: rentalAmount,
          currency,
          customer: customer.id,
          receipt_email: customerEmail,
          automatic_payment_methods: { enabled: true },
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
    if (depositAmount >= 50) {
      depositIntent = await stripe.paymentIntents.create(
        {
          amount: depositAmount,
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

    // Les deux PaymentIntents sont liés. Le webhook pourra attendre que la
    // location soit payée ET que la caution soit bien autorisée avant d'envoyer les e-mails.
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
      deposit_client_secret: depositIntent?.client_secret || null
    });
  } catch (err) {
    console.error("create-reservation-payment", err);
    return res.status(500).json({
      error: err.message || "Erreur Stripe lors de la création de la réservation."
    });
  }
}

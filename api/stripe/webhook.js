import Stripe from "stripe";

export const config = {
  api: {
    bodyParser: false
  }
};

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY manquante dans Vercel.");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function text(value, fallback = "") {
  const result = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return result || fallback;
}

function escapeHtml(value) {
  return text(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isEmail(value) {
  return /^\S+@\S+\.\S+$/.test(text(value));
}

function formatMoney(cents, currency = "eur") {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: String(currency || "eur").toUpperCase()
  }).format(Number(cents || 0) / 100);
}

function formatDate(value) {
  const date = text(value);
  if (!date) return "Non indiquée";
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  }).format(parsed);
}

function reservationPortalUrl(orderId) {
  const base = text(process.env.APP_URL || "https://rentsoundsystem.vercel.app")
    .replace(/\/+$/, "");
  return `${base}/espace-client-reservations.html?order=${encodeURIComponent(orderId)}`;
}

function detailsTable(details) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:18px 0;">
      ${details
        .map(
          ([label, value]) => `
            <tr>
              <td style="padding:9px 0;border-bottom:1px solid #eeeeee;color:#6b6470;font-size:14px;">${escapeHtml(label)}</td>
              <td style="padding:9px 0;border-bottom:1px solid #eeeeee;color:#1b1719;font-size:14px;font-weight:700;text-align:right;">${escapeHtml(value)}</td>
            </tr>
          `
        )
        .join("")}
    </table>
  `;
}

function emailLayout(title, intro, body) {
  return `
    <!doctype html>
    <html lang="fr">
      <body style="margin:0;padding:0;background:#f6f4f5;font-family:Arial,Helvetica,sans-serif;color:#1b1719;">
        <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
          <div style="background:#111111;padding:22px 28px;border-radius:10px 10px 0 0;">
            <div style="color:#fc036d;font-weight:800;font-size:20px;letter-spacing:.2px;">RENTSOUNDSYSTEM</div>
          </div>
          <div style="background:#ffffff;padding:30px 28px;border-radius:0 0 10px 10px;">
            <h1 style="font-size:24px;line-height:1.2;margin:0 0 14px;">${escapeHtml(title)}</h1>
            <p style="font-size:16px;line-height:1.55;margin:0 0 18px;">${intro}</p>
            ${body}
            <p style="font-size:13px;line-height:1.5;color:#6b6470;margin:26px 0 0;">
              RentSoundSystem · Location de matériel audio professionnel
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
}

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function resendEmail({ to, subject, html, idempotencyKey }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) throw new Error("RESEND_API_KEY manquante dans Vercel.");
  if (!from) throw new Error("EMAIL_FROM manquante dans Vercel.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || "Erreur Resend lors de l'envoi de l'e-mail.");
  }
  return data;
}

async function getCustomer(stripe, customerId) {
  if (!customerId || typeof customerId !== "string") return {};
  try {
    const customer = await stripe.customers.retrieve(customerId);
    return customer && !customer.deleted ? customer : {};
  } catch {
    return {};
  }
}


async function updateEmailState(stripe, paymentIntent, key, value) {
  await stripe.paymentIntents.update(paymentIntent.id, {
    metadata: {
      ...paymentIntent.metadata,
      [key]: value
    }
  });
  paymentIntent.metadata[key] = value;
}

async function sendNotificationsWhenReady(stripe, rentalIntentId) {
  const rental = await stripe.paymentIntents.retrieve(rentalIntentId);
  const metadata = rental.metadata || {};

  if (metadata.type !== "rental_payment") {
    return { skipped: "not_rental_payment" };
  }
  if (rental.status !== "succeeded") {
    return { skipped: "rental_not_paid" };
  }

  const depositIntentId = text(metadata.linked_deposit_payment_intent_id);
  let deposit = null;
  if (depositIntentId) {
    deposit = await stripe.paymentIntents.retrieve(depositIntentId);
    if (deposit.status !== "requires_capture") {
      return { skipped: "deposit_not_authorized_yet" };
    }
  }

  const orderId = text(metadata.order_id, rental.id);
  const customer = await getCustomer(stripe, rental.customer);
  const customerEmail = text(rental.receipt_email || customer.email);
  const customerName = text(customer.name, "Client");
  const customerPhone = text(customer.phone, "Non indiqué");
  const partnerEmail = text(metadata.partner_email);
  const partnerName = text(metadata.partner_name, "Partenaire");
  const adminEmail = text(process.env.ADMIN_EMAIL);
  const currency = rental.currency || "eur";

  if (!adminEmail || !isEmail(adminEmail)) {
    throw new Error("ADMIN_EMAIL manquante ou invalide dans Vercel.");
  }

  const rentalDates = `${formatDate(metadata.rental_start)} → ${formatDate(metadata.rental_end)}`;
  const location = text(metadata.rental_city, "Non indiqué");
  const product = text(metadata.listing_name, "Matériel RentSoundSystem");
  const depositText = deposit
    ? `${formatMoney(deposit.amount, deposit.currency)} — autorisée, non débitée`
    : "Aucune caution demandée";

  const publicDetails = detailsTable([
    ["Référence", orderId],
    ["Matériel", product],
    ["Dates", rentalDates],
    ["Lieu", location],
    ["Montant réglé", formatMoney(rental.amount, currency)],
    ["Caution", depositText]
  ]);

  if (isEmail(customerEmail) && metadata.email_customer_sent !== "true") {
    const portalUrl = reservationPortalUrl(orderId);
    const portalBlock = `<p style="margin:22px 0 0;"><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#fc036d;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:6px;font-weight:700;">Voir ma réservation</a></p>`;

    await resendEmail({
      to: customerEmail,
      subject: `Confirmation de réservation ${orderId} – RentSoundSystem`,
      idempotencyKey: `rss:${orderId}:customer-confirmation`,
      html: emailLayout(
        "Votre réservation est confirmée",
        `Bonjour ${escapeHtml(customerName)}, votre paiement est validé et votre caution est autorisée sans être débitée.`,
        `${publicDetails}${portalBlock}<p style="font-size:14px;line-height:1.5;margin-top:22px;">Retrouvez cette réservation dans votre espace client. Notre équipe ou le partenaire vous contactera également pour l’organisation pratique de la location.</p>`
      )
    });

    await updateEmailState(stripe, rental, "email_customer_sent", "true");
  }

  if (metadata.email_admin_sent !== "true") {
    const adminDetails = detailsTable([
      ["Référence", orderId],
      ["Client", customerName],
      ["E-mail client", customerEmail || "Non indiqué"],
      ["Téléphone", customerPhone],
      ["Société", text(metadata.customer_company, "Non indiquée")],
      ["Matériel", product],
      ["Dates", rentalDates],
      ["Lieu", location],
      ["Livraison", text(metadata.delivery_method, "Non indiqué")],
      ["Technicien", metadata.technician === "yes" ? "Oui" : "Non"],
      ["Partenaire", partnerName],
      ["E-mail partenaire", partnerEmail || "Non indiqué"],
      ["Paiement reçu", formatMoney(rental.amount, currency)],
      ["Caution", depositText],
      ["PaymentIntent location", rental.id],
      ["PaymentIntent caution", deposit?.id || "Aucun"]
    ]);

    await resendEmail({
      to: adminEmail,
      subject: `Nouvelle réservation payée ${orderId} – ${product}`,
      idempotencyKey: `rss:${orderId}:admin-notification`,
      html: emailLayout(
        "Nouvelle réservation payée",
        "Le paiement de location est validé et la caution est autorisée.",
        `${adminDetails}<p style="font-size:14px;line-height:1.5;margin-top:22px;">Aucun numéro de carte ou donnée bancaire sensible n’est transmis dans cet e-mail.</p>`
      )
    });

    await updateEmailState(stripe, rental, "email_admin_sent", "true");
  }

  if (isEmail(partnerEmail) && metadata.email_partner_sent !== "true") {
    const partnerDetails = detailsTable([
      ["Référence", orderId],
      ["Matériel", product],
      ["Dates", rentalDates],
      ["Lieu", location],
      ["Livraison", text(metadata.delivery_method, "Non indiqué")],
      ["Technicien", metadata.technician === "yes" ? "Oui" : "Non"],
      ["Client", customerName],
      ["E-mail client", customerEmail || "Non indiqué"],
      ["Téléphone", customerPhone],
      ["Paiement location", "Validé"],
      ["Caution", deposit ? "Autorisée, non débitée" : "Non applicable"]
    ]);

    await resendEmail({
      to: partnerEmail,
      subject: `Nouvelle réservation à préparer ${orderId} – ${product}`,
      idempotencyKey: `rss:${orderId}:partner-notification`,
      html: emailLayout(
        "Nouvelle réservation à préparer",
        `Bonjour ${escapeHtml(partnerName)}, une réservation payée vous est attribuée.`,
        `${partnerDetails}<p style="font-size:14px;line-height:1.5;margin-top:22px;">Merci de contacter le client pour confirmer les modalités opérationnelles.</p>`
      )
    });

    await updateEmailState(stripe, rental, "email_partner_sent", "true");
  } else if (!isEmail(partnerEmail) && metadata.email_partner_sent !== "not_applicable") {
    await updateEmailState(stripe, rental, "email_partner_sent", "not_applicable");
  }

  return { sent: true, orderId };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error("STRIPE_WEBHOOK_SECRET manquante dans Vercel.");
    }

    const stripe = getStripe();
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      return res.status(400).json({ error: "Signature Stripe absente." });
    }

    const event = stripe.webhooks.constructEvent(
      await rawBody(req),
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    const paymentIntent = event.data?.object;

    if (
      event.type === "payment_intent.succeeded" &&
      paymentIntent?.metadata?.type === "rental_payment"
    ) {
      const result = await sendNotificationsWhenReady(stripe, paymentIntent.id);
      return res.status(200).json({ received: true, result });
    }

    if (
      event.type === "payment_intent.amount_capturable_updated" &&
      paymentIntent?.metadata?.type === "deposit_authorization"
    ) {
      const rentalIntentId = text(paymentIntent.metadata.linked_rental_payment_intent_id);
      if (!rentalIntentId) {
        return res.status(200).json({ received: true, skipped: "rental_link_missing" });
      }
      const result = await sendNotificationsWhenReady(stripe, rentalIntentId);
      return res.status(200).json({ received: true, result });
    }

    return res.status(200).json({ received: true, skipped: "event_not_used" });
  } catch (err) {
    console.error("stripe-webhook", err);
    return res.status(400).json({
      error: err.message || "Erreur de traitement du webhook Stripe."
    });
  }
}

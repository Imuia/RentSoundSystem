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

function text(value, fallback = "", maxLength = 500) {
  const result = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
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
    throw new Error(text(data?.message || data?.error || "Erreur Resend lors de l'envoi de l'e-mail."));
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

async function getReceiptUrl(stripe, paymentIntent) {
  const latestCharge = paymentIntent.latest_charge;
  const chargeId = typeof latestCharge === "string" ? latestCharge : latestCharge?.id;
  if (!chargeId) return "";
  try {
    const charge = await stripe.charges.retrieve(chargeId);
    return text(charge.receipt_url, "", 1000);
  } catch {
    return "";
  }
}

async function patchMetadata(stripe, paymentIntentId, patch) {
  const current = await stripe.paymentIntents.retrieve(paymentIntentId);
  const updated = await stripe.paymentIntents.update(paymentIntentId, {
    metadata: {
      ...(current.metadata || {}),
      ...patch,
      notifications_updated_at: new Date().toISOString()
    }
  });
  return updated;
}

function recipientStatus(metadata, recipient) {
  const modern = text(metadata?.[`email_${recipient}_status`]);
  if (modern) return modern;
  const legacy = text(metadata?.[`email_${recipient}_sent`]);
  if (legacy === "true") return "sent";
  if (legacy === "not_applicable") return "not_applicable";
  return "pending";
}

async function sendOne({ stripe, rental, recipient, to, subject, html, idempotencyKey }) {
  const currentStatus = recipientStatus(rental.metadata || {}, recipient);
  if (currentStatus === "sent" || currentStatus === "not_applicable") {
    return { recipient, status: currentStatus, skipped: true, rental };
  }

  if (!isEmail(to)) {
    const updated = await patchMetadata(stripe, rental.id, {
      [`email_${recipient}_status`]: "not_applicable",
      [`email_${recipient}_sent`]: "not_applicable"
    });
    return { recipient, status: "not_applicable", skipped: true, rental: updated };
  }

  let updated = await patchMetadata(stripe, rental.id, {
    [`email_${recipient}_status`]: "sending",
    notification_status: "sending"
  });

  try {
    await resendEmail({ to, subject, html, idempotencyKey });
    updated = await patchMetadata(stripe, rental.id, {
      [`email_${recipient}_status`]: "sent",
      [`email_${recipient}_sent`]: "true"
    });
    return { recipient, status: "sent", rental: updated };
  } catch (error) {
    updated = await patchMetadata(stripe, rental.id, {
      [`email_${recipient}_status`]: "error",
      notification_status: "error",
      notification_last_error: text(error?.message || error, "Erreur d’envoi e-mail", 450)
    });
    throw Object.assign(new Error(text(error?.message || error)), { rental: updated, recipient });
  }
}

async function sendNotificationsWhenReady(stripe, rentalIntentId) {
  let rental = await stripe.paymentIntents.retrieve(rentalIntentId);
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

  if (text(rental.metadata?.notification_status) === "sent") {
    return { sent: true, skipped: "already_sent", orderId: text(rental.metadata?.order_id, rental.id) };
  }

  rental = await patchMetadata(stripe, rental.id, {
    notification_status: "sending",
    notification_last_error: ""
  });

  const currentMetadata = rental.metadata || {};
  const orderId = text(currentMetadata.order_id, rental.id);
  const customer = await getCustomer(stripe, rental.customer);
  const customerEmail = text(rental.receipt_email || customer.email, "", 254);
  const customerName = text(customer.name, "Client", 200);
  const customerPhone = text(customer.phone, "Non indiqué", 80);
  const partnerEmail = text(currentMetadata.partner_email, "", 254);
  const partnerName = text(currentMetadata.partner_name, "Partenaire", 200);
  const adminEmail = text(process.env.ADMIN_EMAIL, "", 254);
  const currency = rental.currency || "eur";
  const receiptUrl = await getReceiptUrl(stripe, rental);

  if (!isEmail(adminEmail)) {
    rental = await patchMetadata(stripe, rental.id, {
      notification_status: "error",
      notification_last_error: "ADMIN_EMAIL manquante ou invalide dans Vercel."
    });
    throw Object.assign(new Error("ADMIN_EMAIL manquante ou invalide dans Vercel."), { rental });
  }

  const rentalDates = `${formatDate(currentMetadata.rental_start)} → ${formatDate(currentMetadata.rental_end)}`;
  const location = text(currentMetadata.rental_city, "Non indiqué", 200);
  const product = text(currentMetadata.listing_name, "Matériel RentSoundSystem", 300);
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

  const errors = [];

  try {
    const receiptBlock = receiptUrl
      ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(receiptUrl)}" style="display:inline-block;background:#fc036d;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:6px;font-weight:700;">Voir le reçu Stripe</a></p>`
      : "";

    const result = await sendOne({
      stripe,
      rental,
      recipient: "customer",
      to: customerEmail,
      subject: `Confirmation de réservation ${orderId} – RentSoundSystem`,
      idempotencyKey: `rss:${orderId}:customer-confirmation`,
      html: emailLayout(
        "Votre réservation est confirmée",
        `Bonjour ${escapeHtml(customerName)}, votre paiement est validé et votre caution est autorisée sans être débitée.`,
        `${publicDetails}${receiptBlock}<p style="font-size:14px;line-height:1.5;margin-top:22px;">Notre équipe ou le partenaire vous contactera pour l’organisation pratique de la location.</p>`
      )
    });
    rental = result.rental;
  } catch (error) {
    errors.push(`client: ${text(error?.message || error, "Erreur", 220)}`);
    rental = error.rental || rental;
  }

  try {
    const adminDetails = detailsTable([
      ["Référence", orderId],
      ["Client", customerName],
      ["E-mail client", customerEmail || "Non indiqué"],
      ["Téléphone", customerPhone],
      ["Société", text(currentMetadata.customer_company, "Non indiquée", 200)],
      ["Matériel", product],
      ["Dates", rentalDates],
      ["Lieu", location],
      ["Livraison", text(currentMetadata.delivery_method, "Non indiqué", 80)],
      ["Technicien", currentMetadata.technician === "yes" ? "Oui" : "Non"],
      ["Partenaire", partnerName],
      ["E-mail partenaire", partnerEmail || "Non indiqué"],
      ["Paiement reçu", formatMoney(rental.amount, currency)],
      ["Caution", depositText],
      ["PaymentIntent location", rental.id],
      ["PaymentIntent caution", deposit?.id || "Aucun"]
    ]);

    const result = await sendOne({
      stripe,
      rental,
      recipient: "admin",
      to: adminEmail,
      subject: `Nouvelle réservation payée ${orderId} – ${product}`,
      idempotencyKey: `rss:${orderId}:admin-notification`,
      html: emailLayout(
        "Nouvelle réservation payée",
        "Le paiement de location est validé et la caution est autorisée.",
        `${adminDetails}<p style="font-size:14px;line-height:1.5;margin-top:22px;">Aucun numéro de carte ou donnée bancaire sensible n’est transmis dans cet e-mail.</p>`
      )
    });
    rental = result.rental;
  } catch (error) {
    errors.push(`admin: ${text(error?.message || error, "Erreur", 220)}`);
    rental = error.rental || rental;
  }

  try {
    const partnerDetails = detailsTable([
      ["Référence", orderId],
      ["Matériel", product],
      ["Dates", rentalDates],
      ["Lieu", location],
      ["Livraison", text(currentMetadata.delivery_method, "Non indiqué", 80)],
      ["Technicien", currentMetadata.technician === "yes" ? "Oui" : "Non"],
      ["Client", customerName],
      ["E-mail client", customerEmail || "Non indiqué"],
      ["Téléphone", customerPhone],
      ["Paiement location", "Validé"],
      ["Caution", deposit ? "Autorisée, non débitée" : "Non applicable"]
    ]);

    const result = await sendOne({
      stripe,
      rental,
      recipient: "partner",
      to: partnerEmail,
      subject: `Nouvelle réservation à préparer ${orderId} – ${product}`,
      idempotencyKey: `rss:${orderId}:partner-notification`,
      html: emailLayout(
        "Nouvelle réservation à préparer",
        `Bonjour ${escapeHtml(partnerName)}, une réservation payée vous est attribuée.`,
        `${partnerDetails}<p style="font-size:14px;line-height:1.5;margin-top:22px;">Merci de contacter le client pour confirmer les modalités opérationnelles.</p>`
      )
    });
    rental = result.rental;
  } catch (error) {
    errors.push(`partenaire: ${text(error?.message || error, "Erreur", 220)}`);
    rental = error.rental || rental;
  }

  const finalMetadata = rental.metadata || {};
  const customerStatus = recipientStatus(finalMetadata, "customer");
  const adminStatus = recipientStatus(finalMetadata, "admin");
  const partnerStatus = recipientStatus(finalMetadata, "partner");
  const complete =
    customerStatus === "sent" &&
    adminStatus === "sent" &&
    (partnerStatus === "sent" || partnerStatus === "not_applicable");

  rental = await patchMetadata(stripe, rental.id, {
    notification_status: complete ? "sent" : "error",
    notification_last_error: complete ? "" : text(errors.join(" | "), "Envoi e-mail incomplet", 450)
  });

  if (!complete) {
    throw Object.assign(new Error(text(errors.join(" | "), "Envoi e-mail incomplet")), { rental });
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
  } catch (error) {
    const message = text(error?.message || error, "Erreur de traitement du webhook.");
    console.error("stripe-webhook", error);
    const isSignatureProblem = /signature|webhook secret|corps brut/i.test(message);
    return res.status(isSignatureProblem ? 400 : 500).json({ error: message });
  }
}

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

async function resendEmail({ to, subject, html, idempotencyKey, attachments = [] }) {
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
      html,
      ...(attachments.length ? { attachments } : {})
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



function stripAccents(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[€]/g, "EUR")
    .replace(/[–—]/g, "-")
    .replace(/[’]/g, "'")
    .replace(/[^\x20-\x7E]/g, " ");
}

function pdfEscape(value) {
  return stripAccents(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapText(value, max = 78) {
  const words = stripAccents(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > max) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = (line + " " + word).trim();
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function formatMajor(value, currency = "eur") {
  return formatMoney(Math.round(Number(value || 0) * 100), currency);
}

function issuerInfo() {
  const appUrl = text(process.env.APP_URL || "https://rentsoundsystem.vercel.app").replace(/\/+$/, "");
  return {
    name: text(process.env.INVOICE_ISSUER_NAME || "RentSoundSystem / IMUIA LLC"),
    address: text(process.env.INVOICE_ISSUER_ADDRESS || "1309 Coffeen Avenue STE 1200, Sheridan, Wyoming 82801, USA"),
    email: text(process.env.INVOICE_ISSUER_EMAIL || process.env.EMAIL_FROM || "contact@rentsoundsystem.com"),
    website: text(process.env.INVOICE_ISSUER_WEBSITE || appUrl),
    registration: text(process.env.INVOICE_ISSUER_REGISTRATION || ""),
    vatNumber: text(process.env.INVOICE_ISSUER_VAT_NUMBER || process.env.INVOICE_ISSUER_TAX_ID || "")
  };
}

function invoiceNumberFor(rental) {
  const metadata = rental.metadata || {};
  const existing = text(metadata.invoice_number);
  if (existing) return existing;
  const created = rental.created ? new Date(rental.created * 1000) : new Date();
  const year = created.getUTCFullYear();
  const source = text(metadata.order_id || rental.id, rental.id).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const suffix = (source || rental.id.replace(/[^A-Za-z0-9]/g, "")).slice(-10);
  return `RSS-${year}-${suffix}`;
}

function buildInvoiceData(rental, deposit, customer = {}) {
  const metadata = rental.metadata || {};
  const currency = rental.currency || "eur";
  const issueDate = rental.created ? new Date(rental.created * 1000) : new Date();
  const invoiceNumber = invoiceNumberFor(rental);
  const issuer = issuerInfo();

  const vatRate = Number(metadata.vat_rate || 0);
  const amountExclTax = Number(metadata.amount_excl_tax || 0);
  const taxAmount = Number(metadata.tax_amount || 0);
  const totalAmount = Number(metadata.total_amount || rental.amount / 100 || 0);
  const quantity = Number(metadata.quantity || 1);
  const days = Number(metadata.rental_days || 1);
  const product = text(metadata.listing_name, "Location de matériel RentSoundSystem");
  const customerName = text(metadata.customer_name || customer.name, "Client");
  const customerCompany = text(metadata.customer_company);
  const customerVat = text(metadata.customer_vat_number);
  const customerAddress = [
    text(metadata.customer_billing_address),
    [text(metadata.customer_billing_postal_code), text(metadata.customer_billing_city)].filter(Boolean).join(" "),
    text(metadata.customer_billing_country_name || metadata.customer_billing_country)
  ].filter(Boolean);

  const taxMode = text(metadata.tax_mode, "legacy_public_price");
  const taxMention = metadata.tax_review_required === "yes" || metadata.tax_pending === "yes"
    ? "TVA / regime fiscal a confirmer avant production."
    : taxMode === "tax_exempt"
      ? "TVA non applicable selon regime fiscal de l'emetteur."
      : vatRate > 0
        ? `TVA ${Math.round(vatRate * 10000) / 100}%`
        : "TVA 0% / non renseignee.";

  return {
    invoiceNumber,
    testMode: rental.livemode ? false : true,
    issueDate,
    orderId: text(metadata.order_id, rental.id),
    rentalPaymentIntentId: rental.id,
    depositPaymentIntentId: deposit?.id || text(metadata.linked_deposit_payment_intent_id),
    product,
    quantity,
    days,
    rentalDates: `${formatDate(metadata.rental_start)} - ${formatDate(metadata.rental_end)}`,
    location: text(metadata.rental_city, "Non indique"),
    deliveryMethod: text(metadata.delivery_method, "Non indique"),
    technician: metadata.technician === "yes" ? "Oui" : "Non",
    currency,
    amountExclTax,
    taxAmount,
    totalAmount,
    vatRate,
    taxMention,
    depositText: deposit ? `${formatMoney(deposit.amount, deposit.currency)} - autorisee, non debitee` : "Aucune caution demandee",
    issuer,
    customerName,
    customerCompany,
    customerEmail: text(rental.receipt_email || customer.email),
    customerPhone: text(customer.phone),
    customerVat,
    customerAddress
  };
}

function buildInvoicePdf(invoice) {
  const commands = [];
  const pageHeight = 842;
  let y = 800;

  function textAt(x, size, value, bold = false) {
    commands.push(`BT /F${bold ? 2 : 1} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
    y -= size + 7;
  }

  function row(label, value) {
    commands.push(`BT /F1 9 Tf 55 ${y} Td (${pdfEscape(label)}) Tj ET`);
    commands.push(`BT /F2 9 Tf 310 ${y} Td (${pdfEscape(value)}) Tj ET`);
    y -= 16;
  }

  function hr() {
    commands.push(`0.6 w 55 ${y} m 540 ${y} l S`);
    y -= 18;
  }

  textAt(55, 22, invoice.testMode ? "FACTURE ACQUITTEE - TEST STRIPE" : "FACTURE ACQUITTEE", true);
  textAt(55, 10, `Numero de facture : ${invoice.invoiceNumber}`, true);
  textAt(55, 10, `Date d'emission : ${new Intl.DateTimeFormat("fr-FR").format(invoice.issueDate)}`);
  textAt(55, 10, `Reference reservation : ${invoice.orderId}`);
  if (invoice.testMode) textAt(55, 9, "Document genere en environnement Stripe test - aucun debit reel hors test.", false);
  hr();

  textAt(55, 12, "EMETTEUR", true);
  textAt(55, 9, invoice.issuer.name, true);
  for (const line of wrapText(invoice.issuer.address, 68)) textAt(55, 9, line);
  if (invoice.issuer.registration) textAt(55, 9, `Immatriculation : ${invoice.issuer.registration}`);
  if (invoice.issuer.vatNumber) textAt(55, 9, `TVA / Tax ID : ${invoice.issuer.vatNumber}`);
  textAt(55, 9, `Email : ${invoice.issuer.email}`);
  textAt(55, 9, `Site : ${invoice.issuer.website}`);
  y -= 8;

  textAt(55, 12, "CLIENT", true);
  if (invoice.customerCompany) textAt(55, 9, invoice.customerCompany, true);
  textAt(55, 9, invoice.customerName);
  for (const line of invoice.customerAddress) textAt(55, 9, line);
  if (invoice.customerVat) textAt(55, 9, `TVA / Tax ID client : ${invoice.customerVat}`);
  if (invoice.customerEmail) textAt(55, 9, `Email : ${invoice.customerEmail}`);
  if (invoice.customerPhone) textAt(55, 9, `Telephone : ${invoice.customerPhone}`);
  hr();

  textAt(55, 12, "DETAIL DE LA PRESTATION", true);
  row("Designation", invoice.product);
  row("Dates de location", invoice.rentalDates);
  row("Lieu", invoice.location);
  row("Quantite", String(invoice.quantity));
  row("Duree", `${invoice.days} jour(s)`);
  row("Livraison", invoice.deliveryMethod);
  row("Technicien", invoice.technician);
  hr();

  textAt(55, 12, "MONTANTS", true);
  row("Total HT", formatMajor(invoice.amountExclTax, invoice.currency));
  row(invoice.taxMention, formatMajor(invoice.taxAmount, invoice.currency));
  row("Total TTC paye", formatMajor(invoice.totalAmount, invoice.currency));
  row("Caution", invoice.depositText);
  hr();

  textAt(55, 12, "PAIEMENT", true);
  row("Statut", "Paye par carte bancaire via Stripe");
  row("PaymentIntent location", invoice.rentalPaymentIntentId);
  row("PaymentIntent caution", invoice.depositPaymentIntentId || "Aucun");
  y -= 8;
  for (const line of wrapText("La caution est une autorisation bancaire distincte. Elle n'est pas incluse dans le total facture tant qu'elle n'est pas capturee.", 95)) {
    textAt(55, 8, line);
  }

  const content = [
    "q",
    "1 1 1 rg 0 0 595 842 re f",
    "0 0 0 rg",
    ...commands,
    "Q"
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "ascii");
}

function invoiceDownloadUrl(paymentIntentId, orderId) {
  const base = text(process.env.APP_URL || "https://rentsoundsystem.vercel.app").replace(/\/+$/, "");
  const params = new URLSearchParams({ payment_intent: paymentIntentId, order: orderId });
  return `${base}/api/stripe/invoice?${params.toString()}`;
}


async function updatePaymentMetadata(stripe, paymentIntent, patch) {
  await stripe.paymentIntents.update(paymentIntent.id, {
    metadata: {
      ...paymentIntent.metadata,
      ...patch
    }
  });
  paymentIntent.metadata = {
    ...paymentIntent.metadata,
    ...patch
  };
}

async function updateEmailState(stripe, paymentIntent, key, value) {
  await updatePaymentMetadata(stripe, paymentIntent, { [key]: value });
}

async function sendNotificationsWhenReady(stripe, rentalIntentId) {
  const rental = await stripe.paymentIntents.retrieve(rentalIntentId);

  // Chaque PaymentIntent Stripe représente une tentative de paiement distincte.
  // L'identifiant Stripe est donc la bonne clé d'idempotence pour les e-mails :
  // un retry du webhook ne renvoie pas d'e-mail, mais une nouvelle réservation
  // avec une ancienne référence RSS peut bien recevoir une nouvelle confirmation.
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

  const invoice = buildInvoiceData(rental, deposit, customer);
  const invoicePdf = buildInvoicePdf(invoice);
  const invoiceUrl = invoiceDownloadUrl(rental.id, orderId);

  if (metadata.invoice_number !== invoice.invoiceNumber) {
    await updatePaymentMetadata(stripe, rental, {
      invoice_number: invoice.invoiceNumber,
      invoice_generated: "true"
    });
  }

  const publicDetails = detailsTable([
    ["Référence", orderId],
    ["Facture", invoice.invoiceNumber],
    ["Matériel", product],
    ["Dates", rentalDates],
    ["Lieu", location],
    ["Montant réglé", formatMoney(rental.amount, currency)],
    ["Caution", depositText]
  ]);

  if (isEmail(customerEmail) && metadata.email_customer_sent !== "true") {
    const portalUrl = reservationPortalUrl(orderId);
    const portalBlock = `
      <p style="margin:22px 0 0;">
        <a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:#fc036d;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:6px;font-weight:700;margin-right:8px;">Télécharger ma facture</a>
        <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:6px;font-weight:700;">Voir ma réservation</a>
      </p>
    `;

    await resendEmail({
      to: customerEmail,
      subject: `Confirmation de réservation ${orderId} – RentSoundSystem`,
      idempotencyKey: `rss:${rental.id}:customer-confirmation`,
      html: emailLayout(
        "Votre réservation est confirmée",
        `Bonjour ${escapeHtml(customerName)}, votre paiement est validé et votre caution est autorisée sans être débitée.`,
        `${publicDetails}${portalBlock}<p style="font-size:14px;line-height:1.5;margin-top:22px;">Votre facture professionnelle est jointe à cet e-mail. La caution reste une autorisation bancaire séparée et n’est pas incluse dans le total facturé.</p>`
      ),
      attachments: [
        {
          filename: `${invoice.invoiceNumber}.pdf`,
          content: invoicePdf.toString("base64")
        }
      ]
    });

    await updateEmailState(stripe, rental, "email_customer_sent", "true");
  }

  if (metadata.email_admin_sent !== "true") {
    const adminDetails = detailsTable([
      ["Référence", orderId],
      ["Facture", invoice.invoiceNumber],
      ["Lien facture", invoiceUrl],
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
      idempotencyKey: `rss:${rental.id}:admin-notification`,
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
      idempotencyKey: `rss:${rental.id}:partner-notification`,
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

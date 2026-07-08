import Stripe from "stripe";

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

function isPaymentIntentId(value) {
  return /^pi_[A-Za-z0-9_]+$/.test(text(value));
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

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const paymentIntentId = text(req.query?.payment_intent);
    const order = text(req.query?.order);

    if (!isPaymentIntentId(paymentIntentId)) {
      return res.status(400).json({ error: "PaymentIntent invalide." });
    }

    const stripe = getStripe();
    const rental = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (!rental || rental.metadata?.type !== "rental_payment") {
      return res.status(404).json({ error: "Facture introuvable pour cette réservation." });
    }

    if (order && text(rental.metadata?.order_id) && order !== text(rental.metadata?.order_id)) {
      return res.status(403).json({ error: "Référence de commande incorrecte." });
    }

    if (rental.status !== "succeeded") {
      return res.status(409).json({ error: "La facture sera disponible après validation du paiement." });
    }

    let deposit = null;
    const depositId = text(rental.metadata?.linked_deposit_payment_intent_id);
    if (depositId && /^pi_[A-Za-z0-9_]+$/.test(depositId)) {
      try {
        deposit = await stripe.paymentIntents.retrieve(depositId);
      } catch {
        deposit = null;
      }
    }

    const customer = await getCustomer(stripe, rental.customer);
    const invoice = buildInvoiceData(rental, deposit, customer);
    const pdf = buildInvoicePdf(invoice);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(pdf);
  } catch (err) {
    console.error("stripe-invoice", err);
    return res.status(500).json({
      error: err.message || "Erreur lors de la génération de la facture."
    });
  }
}

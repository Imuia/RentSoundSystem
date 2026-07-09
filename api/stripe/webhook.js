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

function normalizeEmail(value) {
  return text(value).toLowerCase();
}

function customerAccountUrl(orderId) {
  const base = text(process.env.APP_URL || "https://rentsoundsystem.vercel.app").replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (orderId) params.set("order", orderId);
  const query = params.toString();
  return `${base}/espace-client-reservations.html${query ? `?${query}` : ""}`;
}

function supabaseAdminConfig() {
  const url = text(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const serviceKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceKey) {
    return null;
  }
  return { url, serviceKey };
}

async function supabaseAdminRequest(path, { method = "GET", body, extraHeaders = {} } = {}) {
  const config = supabaseAdminConfig();
  if (!config) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquante.");
  }

  const response = await fetch(`${config.url}${path}`, {
    method,
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...extraHeaders
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const raw = await response.text();
  const data = raw ? (() => {
    try { return JSON.parse(raw); } catch { return raw; }
  })() : null;

  if (!response.ok) {
    const message = typeof data === "string"
      ? data
      : data?.msg || data?.message || data?.error_description || data?.error || `Erreur Supabase ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function getProfileById(userId) {
  if (!userId) return null;
  const query = new URLSearchParams();
  query.set("select", "id,email,full_name,company_name,role,phone,created_at");
  query.set("id", `eq.${userId}`);
  query.set("limit", "1");
  const rows = await supabaseAdminRequest(`/rest/v1/profiles?${query.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getProfileByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const query = new URLSearchParams();
  query.set("select", "id,email,full_name,company_name,role,phone,created_at");
  query.set("email", `eq.${normalized}`);
  query.set("limit", "1");
  const rows = await supabaseAdminRequest(`/rest/v1/profiles?${query.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function saveCustomerProfile({ userId, email, fullName, companyName, phone }) {
  const normalizedEmail = normalizeEmail(email);
  if (!userId || !normalizedEmail) return null;

  const existingById = await getProfileById(userId).catch(() => null);
  const safeRole = text(existingById?.role) || "client";
  const payload = {
    id: userId,
    email: normalizedEmail,
    full_name: text(fullName || existingById?.full_name),
    company_name: text(companyName || existingById?.company_name),
    phone: text(phone || existingById?.phone),
    role: safeRole
  };

  if (existingById) {
    const query = new URLSearchParams();
    query.set("id", `eq.${userId}`);
    const rows = await supabaseAdminRequest(`/rest/v1/profiles?${query.toString()}`, {
      method: "PATCH",
      body: payload,
      extraHeaders: { Prefer: "return=representation" }
    });
    return Array.isArray(rows) ? rows[0] || existingById : existingById;
  }

  const existingByEmail = await getProfileByEmail(normalizedEmail).catch(() => null);
  if (existingByEmail && existingByEmail.id && existingByEmail.id !== userId) {
    // Cas rare : un profil existe avec le même e-mail mais un autre id.
    // On évite de modifier ce profil pour ne pas casser un compte partenaire existant.
    return existingByEmail;
  }

  const rows = await supabaseAdminRequest("/rest/v1/profiles", {
    method: "POST",
    body: payload,
    extraHeaders: { Prefer: "return=representation" }
  });
  return Array.isArray(rows) ? rows[0] || payload : payload;
}

async function generateCustomerMagicLink({ email, fullName, companyName, phone, orderId }) {
  const normalizedEmail = normalizeEmail(email);
  const redirectTo = customerAccountUrl(orderId);

  const body = {
    type: "magiclink",
    email: normalizedEmail,
    options: {
      redirect_to: redirectTo,
      data: {
        full_name: text(fullName),
        company_name: text(companyName),
        phone: text(phone),
        role: "client",
        source: "stripe_paid_reservation",
        order_id: text(orderId)
      }
    }
  };

  const data = await supabaseAdminRequest("/auth/v1/admin/generate_link", {
    method: "POST",
    body
  });

  return {
    actionLink: text(data?.properties?.action_link || data?.action_link || redirectTo),
    user: data?.user || data?.data?.user || null
  };
}

async function ensureCustomerAccount(stripe, rental, customer, orderId) {
  const metadata = rental.metadata || {};
  const already = text(metadata.customer_account_status);
  if (["created", "existing", "profile_only"].includes(already)) {
    // Même si le compte a déjà été traité, on génère un lien magique frais
    // pour le bouton e-mail. Un lien direct vers l'espace client renvoie
    // vers la page connexion si le client n'a pas encore de session navigateur.
    const email = normalizeEmail(rental.receipt_email || metadata.customer_email || customer.email);
    if (supabaseAdminConfig() && isEmail(email)) {
      try {
        const fullName = text(metadata.customer_name || customer.name, "Client");
        const companyName = text(metadata.customer_company);
        const phone = text(metadata.customer_phone || customer.phone);
        const link = await generateCustomerMagicLink({ email, fullName, companyName, phone, orderId });
        return {
          status: already,
          userId: text(link.user?.id || metadata.customer_user_id),
          accountUrl: text(link.actionLink) || customerAccountUrl(orderId),
          portalUrl: customerAccountUrl(orderId),
          magicLink: text(link.actionLink),
          skipped: "already_processed_magic_link_refreshed"
        };
      } catch (error) {
        console.error("supabase-refresh-customer-magic-link", error);
      }
    }
    return {
      status: already,
      userId: text(metadata.customer_user_id),
      accountUrl: customerAccountUrl(orderId),
      portalUrl: customerAccountUrl(orderId),
      skipped: "already_processed"
    };
  }

  const config = supabaseAdminConfig();
  if (!config) {
    await updatePaymentMetadata(stripe, rental, {
      customer_account_status: "skipped_missing_supabase_env"
    });
    return { status: "skipped_missing_supabase_env", accountUrl: customerAccountUrl(orderId) };
  }

  const email = normalizeEmail(rental.receipt_email || metadata.customer_email || customer.email);
  if (!isEmail(email)) {
    await updatePaymentMetadata(stripe, rental, { customer_account_status: "skipped_missing_email" });
    return { status: "skipped_missing_email", accountUrl: customerAccountUrl(orderId) };
  }

  const fullName = text(metadata.customer_name || customer.name, "Client");
  const companyName = text(metadata.customer_company);
  const phone = text(metadata.customer_phone || customer.phone);

  try {
    const beforeProfile = await getProfileByEmail(email).catch(() => null);
    const link = await generateCustomerMagicLink({ email, fullName, companyName, phone, orderId });
    const userId = text(link.user?.id || beforeProfile?.id);

    let savedProfile = beforeProfile;
    if (userId) {
      savedProfile = await saveCustomerProfile({ userId, email, fullName, companyName, phone }).catch((error) => {
        console.error("supabase-save-customer-profile", error);
        return beforeProfile;
      });
    }

    const status = beforeProfile ? "existing" : "created";
    await updatePaymentMetadata(stripe, rental, {
      customer_account_status: status,
      customer_user_id: text(userId || savedProfile?.id),
      customer_profile_role: text(savedProfile?.role || "client"),
      customer_account_url: customerAccountUrl(orderId),
      customer_magic_link_generated: text(link.actionLink) ? "true" : "false"
    });

    return {
      status,
      userId: text(userId || savedProfile?.id),
      profile: savedProfile,
      // Le bouton e-mail doit être un lien magique Supabase : il connecte le client
      // puis Supabase le redirige vers customerAccountUrl(orderId).
      accountUrl: text(link.actionLink) || customerAccountUrl(orderId),
      portalUrl: customerAccountUrl(orderId),
      magicLink: text(link.actionLink)
    };
  } catch (error) {
    console.error("supabase-customer-account", error);
    await updatePaymentMetadata(stripe, rental, {
      customer_account_status: "error",
      customer_account_error: text(error.message, 450)
    }).catch(() => {});
    return {
      status: "error",
      error: text(error.message),
      accountUrl: customerAccountUrl(orderId)
    };
  }
}


function reservationBasePayload(rental, deposit, customer, accountResult, orderId) {
  const metadata = rental.metadata || {};
  const customerName = text(metadata.customer_name || customer?.name, "Client");
  const customerEmail = normalizeEmail(rental.receipt_email || metadata.customer_email || customer?.email);
  const customerPhone = text(metadata.customer_phone || customer?.phone);

  return {
    user_id: text(accountResult?.userId),
    equipment_name: text(metadata.listing_name, "Matériel RentSoundSystem"),
    renter_name: text(metadata.partner_name || metadata.owner_name || "RentSoundSystem"),
    start_date: text(metadata.rental_start),
    end_date: text(metadata.rental_end || metadata.rental_start),
    status: "confirmed",
    total_price: Number(rental.amount || 0) / 100,
    customer_email: customerEmail,
    customer_name: customerName,
    customer_phone: customerPhone,
    listing_id: text(metadata.listing_id),
    partner_email: text(metadata.partner_email),
    partner_name: text(metadata.partner_name),
    stripe_customer_id: text(rental.customer || customer?.id),
    rental_payment_intent_id: text(rental.id),
    deposit_payment_intent_id: text(deposit?.id || metadata.linked_deposit_payment_intent_id),
    payment_status: text(rental.status || "succeeded"),
    deposit_status: text(deposit?.status),
    deposit_amount: Number(deposit?.amount || metadata.deposit_amount_cents || 0) / 100
  };
}

function reservationOptionalPayload(rental, orderId, invoiceNumber) {
  const metadata = rental.metadata || {};
  return {
    event_city: text(metadata.rental_city),
    city: text(metadata.rental_city),
    order_id: text(orderId),
    order_reference: text(orderId),
    reference: text(orderId),
    reservation_number: text(orderId),
    invoice_number: text(invoiceNumber),
    tax_amount: Number(metadata.tax_cents || metadata.tax_amount_cents || 0) / 100,
    total: Number(rental.amount || 0) / 100,
    currency: text(rental.currency || "eur"),
    company_name: text(metadata.customer_company),
    delivery_method: text(metadata.delivery_method),
    technician: text(metadata.technician),
    notes: text(metadata.customer_message || metadata.message, 1000)
  };
}

function stripEmptyValues(payload) {
  const output = {};
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && !value.trim()) return;
    if (typeof value === "number" && !Number.isFinite(value)) return;
    output[key] = value;
  });
  return output;
}

async function findReservationByPaymentIntent(paymentIntentId) {
  const id = text(paymentIntentId);
  if (!id) return null;
  const query = new URLSearchParams();
  query.set("select", "id,user_id,rental_payment_intent_id,customer_email,created_at");
  query.set("rental_payment_intent_id", `eq.${id}`);
  query.set("limit", "1");
  const rows = await supabaseAdminRequest(`/rest/v1/reservations?${query.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function patchReservationById(reservationId, payload) {
  const id = text(reservationId);
  if (!id) return null;
  const query = new URLSearchParams();
  query.set("id", `eq.${id}`);
  const rows = await supabaseAdminRequest(`/rest/v1/reservations?${query.toString()}`, {
    method: "PATCH",
    body: payload,
    extraHeaders: { Prefer: "return=representation" }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function insertReservation(payload) {
  const rows = await supabaseAdminRequest("/rest/v1/reservations", {
    method: "POST",
    body: payload,
    extraHeaders: { Prefer: "return=representation" }
  });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function syncPaidReservationToSupabase(stripe, rental, deposit, customer, accountResult, orderId, invoiceNumber) {
  const metadata = rental.metadata || {};
  const userId = text(accountResult?.userId || metadata.customer_user_id);
  if (!supabaseAdminConfig()) {
    return { status: "skipped_missing_supabase_env" };
  }
  if (!userId) {
    await updatePaymentMetadata(stripe, rental, {
      reservation_sync_status: "skipped_missing_user_id"
    }).catch(() => {});
    return { status: "skipped_missing_user_id" };
  }

  const basePayload = stripEmptyValues(reservationBasePayload(rental, deposit, customer, { ...accountResult, userId }, orderId));
  const richPayload = stripEmptyValues({
    ...basePayload,
    ...reservationOptionalPayload(rental, orderId, invoiceNumber)
  });

  try {
    let reservation = await findReservationByPaymentIntent(rental.id).catch(() => null);
    if (reservation?.id) {
      try {
        reservation = await patchReservationById(reservation.id, richPayload);
      } catch (error) {
        const msg = String(error?.message || "").toLowerCase();
        if (msg.includes("schema cache") || msg.includes("could not find") || msg.includes("column")) {
          reservation = await patchReservationById(reservation.id, basePayload);
        } else {
          throw error;
        }
      }
    } else {
      try {
        reservation = await insertReservation(richPayload);
      } catch (error) {
        const msg = String(error?.message || "").toLowerCase();
        if (msg.includes("schema cache") || msg.includes("could not find") || msg.includes("column")) {
          reservation = await insertReservation(basePayload);
        } else {
          throw error;
        }
      }
    }

    await updatePaymentMetadata(stripe, rental, {
      reservation_sync_status: reservation?.id ? "linked" : "saved",
      reservation_user_id: userId,
      reservation_row_id: text(reservation?.id)
    }).catch(() => {});

    return {
      status: reservation?.id ? "linked" : "saved",
      reservationId: text(reservation?.id),
      userId
    };
  } catch (error) {
    console.error("supabase-sync-paid-reservation", error);
    await updatePaymentMetadata(stripe, rental, {
      reservation_sync_status: "error",
      reservation_sync_error: text(error.message, 450)
    }).catch(() => {});
    return { status: "error", error: text(error.message), userId };
  }
}



const INVOICE_LOGO_JPEG_BASE64 = "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";
const INVOICE_LOGO_WIDTH = 240;
const INVOICE_LOGO_HEIGHT = 214;


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
  return {
    name: text(process.env.INVOICE_ISSUER_NAME || "RentSoundSystem / IMUIA LLC"),
    address: text(process.env.INVOICE_ISSUER_ADDRESS || "1309 Coffeen Avenue STE 1200, Sheridan, Wyoming 82801, USA"),
    email: text(process.env.INVOICE_ISSUER_EMAIL || "info@rentsoundsystem.com"),
    website: text(process.env.INVOICE_ISSUER_WEBSITE || "https://rentsoundsystem.com"),
    registration: text(process.env.INVOICE_ISSUER_REGISTRATION || ""),
    vatNumber: text(process.env.INVOICE_ISSUER_VAT_NUMBER || process.env.INVOICE_ISSUER_TAX_ID || ""),
    phone: text(process.env.INVOICE_ISSUER_PHONE || "")
  };
}

function labelDeliveryMethod(value) {
  const method = String(value || "").trim().toLowerCase();
  if (["delivery", "livraison", "transport"].includes(method)) return "Livraison et reprise";
  if (["pickup", "retreat", "retrait", "warehouse"].includes(method)) return "Retrait en entrepot";
  return text(value, "Non indique");
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
    paymentDate: issueDate,
    orderId: text(metadata.order_id, rental.id),
    rentalPaymentIntentId: rental.id,
    depositPaymentIntentId: deposit?.id || text(metadata.linked_deposit_payment_intent_id),
    product,
    quantity,
    days,
    rentalDates: `${formatDate(metadata.rental_start)} - ${formatDate(metadata.rental_end)}`,
    location: text(metadata.rental_city, "Non indique"),
    deliveryMethod: labelDeliveryMethod(metadata.delivery_method),
    technician: metadata.technician === "yes" ? "Oui" : "Non",
    serviceNature: "Prestation de services - location de materiel audio professionnel",
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
  const pageWidth = 595;
  const pageHeight = 842;
  const commands = [];
  const fuchsia = "0.988 0.012 0.427";
  const black = "0 0 0";
  const textBlack = "0.09 0.09 0.10";
  const muted = "0.38 0.38 0.42";
  const light = "0.975 0.975 0.982";
  const border = "0.82 0.82 0.86";
  const paleFuchsia = "1 0.955 0.980";

  function pdfEscape(value) {
    return stripAccents(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  }

  function color(rgb) {
    commands.push(`${rgb} rg ${rgb} RG`);
  }

  function rect(x, y, w, h, fillRgb = null, strokeRgb = null, lineWidth = 0.5) {
    commands.push("q");
    if (fillRgb) commands.push(`${fillRgb} rg`);
    if (strokeRgb) commands.push(`${strokeRgb} RG ${lineWidth} w`);
    commands.push(`${x} ${y} ${w} ${h} re ${fillRgb && strokeRgb ? "B" : fillRgb ? "f" : "S"}`);
    commands.push("Q");
  }

  function line(x1, y1, x2, y2, rgb = border, w = 0.5) {
    commands.push(`q ${rgb} RG ${w} w ${x1} ${y1} m ${x2} ${y2} l S Q`);
  }

  function drawText(x, y, size, value, bold = false, rgb = textBlack) {
    commands.push("q");
    color(rgb);
    commands.push(`BT /F${bold ? 2 : 1} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`);
    commands.push("Q");
  }

  function drawRight(xRight, y, size, value, bold = false, rgb = textBlack) {
    const clean = stripAccents(value);
    const approxWidth = clean.length * size * 0.50;
    drawText(Math.max(40, xRight - approxWidth), y, size, value, bold, rgb);
  }

  function drawCenter(x, width, y, size, value, bold = false, rgb = textBlack) {
    const clean = stripAccents(value);
    const approxWidth = clean.length * size * 0.50;
    drawText(x + Math.max(0, (width - approxWidth) / 2), y, size, value, bold, rgb);
  }

  function drawWrapped(x, y, size, value, maxChars, lineHeight = size + 4, bold = false, rgb = textBlack, maxLines = 5) {
    const lines = wrapText(value, maxChars).slice(0, maxLines);
    lines.forEach((lineText, index) => drawText(x, y - index * lineHeight, size, lineText, bold, rgb));
    return y - lines.length * lineHeight;
  }

  function money(value) {
    return formatMajor(value, invoice.currency);
  }

  function percent(rate) {
    const n = Number(rate || 0);
    if (!Number.isFinite(n) || n <= 0) return "0%";
    return `${Math.round(n * 10000) / 100}%`;
  }

  const issueDate = new Intl.DateTimeFormat("fr-FR").format(invoice.issueDate);
  const paymentDate = new Intl.DateTimeFormat("fr-FR").format(invoice.paymentDate || invoice.issueDate);
  const unitHt = invoice.quantity > 0 && invoice.days > 0
    ? invoice.amountExclTax / (invoice.quantity * invoice.days)
    : invoice.amountExclTax;
  const taxColumn = invoice.taxAmount > 0 ? `${percent(invoice.vatRate)} - ${money(invoice.taxAmount)}` : `${percent(invoice.vatRate)} - ${money(0)}`;

  // Page background and top identity line.
  rect(0, 0, pageWidth, pageHeight, "1 1 1");
  rect(0, 812, pageWidth, 30, black);
  drawText(46, 823, 8.2, "RENTSOUNDSYSTEM - LOCATION DE MATERIEL AUDIO PROFESSIONNEL", true, "1 1 1");
  drawRight(549, 823, 8.2, invoice.issuer.website.replace(/^https?:\/\//, ""), false, "1 1 1");

  // Header: smaller logo, clear invoice status.
  commands.push("q 94 0 0 84 46 705 cm /Im1 Do Q");
  drawText(46, 694, 7.6, invoice.issuer.name, true, textBlack);
  drawWrapped(46, 682, 6.8, invoice.issuer.address, 42, 8, false, muted, 2);

  // Right invoice block: fixed left edge and fixed width.
  // This avoids the visual zigzag caused by right-aligning every line with a different text length.
  const invoiceBlockX = 358;
  const invoiceBlockW = 191;
  drawText(invoiceBlockX, 760, 32, "FACTURE", true, fuchsia);
  rect(invoiceBlockX, 736, invoiceBlockW, 19, invoice.testMode ? paleFuchsia : light, invoice.testMode ? fuchsia : border, 0.7);
  drawCenter(invoiceBlockX, invoiceBlockW, 742, 8.6, invoice.testMode ? "ACQUITTEE - TEST STRIPE" : "FACTURE ACQUITTEE", true, invoice.testMode ? fuchsia : textBlack);
  drawText(invoiceBlockX, 720, 8.6, `No facture : ${invoice.invoiceNumber}`, true, textBlack);
  drawText(invoiceBlockX, 706, 7.8, `Date d'emission : ${issueDate}`, false, muted);
  drawText(invoiceBlockX, 692, 7.8, `Reservation : ${invoice.orderId}`, false, muted);
  drawText(invoiceBlockX, 678, 7.3, `Date de prestation : ${invoice.rentalDates}`, false, muted);
  drawText(invoiceBlockX, 664, 7.8, `Date de paiement : ${paymentDate}`, false, muted);

  if (invoice.testMode) {
    rect(46, 632, 503, 22, "1 0.94 0.97", fuchsia, 0.7);
    drawText(56, 639, 8.3, "DOCUMENT TEST STRIPE - aucun debit reel hors environnement de test.", true, fuchsia);
  }

  // Issuer / client cards.
  const cardsY = 492;
  rect(46, cardsY, 238, 122, light, border, 0.6);
  rect(310, cardsY, 239, 122, light, border, 0.6);
  drawText(58, cardsY + 101, 10, "EMETTEUR", true, fuchsia);
  drawWrapped(58, cardsY + 84, 8.2, invoice.issuer.name, 34, 11, true, textBlack, 2);
  let yIssuer = cardsY + 61;
  for (const lineText of wrapText(invoice.issuer.address, 40).slice(0, 3)) {
    drawText(58, yIssuer, 7.3, lineText, false, muted);
    yIssuer -= 9.5;
  }
  drawText(58, yIssuer, 7.3, `Email : ${invoice.issuer.email}`, false, muted);
  yIssuer -= 9.5;
  drawText(58, yIssuer, 7.3, `Site : ${invoice.issuer.website}`, false, muted);
  yIssuer -= 9.5;
  drawText(58, yIssuer, 7.1, `ID entreprise : ${invoice.issuer.registration || "a renseigner avant production"}`, false, muted);
  yIssuer -= 9.5;
  drawText(58, yIssuer, 7.1, `TVA / Tax ID : ${invoice.issuer.vatNumber || "a confirmer avant production"}`, false, muted);

  drawText(322, cardsY + 101, 10, "CLIENT / FACTURATION", true, fuchsia);
  let yClient = cardsY + 84;
  if (invoice.customerCompany) {
    drawText(322, yClient, 8.5, invoice.customerCompany, true, textBlack);
    yClient -= 11;
  }
  drawText(322, yClient, 8.2, invoice.customerName, false, textBlack);
  yClient -= 10.5;
  for (const lineText of invoice.customerAddress.slice(0, 4)) {
    drawText(322, yClient, 7.3, lineText, false, muted);
    yClient -= 9.5;
  }
  drawText(322, yClient, 7.1, `TVA / Tax ID client : ${invoice.customerVat || "non renseigne"}`, false, muted);
  yClient -= 9.5;
  if (invoice.customerEmail) {
    drawText(322, yClient, 7.3, `Email : ${invoice.customerEmail}`, false, muted);
    yClient -= 9.5;
  }
  if (invoice.customerPhone) drawText(322, yClient, 7.3, `Telephone : ${invoice.customerPhone}`, false, muted);

  // Service table: more complete EU-style line with unit price and VAT rate/amount.
  drawText(46, 458, 12, "DETAIL DE LA PRESTATION", true, textBlack);
  drawRight(549, 458, 7.4, invoice.serviceNature || "Prestation de services", false, muted);
  const tableX = 46;
  const tableY = 424;
  const widths = [190, 28, 34, 58, 62, 63, 68];
  const cols = [tableX];
  for (let i = 0; i < widths.length - 1; i++) cols.push(cols[i] + widths[i]);
  const headers = ["Designation", "Qte", "Jours", "PU HT", "Total HT", "TVA", "Total TTC"];
  rect(tableX, tableY, 503, 23, black);
  let cursorX = tableX;
  headers.forEach((h, i) => {
    drawText(cursorX + 5, tableY + 8, 6.8, h, true, "1 1 1");
    cursorX += widths[i];
  });
  rect(tableX, tableY - 96, 503, 96, "1 1 1", border, 0.6);
  let vline = tableX;
  for (const w of widths.slice(0, -1)) {
    vline += w;
    line(vline, tableY - 96, vline, tableY, "0.90 0.90 0.92", 0.5);
  }
  const detailY = tableY - 18;
  drawWrapped(tableX + 6, detailY, 7.8, invoice.product, 33, 10, true, textBlack, 3);
  drawText(tableX + 6, tableY - 65, 6.8, `Periode : ${invoice.rentalDates}`, false, muted);
  drawText(tableX + 6, tableY - 76, 6.8, `Lieu : ${invoice.location}`, false, muted);
  drawText(tableX + 6, tableY - 87, 6.8, `Logistique : ${invoice.deliveryMethod} - Technicien : ${invoice.technician}`, false, muted);
  drawText(cols[1] + 8, detailY, 7.8, String(invoice.quantity), false, textBlack);
  drawText(cols[2] + 7, detailY, 7.8, `${invoice.days}`, false, textBlack);
  drawRight(cols[3] + widths[3] - 5, detailY, 7.6, money(unitHt), false, textBlack);
  drawRight(cols[4] + widths[4] - 5, detailY, 7.6, money(invoice.amountExclTax), false, textBlack);
  drawRight(cols[5] + widths[5] - 5, detailY, 7.2, taxColumn, false, textBlack);
  drawRight(cols[6] + widths[6] - 6, detailY, 7.8, money(invoice.totalAmount), true, textBlack);

  // VAT note and totals.
  rect(46, 260, 278, 54, "0.985 0.985 0.99", border, 0.6);
  drawText(58, 297, 9.5, "REGIME TVA / MENTION FISCALE", true, fuchsia);
  drawWrapped(58, 282, 7.0, invoice.taxMention, 66, 9, false, muted, 3);

  rect(350, 238, 199, 76, "0.985 0.985 0.99", border, 0.6);
  drawText(362, 297, 9.5, "RECAPITULATIF", true, fuchsia);
  drawText(362, 281, 8.0, "Total HT", false, muted);
  drawRight(538, 281, 8.0, money(invoice.amountExclTax), false, textBlack);
  drawText(362, 266, 8.0, "TVA", false, muted);
  drawRight(538, 266, 8.0, money(invoice.taxAmount), false, textBlack);
  line(362, 257, 538, 257, border, 0.5);
  drawText(362, 244, 9.5, "TOTAL TTC PAYE", true, textBlack);
  drawRight(538, 244, 10.8, money(invoice.totalAmount), true, fuchsia);

  // Deposit block.
  rect(46, 184, 503, 38, "1 0.98 0.99", fuchsia, 0.6);
  drawText(58, 207, 9.5, "CAUTION - HORS TOTAL FACTURE", true, fuchsia);
  drawWrapped(58, 194, 6.9, `${invoice.depositText}. Autorisation bancaire distincte, non incluse dans le total facture tant qu'elle n'est pas capturee.`, 128, 8, false, muted, 2);

  // Payment and commercial terms.
  drawText(46, 158, 11, "PAIEMENT ET CONDITIONS", true, textBlack);
  rect(46, 72, 503, 74, "1 1 1", border, 0.6);
  drawText(58, 127, 7.8, "Statut", false, muted);
  drawText(190, 127, 7.8, "Paye par carte bancaire via Stripe", true, textBlack);
  drawText(58, 112, 7.8, "Conditions de reglement", false, muted);
  drawText(190, 112, 7.8, "Facture acquittee - paiement comptant", false, textBlack);
  drawText(58, 97, 7.8, "Reference location", false, muted);
  drawText(190, 97, 7.2, invoice.rentalPaymentIntentId, false, textBlack);
  drawText(58, 82, 7.8, "Reference caution", false, muted);
  drawText(190, 82, 7.2, invoice.depositPaymentIntentId || "Aucune", false, textBlack);

  // Footer/legal.
  line(46, 56, 549, 56, border, 0.5);
  const footer = `${invoice.issuer.name} - ${invoice.issuer.address} - ${invoice.issuer.email} - ${invoice.issuer.website}`;
  drawWrapped(46, 44, 5.8, footer, 146, 6.6, false, muted, 2);
  drawWrapped(46, 30, 5.8, "Facture etablie selon les informations transmises lors de la reservation. Pour toute correction, contactez l'emetteur avant cloture comptable.", 146, 6.6, false, muted, 2);

  const content = [
    "q",
    ...commands,
    "Q"
  ].join("\n");

  const logoBuffer = Buffer.from(INVOICE_LOGO_JPEG_BASE64, "base64");
  const stringObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 7 0 R >> >> /Contents 6 0 R >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`
  ];

  const objects = stringObjects.map((obj) => Buffer.from(obj, "ascii"));
  objects.push(Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${INVOICE_LOGO_WIDTH} /Height ${INVOICE_LOGO_HEIGHT} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoBuffer.length} >>\nstream\n`, "ascii"),
    logoBuffer,
    Buffer.from("\nendstream", "ascii")
  ]));

  const chunks = [Buffer.from("%PDF-1.4\n", "ascii")];
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    chunks.push(Buffer.from(`${index + 1} 0 obj\n`, "ascii"));
    chunks.push(objects[index]);
    chunks.push(Buffer.from("\nendobj\n", "ascii"));
  }
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(Buffer.from(`xref\n0 ${objects.length + 1}\n`, "ascii"));
  chunks.push(Buffer.from("0000000000 65535 f \n", "ascii"));
  for (let i = 1; i < offsets.length; i++) {
    chunks.push(Buffer.from(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`, "ascii"));
  }
  chunks.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`, "ascii"));
  return Buffer.concat(chunks);
}

function invoiceDownloadUrl(paymentIntentId, orderId) {
  const base = text(process.env.APP_URL || "https://rentsoundsystem.vercel.app").replace(/\/+$/, "");
  const params = new URLSearchParams({ payment_intent: paymentIntentId, order: orderId });
  return `${base}/api/stripe/webhook?invoice=1&${params.toString()}`;
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

  const accountResult = await ensureCustomerAccount(stripe, rental, customer, orderId);

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

  const reservationSync = await syncPaidReservationToSupabase(stripe, rental, deposit, customer, accountResult, orderId, invoice.invoiceNumber);

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
    const portalUrl = accountResult.accountUrl || reservationPortalUrl(orderId);
    const directPortalUrl = accountResult.portalUrl || customerAccountUrl(orderId);
    const portalBlock = `
      <p style="margin:22px 0 0;">
        <a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;background:#fc036d;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:6px;font-weight:700;margin-right:8px;">Télécharger ma facture</a>
        <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 16px;border-radius:6px;font-weight:700;">Accéder à mon compte client</a>
      </p>
      <p style="font-size:12px;line-height:1.5;color:#6b6470;margin:12px 0 0;">
        Le bouton “Accéder à mon compte client” vous connecte automatiquement avec l’e-mail utilisé pour la commande. Si une page de connexion s’affiche, utilisez le même e-mail puis retournez sur : ${escapeHtml(directPortalUrl)}
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
      ["Compte client", text(accountResult.status, "Non traité")],
      ["User ID client", text(accountResult.userId, "Non indiqué")],
      ["Réservation Supabase", text(reservationSync.status, "Non synchronisée")],
      ["ID ligne réservation", text(reservationSync.reservationId, "Non indiqué")],
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

async function handleInvoiceDownload(req, res) {
  const paymentIntentId = text(req.query?.payment_intent);
  const order = text(req.query?.order);

  if (!/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId)) {
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
}

export default async function handler(req, res) {
  if (req.method === "GET" && text(req.query?.invoice) === "1") {
    try {
      return await handleInvoiceDownload(req, res);
    } catch (err) {
      console.error("stripe-webhook-invoice", err);
      return res.status(500).json({
        error: err.message || "Erreur lors de la génération de la facture."
      });
    }
  }

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

function text(value, max = 500) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function escapeHtml(value) {
  return text(value, 5000)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function baseUrl() {
  return text(process.env.APP_URL || "https://rentsoundsystem.com").replace(/\/+$/, "");
}

async function resendEmail({ to, subject, html }) {
  const apiKey = text(process.env.RESEND_API_KEY);
  const from = text(process.env.EMAIL_FROM || "RentSoundSystem <support@rentsoundsystem.com>");
  if (!apiKey) {
    console.warn("[partner-notify] RESEND_API_KEY missing, skipping email to", to);
    return { skipped: "RESEND_API_KEY missing" };
  }
  if (!isEmail(to)) {
    console.warn("[partner-notify] Invalid email recipient:", to);
    return { skipped: "invalid recipient" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to, subject, html })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Erreur Resend (${response.status})`);
  }
  return data;
}

function emailLayout(title, intro, content) {
  return `
  <div style="margin:0;padding:0;background:#111111;color:#eeeeee;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:28px 18px;">
      <div style="background:#1b1b1b;border:1px solid #3b2330;border-radius:14px;padding:28px;">
        <div style="font-weight:900;color:#fc036d;font-size:20px;letter-spacing:.04em;margin-bottom:20px;">RENTSOUNDSYSTEM</div>
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 12px;color:#ffffff;">${escapeHtml(title)}</h1>
        <p style="font-size:15px;line-height:1.55;color:#e6bcc2;margin:0 0 20px;">${escapeHtml(intro)}</p>
        ${content}
        <div style="margin-top:28px;padding-top:18px;border-top:1px solid #3b2330;font-size:12px;color:#a0a0a0;text-align:center;">
          RentSoundSystem – Plateforme de location de matériel de sonorisation et événementiel.
        </div>
      </div>
    </div>
  </div>`;
}

function detailsTable(rows) {
  return `<table style="width:100%;border-collapse:collapse;margin:18px 0;">${rows.map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #3b2330;color:#e6bcc2;width:180px;font-size:13px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #3b2330;color:#ffffff;font-size:13px;font-weight:700;">${escapeHtml(value || "—")}</td>
    </tr>`).join("")}</table>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const payload = req.body || {};
    const email = text(payload.email || "").toLowerCase().trim();
    const fullName = text(payload.full_name || payload.contact_name || "Partenaire");
    const companyName = text(payload.company_name || "Entreprise");
    const phone = text(payload.phone || "");
    const city = text(payload.city || "");
    const country = text(payload.country || "");
    const categories = Array.isArray(payload.categories) ? payload.categories.join(", ") : text(payload.categories || "");
    const equipmentCount = text(payload.equipment_count || "0");
    const fleetValue = text(payload.fleet_value || "");
    const kycFiles = typeof payload.kyc_files === "object" ? JSON.stringify(payload.kyc_files) : text(payload.kyc_files || payload.document_urls || "");
    const requestId = text(payload.id || payload.request_id || "");

    if (!email || !isEmail(email)) {
      return res.status(400).json({ error: "Adresse email partenaire invalide" });
    }

    const partnerResults = { partner_notified: false, admin_notified: false, errors: [] };

    // 1. Email au Partenaire
    try {
      const partnerSubject = `Demande de partenariat bien reçue – RentSoundSystem`;
      const partnerIntro = `Bonjour ${fullName}, merci pour votre inscription. Votre dossier pour "${companyName}" a été transmis à notre équipe de conformité.`;
      const partnerContent = `
        ${detailsTable([
          ["Société", companyName],
          ["Contact principal", fullName],
          ["Email", email],
          ["Téléphone", phone],
          ["Ville / Pays", `${city} ${country}`.trim()],
          ["Catégories", categories],
          ["Nombre d'équipements", equipmentCount]
        ])}
        <div style="background:#261820;border:1px solid #5d3f44;border-radius:10px;padding:16px;margin:20px 0;">
          <h3 style="margin:0 0 8px;color:#fc036d;font-size:15px;">Prochaines étapes</h3>
          <p style="margin:0;font-size:13px;line-height:1.5;color:#e6bcc2;">
            1. Notre équipe analyse vos informations et vos documents KYC sous 24h à 48h.<br>
            2. Dès validation, vous recevrez un e-mail de confirmation activant votre accès complet au tableau de bord partenaire.<br>
            3. Vous pourrez alors publier vos annonces et recevoir vos premières réservations.
          </p>
        </div>
      `;

      await resendEmail({
        to: email,
        subject: partnerSubject,
        html: emailLayout("Confirmation de votre demande partenaire", partnerIntro, partnerContent)
      });
      partnerResults.partner_notified = true;
    } catch (err) {
      console.error("[partner-notify] Erreur envoi email partenaire:", err);
      partnerResults.errors.push(`Partner email error: ${err.message}`);
    }

    // 2. Email à l'Administrateur
    try {
      const adminEmail = text(process.env.ADMIN_EMAIL || process.env.SUPPORT_EMAIL || "support@rentsoundsystem.com");
      const adminSubject = `🚨 Nouveau partenaire à valider : ${companyName} (${fullName})`;
      const adminIntro = `Un nouveau dossier de partenariat à valider vient d'être soumis sur RentSoundSystem.`;
      const adminDashboardUrl = `${baseUrl()}/admin-partenaires.html`;

      const adminContent = `
        ${detailsTable([
          ["ID Demande", requestId],
          ["Société", companyName],
          ["Nom / Contact", fullName],
          ["Email", email],
          ["Téléphone", phone],
          ["Localisation", `${city}, ${country}`],
          ["Catégories", categories],
          ["Taille de parc", equipmentCount],
          ["Valeur estimée du parc", fleetValue],
          ["Documents / KYC", kycFiles]
        ])}
        <p style="margin-top:24px;">
          <a href="${escapeHtml(adminDashboardUrl)}" style="display:inline-block;background:#fc036d;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:800;font-size:14px;">
            Examiner le dossier partenaire
          </a>
        </p>
      `;

      await resendEmail({
        to: adminEmail,
        subject: adminSubject,
        html: emailLayout("Nouveau partenaire à valider", adminIntro, adminContent)
      });
      partnerResults.admin_notified = true;
    } catch (err) {
      console.error("[partner-notify] Erreur envoi email admin:", err);
      partnerResults.errors.push(`Admin email error: ${err.message}`);
    }

    return res.status(200).json({
      ok: true,
      partner_notified: partnerResults.partner_notified,
      admin_notified: partnerResults.admin_notified,
      errors: partnerResults.errors
    });

  } catch (error) {
    console.error("[partner-notify] Fatal handler error:", error);
    return res.status(500).json({ error: error.message || "Erreur lors de la notification partenaire" });
  }
}

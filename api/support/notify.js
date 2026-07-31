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
  return text(process.env.APP_URL || "https://rentsoundsystem.vercel.app").replace(/\/+$/, "");
}

async function supabaseRequest(path, { method = "GET", body = null, service = true, bearer = null } = {}) {
  const url = text(process.env.SUPABASE_URL).replace(/\/+$/, "");
  const serviceKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
  const anonKey = text(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || serviceKey);
  if (!url || !serviceKey) throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquante.");
  const headers = {
    "apikey": service ? serviceKey : anonKey,
    "Authorization": bearer ? `Bearer ${bearer}` : `Bearer ${serviceKey}`,
    "Content-Type": "application/json"
  };
  const response = await fetch(`${url}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const raw = await response.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Erreur Supabase ${response.status}`);
  }
  return data;
}

async function getAuthUser(accessToken) {
  if (!accessToken) return null;
  try {
    return await supabaseRequest("/auth/v1/user", { service: false, bearer: accessToken });
  } catch {
    return null;
  }
}

async function isSupportAgent(userId) {
  if (!userId) return false;
  try {
    const rows = await supabaseRequest(`/rest/v1/support_agents?user_id=eq.${encodeURIComponent(userId)}&select=user_id&limit=1`);
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

async function resendEmail({ to, subject, html }) {
  const apiKey = text(process.env.RESEND_API_KEY);
  const from = text(process.env.EMAIL_FROM || "RentSoundSystem <support@rentsoundsystem.com>");
  if (!apiKey) return { skipped: "RESEND_API_KEY missing" };
  if (!isEmail(to)) return { skipped: "invalid recipient" };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || "Erreur Resend.");
  return data;
}

function emailLayout(title, intro, content) {
  return `
  <div style="margin:0;padding:0;background:#111;color:#eee;font-family:Inter,Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:28px 18px;">
      <div style="background:#1b1b1b;border:1px solid #3b2330;border-radius:14px;padding:24px;">
        <div style="font-weight:900;color:#fc036d;font-size:18px;letter-spacing:.04em;margin-bottom:18px;">RENTSOUNDSYSTEM</div>
        <h1 style="font-size:24px;line-height:1.25;margin:0 0 10px;color:#fff;">${escapeHtml(title)}</h1>
        <p style="font-size:15px;line-height:1.55;color:#e6bcc2;margin:0 0 20px;">${escapeHtml(intro)}</p>
        ${content}
      </div>
    </div>
  </div>`;
}

function detailsTable(rows) {
  return `<table style="width:100%;border-collapse:collapse;margin:18px 0;">${rows.map(([label, value]) => `
    <tr><td style="padding:10px;border-bottom:1px solid #3b2330;color:#e6bcc2;width:180px;font-size:13px;">${escapeHtml(label)}</td><td style="padding:10px;border-bottom:1px solid #3b2330;color:#fff;font-size:13px;font-weight:700;">${escapeHtml(value || "—")}</td></tr>`).join("")}</table>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
    const user = await getAuthUser(token);
    if (!user?.id) return res.status(401).json({ error: "Session invalide" });

    const threadId = text(req.body?.thread_id, 80);
    const messageId = text(req.body?.message_id, 80);
    const eventType = text(req.body?.event || "client_message", 80);
    if (!threadId) return res.status(400).json({ error: "thread_id manquant" });

    const threads = await supabaseRequest(`/rest/v1/support_threads?id=eq.${encodeURIComponent(threadId)}&select=*&limit=1`);
    const thread = Array.isArray(threads) ? threads[0] : null;
    if (!thread) return res.status(404).json({ error: "Ticket introuvable" });

    const agent = await isSupportAgent(user.id);
    if (String(thread.user_id) !== String(user.id) && !agent) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    let message = null;
    if (messageId) {
      const messages = await supabaseRequest(`/rest/v1/support_messages?id=eq.${encodeURIComponent(messageId)}&thread_id=eq.${encodeURIComponent(threadId)}&select=*&limit=1`);
      message = Array.isArray(messages) ? messages[0] : null;
    }

    const clientUrl = `${baseUrl()}/espace-client-messagerie.html?thread=${encodeURIComponent(thread.id)}`;
    const adminUrl = `${baseUrl()}/support-inbox.html?thread=${encodeURIComponent(thread.id)}`;
    const ticketRef = thread.ticket_number || `Ticket ${String(thread.id).slice(0, 8)}`;

    if (eventType === "support_reply") {
      await resendEmail({
        to: thread.client_email,
        subject: `Réponse support ${ticketRef} – RentSoundSystem`,
        html: emailLayout(
          "Réponse à votre ticket support",
          "L’équipe RentSoundSystem a répondu à votre demande.",
          `${detailsTable([["Ticket", ticketRef], ["Objet", thread.subject], ["Statut", thread.status], ["Message", message?.body || "Nouvelle réponse disponible"]])}<p><a href="${escapeHtml(clientUrl)}" style="display:inline-block;background:#fc036d;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:800;">Voir la réponse</a></p>`
        )
      });
      return res.status(200).json({ ok: true, notified: "client" });
    }

    const adminEmail = text(process.env.ADMIN_EMAIL);
    await resendEmail({
      to: adminEmail,
      subject: `Nouveau ticket support ${ticketRef} – ${thread.subject || "RentSoundSystem"}`,
      html: emailLayout(
        "Nouveau ticket support",
        "Un client a ouvert ou mis à jour une demande support.",
        `${detailsTable([["Ticket", ticketRef], ["Objet", thread.subject], ["Catégorie", thread.category || "Non indiquée"], ["Priorité", thread.priority || "normale"], ["Client", thread.client_name || "Client"], ["E-mail", thread.client_email || "—"], ["Statut", thread.status || "open"], ["Message", message?.body || "Voir la conversation"]])}<p><a href="${escapeHtml(adminUrl)}" style="display:inline-block;background:#fc036d;color:#fff;text-decoration:none;padding:12px 16px;border-radius:8px;font-weight:800;">Ouvrir la boîte support</a></p>`
      )
    });

    return res.status(200).json({ ok: true, notified: "admin" });
  } catch (error) {
    console.error("support notify", error);
    return res.status(500).json({ error: error.message || "Erreur notification support" });
  }
}

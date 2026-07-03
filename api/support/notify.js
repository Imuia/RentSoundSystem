function clean(value, limit = 500) {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}

function escapeHtml(value) {
  return clean(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isEmail(value) {
  return /^\S+@\S+\.\S+$/.test(clean(value));
}

function baseUrl() {
  return clean(process.env.APP_URL || "https://rentsoundsystem.vercel.app").replace(/\/+$/, "");
}

async function supabaseRequest(path, options = {}) {
  const url = `${process.env.SUPABASE_URL}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || data?.error || "Erreur Supabase.");
  }
  return data;
}

async function currentUser(accessToken) {
  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`
    }
  });
  const user = await response.json().catch(() => null);
  if (!response.ok || !user?.id) throw new Error("Session utilisateur invalide.");
  return user;
}

async function isSupportAgent(userId) {
  const rows = await supabaseRequest(`/rest/v1/support_agents?select=user_id,active&user_id=eq.${encodeURIComponent(userId)}&active=eq.true&limit=1`);
  return Array.isArray(rows) && rows.length > 0;
}

async function resendEmail({ to, subject, html, idempotencyKey }) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    throw new Error("Configuration e-mail Resend incomplète.");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [to],
      subject,
      html
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || "Erreur Resend.");
  return data;
}

function emailLayout(title, intro, body) {
  return `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f4f5;font-family:Arial,Helvetica,sans-serif;color:#1b1719"><div style="max-width:680px;margin:0 auto;padding:28px 16px"><div style="background:#111;padding:22px 28px;border-radius:10px 10px 0 0;color:#fc036d;font-weight:800;font-size:20px">RENTSOUNDSYSTEM</div><div style="background:#fff;padding:30px 28px;border-radius:0 0 10px 10px"><h1 style="font-size:24px;margin:0 0 14px">${escapeHtml(title)}</h1><p style="font-size:16px;line-height:1.55;margin:0 0 18px">${escapeHtml(intro)}</p>${body}<p style="font-size:13px;color:#6b6470;margin:28px 0 0">RentSoundSystem · Location de matériel audio professionnel</p></div></div></body></html>`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({ error: "Configuration Supabase serveur manquante." });
    }

    const auth = clean(req.headers.authorization || "");
    const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!accessToken) return res.status(401).json({ error: "Session requise." });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const threadId = clean(body.thread_id, 100);
    const messageId = clean(body.message_id, 100);
    const event = clean(body.event, 50);

    if (!threadId || !messageId || !["client_message", "support_reply"].includes(event)) {
      return res.status(400).json({ error: "Notification invalide." });
    }

    const user = await currentUser(accessToken);
    const threads = await supabaseRequest(`/rest/v1/support_threads?select=*&id=eq.${encodeURIComponent(threadId)}&limit=1`);
    const thread = Array.isArray(threads) ? threads[0] : null;
    if (!thread) return res.status(404).json({ error: "Demande introuvable." });

    const messages = await supabaseRequest(`/rest/v1/support_messages?select=*&id=eq.${encodeURIComponent(messageId)}&thread_id=eq.${encodeURIComponent(threadId)}&limit=1`);
    const message = Array.isArray(messages) ? messages[0] : null;
    if (!message) return res.status(404).json({ error: "Message introuvable." });

    const senderIsSupport = await isSupportAgent(user.id);
    if (event === "client_message") {
      if (thread.user_id !== user.id || message.sender_id !== user.id || message.sender_role !== "client") {
        return res.status(403).json({ error: "Action non autorisée." });
      }
      const admin = clean(process.env.ADMIN_EMAIL);
      const recipients = [admin];
      const partner = clean(thread.partner_email);
      if (isEmail(partner) && partner.toLowerCase() !== admin.toLowerCase()) recipients.push(partner);

      const staffUrl = `${baseUrl()}/espace-support-messagerie.html?thread=${encodeURIComponent(threadId)}`;
      await Promise.all(
        recipients.filter(isEmail).map((email) =>
          resendEmail({
            to: email,
            subject: `Nouvelle demande client — ${clean(thread.subject, 140)}`,
            idempotencyKey: `rss-support-client-${message.id}-${email.toLowerCase()}`,
            html: emailLayout(
              "Nouvelle demande client",
              `${clean(thread.client_name || "Un client")} vient d’écrire à RentSoundSystem.`,
              `<p style="font-size:14px;line-height:1.55"><strong>Objet :</strong> ${escapeHtml(thread.subject)}<br><strong>Client :</strong> ${escapeHtml(thread.client_name || "—")} · ${escapeHtml(thread.client_email || "—")}</p><div style="margin:18px 0;padding:14px;border-left:3px solid #fc036d;background:#fff6f9;font-size:14px;line-height:1.55">${escapeHtml(message.body)}</div><p><a href="${escapeHtml(staffUrl)}" style="display:inline-block;background:#fc036d;color:#fff;text-decoration:none;padding:12px 16px;border-radius:6px;font-weight:700">Ouvrir la demande</a></p>`
            })
          })
        )
      );
    } else {
      if (!senderIsSupport || message.sender_id !== user.id || message.sender_role !== "support") {
        return res.status(403).json({ error: "Action support non autorisée." });
      }
      const clientEmail = clean(thread.client_email);
      if (isEmail(clientEmail)) {
        const clientUrl = `${baseUrl()}/espace-client-messagerie.html?thread=${encodeURIComponent(threadId)}`;
        await resendEmail({
          to: clientEmail,
          subject: `Réponse RentSoundSystem — ${clean(thread.subject, 140)}`,
          idempotencyKey: `rss-support-reply-${message.id}-${clientEmail.toLowerCase()}`,
          html: emailLayout(
            "RentSoundSystem vous a répondu",
            "Une nouvelle réponse est disponible dans votre messagerie.",
            `<p style="font-size:14px;line-height:1.55"><strong>Objet :</strong> ${escapeHtml(thread.subject)}</p><div style="margin:18px 0;padding:14px;border-left:3px solid #fc036d;background:#fff6f9;font-size:14px;line-height:1.55">${escapeHtml(message.body)}</div><p><a href="${escapeHtml(clientUrl)}" style="display:inline-block;background:#fc036d;color:#fff;text-decoration:none;padding:12px 16px;border-radius:6px;font-weight:700">Lire la réponse</a></p>`
          })
        });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("support notification", error);
    return res.status(500).json({ error: error.message || "Notification impossible." });
  }
}

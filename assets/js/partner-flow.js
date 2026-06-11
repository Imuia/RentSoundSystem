(function(){
  "use strict";
  const SUPABASE_URL = "https://crxofkxinsspfgdsxpiy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj";
  const DRAFT_KEY = "rss_partner_draft";
  const EMAIL_KEY = "rss_partner_email";
  const REQUEST_ID_KEY = "rss_partner_request_id";
  function $(id){ return document.getElementById(id); }
  function q(sel){ return document.querySelector(sel); }
  function qa(sel){ return Array.from(document.querySelectorAll(sel)); }
  function clean(v){ return String(v || "").trim(); }
  function page(){ return (location.pathname.split("/").pop() || "").toLowerCase(); }
  function getDraft(){ try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}"); } catch(e){ return {}; } }
  function saveDraft(data){ localStorage.setItem(DRAFT_KEY, JSON.stringify(Object.assign(getDraft(), data || {}))); }
  function setEmail(email){ if(email) localStorage.setItem(EMAIL_KEY, String(email).toLowerCase().trim()); }
  function getEmail(){ return clean(localStorage.getItem(EMAIL_KEY) || getDraft().email || "").toLowerCase(); }
  function val(id){ const el=$(id); return el ? clean(el.value) : ""; }
  function checked(name){ return qa('input[name="'+name+'"]:checked').map(e => e.value); }
  function client(){ return window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null; }
  function go(url){ window.location.href = url; }
  function show(id, ok, msg){ const el=$(id); if(!el){ if(!ok) alert(msg); return; } el.classList.remove("hidden"); el.style.display="block"; el.style.borderColor = ok ? "rgba(34,197,94,.4)" : "rgba(252,3,109,.35)"; el.style.background = ok ? "rgba(34,197,94,.10)" : "rgba(252,3,109,.10)"; el.style.color = ok ? "#bbf7d0" : "#fecaca"; el.innerHTML = msg; }
  function fill(){ const d=getDraft(); Object.keys(d).forEach(k=>{ const el=$(k); if(el && typeof d[k] === "string") el.value = d[k]; }); if(d.categories){ qa('input[name="categories"]').forEach(el => { el.checked = d.categories.includes(el.value); }); } }
  async function fetchPartnerByEmail(email){ const c=client(); email=clean(email || getEmail()).toLowerCase(); if(!c || !email) return null; const {data,error}=await c.from("partner_requests").select("*").eq("email", email).order("created_at",{ascending:false}).limit(1).maybeSingle(); if(error){ console.warn("partner fetch", error); return null; } return data; }
  async function submitFinal(){
    const d = Object.assign(getDraft(), { registration_number: val("registration_number"), tax_id: val("tax_id"), document_urls: val("document_urls"), status: "pending", payment_status: "unpaid" });
    if(!d.email || !d.full_name || !d.company_name){ show("kyc-message", false, "Veuillez revenir aux étapes précédentes et compléter les champs obligatoires."); return; }
    const c=client(); if(!c){ show("kyc-message", false, "Supabase n’est pas chargé."); return; }
    const payload = { company_name:d.company_name||"", full_name:d.full_name||"", contact_name:d.full_name||"", email:String(d.email||"").toLowerCase().trim(), phone:d.phone||"", country:d.country||"", city:d.city||"", website:d.website||"", registration_number:d.registration_number||d.reg_number||"", tax_id:d.tax_id||d.vat_number||"", address_1:d.address_1||"", postal_code:d.postal_code||"", categories:d.categories||[], equipment_types:d.categories||[], equipment_count:Number(d.equipment_count||0), fleet_value:d.fleet_value||"", equipment_condition:d.equipment_condition||"", equipment_description:d.equipment_description||"", coverage_area:d.coverage_area||"", delivery_radius:d.delivery_radius||"", handover_mode:d.handover_mode||"", technician_available:d.technician_available||"", deposit_policy:d.deposit_policy||"", insurance_status:d.insurance_status||"", logistics_notes:d.logistics_notes||"", document_urls:d.document_urls||"", status:"pending", payment_status:"unpaid", stripe_status:"not_started", source:"partner_onboarding" };
    const {data,error}=await c.from("partner_requests").insert(payload).select().single();
    if(error){ console.error(error); show("kyc-message", false, "Erreur Supabase : "+error.message); return; }
    setEmail(payload.email); localStorage.setItem(REQUEST_ID_KEY, data.id); localStorage.removeItem(DRAFT_KEY); go("/partenaire-soumis.html");
  }
  async function submitListing(form){
    const c=client(); if(!c){ alert("Supabase n’est pas chargé."); return; }
    const partner=await fetchPartnerByEmail();
    if(!partner || partner.status !== "approved"){ alert("Votre compte partenaire doit être validé avant de publier une annonce."); return; }
    const payload={ partner_request_id: partner.id, title: clean($("listing-title")?.value), category: clean($("listing-category")?.value), brand: clean($("listing-brand")?.value), price: Number($("listing-price")?.value||0), city: clean($("listing-city")?.value || partner.city), description: clean($("listing-description")?.value), status:"pending" };
    const {error}=await c.from("partner_listings").insert(payload);
    const msg=$("rss-listing-message");
    if(error){ if(msg) msg.textContent="Erreur : "+error.message; else alert(error.message); return; }
    if(msg) msg.textContent="Annonce enregistrée. Elle sera vérifiée avant publication."; else alert("Annonce enregistrée.");
    form.reset();
  }
  function bind(){
    fill(); const p=page();
    if(p==="connexion-partenaire.html"){
      const form=$("partner-login-form"); if(form) form.addEventListener("submit", async function(e){ e.preventDefault(); const email=clean($("partner-login-email").value).toLowerCase(); setEmail(email); show("partner-login-message", true, "Vérification du dossier..."); const partner=await fetchPartnerByEmail(email); if(!partner){ show("partner-login-message", false, "Aucun dossier partenaire trouvé pour cet email. Créez une demande partenaire."); return; } localStorage.setItem(REQUEST_ID_KEY, partner.id); if(partner.status==="approved") go("/tableau-de-bord-partenaire.html"); else go("/partenaire-en-attente.html"); });
    }
    if(p==="inscription-partenaire.html"){
      const form=q("form"); if(form) form.addEventListener("submit", function(e){ e.preventDefault(); const full=val("fullName")||val("full_name")||clean(q('[name="fullName"]')?.value); const email=(val("email")||clean(q('[name="email"]')?.value)).toLowerCase(); const password=val("password")||clean(q('[name="password"]')?.value); if(!full || !email){ alert("Merci de renseigner votre nom et votre email."); return; } saveDraft({full_name:full, fullName:full, email:email, password:password}); setEmail(email); go("/partenaire-societe.html"); }, true);
    }
    if(p==="partenaire-societe.html"){
      const form=q("form"); if(form) form.addEventListener("submit", function(e){ e.preventDefault(); saveDraft({ company_name:val("company_name"), reg_number:val("reg_number"), registration_number:val("reg_number"), vat_number:val("vat_number"), tax_id:val("vat_number"), address_1:val("address_1"), city:val("city"), postal_code:val("postal_code"), country:val("country") }); go("/inscription-partenaire-materiel.html"); }, true);
    }
    if(p==="inscription-partenaire-materiel.html"){
      const form=$("form-step2"); if(form) form.addEventListener("submit", function(e){ e.preventDefault(); saveDraft({ categories:checked("categories"), equipment_count:val("equipment_count"), fleet_value:val("fleet_value"), equipment_condition:val("equipment_condition"), equipment_description:val("equipment_description") }); go("/inscription-partenaire-logistique.html"); }, true);
    }
    if(p==="inscription-partenaire-logistique.html"){
      const form=$("form-step3"); if(form) form.addEventListener("submit", function(e){ e.preventDefault(); saveDraft({ coverage_area:val("coverage_area"), delivery_radius:val("delivery_radius"), handover_mode:val("handover_mode"), technician_available:val("technician_available"), deposit_policy:val("deposit_policy"), insurance_status:val("insurance_status"), logistics_notes:val("logistics_notes") }); go("/inscription-partenaire-kyc.html"); }, true);
    }
    if(p==="inscription-partenaire-kyc.html"){
      const form=$("form-kyc"); if(form) form.addEventListener("submit", async function(e){ e.preventDefault(); const btn=$("submit-kyc"); if(btn) btn.disabled=true; await submitFinal(); if(btn) btn.disabled=false; }, true);
    }
    if(p==="ajouter-annonce.html"){
      const form=$("rss-listing-form"); if(form) form.addEventListener("submit", async function(e){ e.preventDefault(); await submitListing(form); }, true);
    }
    if(["partenaire-en-attente.html","tableau-de-bord-partenaire.html","partenaire-paiement.html"].includes(p)){
      fetchPartnerByEmail().then(function(partner){ if(!partner) return; qa("[data-partner-company]").forEach(el=>el.textContent=partner.company_name||""); qa("[data-partner-status]").forEach(el=>el.textContent=partner.status||"pending"); if(p==="tableau-de-bord-partenaire.html" && partner.status!=="approved") go("/partenaire-en-attente.html"); });
    }
  }
  if(document.readyState!=="loading") bind(); else document.addEventListener("DOMContentLoaded", bind);
})();
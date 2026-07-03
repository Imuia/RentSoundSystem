(function(){
  "use strict";

  const SUPABASE_URL = "https://crxofkxinsspfgdsxpiy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj";
  const state = { sb:null, user:null, role:null, requests:[], selected:null, filter:"all" };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[char]));
  }

  function clean(value){
    return String(value ?? "").replace(/\s+/g," ").trim();
  }

  function dateFR(value){
    if(!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}) + " · " + date.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
  }

  function initials(value){
    return clean(value || "P").split(/\s+/).filter(Boolean).slice(0,2).map((word)=>word[0]).join("").toUpperCase() || "P";
  }

  function statusInfo(status){
    const normalized = clean(status).toLowerCase();
    if(normalized === "approved") return {label:"Validé",className:"approved"};
    if(normalized === "pending" || !normalized) return {label:"À valider",className:"pending"};
    return {label:normalized || "Non défini",className:"other"};
  }

  function categories(value){
    if(Array.isArray(value)) return value.filter(Boolean).join(", ");
    if(value && typeof value === "object") return Object.values(value).filter(Boolean).join(", ");
    const raw = clean(value);
    if(raw.startsWith("[") && raw.endsWith("]")){
      try{
        const parsed = JSON.parse(raw);
        if(Array.isArray(parsed)) return parsed.filter(Boolean).join(", ");
      }catch(error){}
    }
    return raw || "—";
  }

  function docUrls(value){
    if(Array.isArray(value)) return value.map(String).filter(Boolean);
    const raw = clean(value);
    if(!raw) return [];
    if(raw.startsWith("[") && raw.endsWith("]")){
      try{
        const parsed = JSON.parse(raw);
        if(Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
      }catch(error){}
    }
    return raw.split(/[\n,;]+/).map((part)=>part.trim()).filter(Boolean);
  }

  function setNote(message,error=false){
    const target = $("#admin-note");
    if(!target) return;
    target.textContent = message || "";
    target.classList.toggle("error",Boolean(error));
  }

  function field(label,value){
    return `<div class="detail"><span>${escapeHtml(label)}</span><strong>${escapeHtml(clean(value) || "—")}</strong></div>`;
  }

  function filteredRequests(){
    const query = clean($("#admin-search")?.value).toLowerCase();
    return state.requests.filter((request)=>{
      const matchesStatus = state.filter === "all" || clean(request.status).toLowerCase() === state.filter;
      if(!matchesStatus) return false;
      if(!query) return true;
      const searchable = [
        request.company_name,request.full_name,request.contact_name,request.email,
        request.city,request.country,request.phone,request.registration_number
      ].map(clean).join(" ").toLowerCase();
      return searchable.includes(query);
    });
  }

  function renderCounts(){
    const total = state.requests.length;
    const pending = state.requests.filter((item)=>clean(item.status).toLowerCase() === "pending" || !clean(item.status)).length;
    const approved = state.requests.filter((item)=>clean(item.status).toLowerCase() === "approved").length;
    $("#count-all").textContent = `(${total})`;
    $("#count-pending").textContent = `(${pending})`;
    $("#count-approved").textContent = `(${approved})`;
  }

  function requestCard(request){
    const status = statusInfo(request.status);
    const company = clean(request.company_name || request.full_name || "Partenaire sans nom");
    const person = clean(request.full_name || request.contact_name || "");
    const place = [clean(request.city),clean(request.country)].filter(Boolean).join(", ") || "Localisation non renseignée";
    const equipment = categories(request.categories || request.equipment_types);
    return `<article class="request-card" data-request-id="${escapeHtml(request.id)}" tabindex="0" role="button">
      <div class="request-company">
        <div class="request-avatar">${escapeHtml(initials(company))}</div>
        <div>
          <h3>${escapeHtml(company)}</h3>
          <p>${escapeHtml(person ? person + " · " : "")}${escapeHtml(request.email || "E-mail non renseigné")}</p>
          <div class="request-meta">
            <span class="meta"><span class="material-symbols-outlined">location_on</span>${escapeHtml(place)}</span>
            <span class="meta"><span class="material-symbols-outlined">category</span>${escapeHtml(equipment.length > 55 ? equipment.slice(0,55)+"…" : equipment)}</span>
            <span class="meta"><span class="material-symbols-outlined">calendar_today</span>${escapeHtml(dateFR(request.created_at))}</span>
          </div>
        </div>
      </div>
      <div class="request-side">
        <span class="status ${status.className}"><span class="material-symbols-outlined" style="font-size:15px">${status.className === "approved" ? "verified" : "schedule"}</span>${escapeHtml(status.label)}</span>
        <span class="view">Ouvrir le dossier <span class="material-symbols-outlined" style="font-size:17px">arrow_forward</span></span>
      </div>
    </article>`;
  }

  function renderRequests(){
    const list = $("#partner-request-list");
    const requests = filteredRequests();
    renderCounts();
    $("#admin-subtitle").textContent = `${requests.length} dossier${requests.length > 1 ? "s" : ""} dans cette vue.`;
    if(!requests.length){
      list.innerHTML = `<div class="empty"><span class="material-symbols-outlined">handshake</span><h3>Aucun dossier à afficher</h3><p>Les nouvelles demandes d’inscription partenaire apparaîtront ici automatiquement.</p></div>`;
      return;
    }
    list.innerHTML = requests.map(requestCard).join("");
    $$("[data-request-id]").forEach((card)=>{
      const open = () => openDrawer(card.dataset.requestId);
      card.addEventListener("click",open);
      card.addEventListener("keydown",(event)=>{
        if(event.key === "Enter" || event.key === " "){event.preventDefault();open();}
      });
    });
  }

  async function requireAdmin(){
    if(!window.supabase) throw new Error("Supabase JS est indisponible.");
    state.sb = window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);

    const {data:{session}} = await state.sb.auth.getSession();
    if(!session?.user){
      location.href = "/connexion-inscription.html?redirect=" + encodeURIComponent(location.pathname);
      return false;
    }
    state.user = session.user;
    $("#admin-email").textContent = state.user.email || "Compte connecté";

    const {data:role,error} = await state.sb.rpc("my_admin_role");
    if(error || !["super_admin","admin"].includes(String(role || ""))){
      document.querySelector(".admin-main-card").innerHTML = `<div class="empty"><span class="material-symbols-outlined">lock</span><h3>Accès non autorisé</h3><p>Cette page est réservée aux administrateurs RentSoundSystem. Connectez-vous avec le compte déclaré dans <strong>admin_users</strong>.</p></div>`;
      setNote("Votre compte n’a pas de rôle administrateur actif.",true);
      return false;
    }
    state.role = role;
    return true;
  }

  async function loadRequests(){
    $("#partner-request-list").innerHTML = `<div class="loading"><span class="material-symbols-outlined">sync</span></div>`;
    setNote("Synchronisation des dossiers partenaires…");
    const {data,error} = await state.sb.rpc("admin_list_partner_requests");
    if(error){
      console.error("Admin partenaires",error);
      $("#partner-request-list").innerHTML = `<div class="empty"><span class="material-symbols-outlined">error</span><h3>Chargement indisponible</h3><p>Exécutez le fichier SQL du module Admin Partenaires, puis rechargez la page.</p></div>`;
      setNote("Impossible de charger les dossiers : " + (error.message || "erreur Supabase"),true);
      return;
    }
    state.requests = data || [];
    renderRequests();
    setNote("Dossiers synchronisés.");
  }

  function renderDocuments(request){
    const box = $("#drawer-documents");
    const urls = docUrls(request.document_urls);
    if(!urls.length){
      box.innerHTML = `<span class="note">Aucun lien de document renseigné dans le dossier.</span>`;
      return;
    }
    box.innerHTML = urls.map((url,index)=>{
      const safeUrl = escapeHtml(url);
      const valid = /^https?:\/\//i.test(url);
      return valid
        ? `<a class="doc" href="${safeUrl}" target="_blank" rel="noopener"><span class="material-symbols-outlined" style="font-size:17px">description</span>Document ${index+1}</a>`
        : `<span class="doc"><span class="material-symbols-outlined" style="font-size:17px">description</span>${safeUrl}</span>`;
    }).join("");
  }

  function renderRequestDetails(request){
    const company = clean(request.company_name || request.full_name || "Partenaire");
    $("#drawer-title").textContent = company;
    $("#drawer-subtitle").textContent = [request.full_name || request.contact_name,request.email].filter(Boolean).join(" · ");

    $("#drawer-company").innerHTML = [
      field("Société",request.company_name),
      field("Contact",request.full_name || request.contact_name),
      field("E-mail",request.email),
      field("Téléphone",request.phone),
      field("Ville",request.city),
      field("Pays",request.country),
      field("Adresse",request.address_1),
      field("Code postal",request.postal_code),
      field("Immatriculation",request.registration_number || request.reg_number),
      field("Identifiant fiscal",request.tax_id || request.vat_number),
      field("Site web",request.website),
      field("Statut actuel",statusInfo(request.status).label)
    ].join("");

    $("#drawer-equipment").innerHTML = [
      field("Catégories",categories(request.categories || request.equipment_types)),
      field("Nombre d’équipements",request.equipment_count),
      field("Valeur du parc",request.fleet_value),
      field("État du matériel",request.equipment_condition),
      field("Description",request.equipment_description)
    ].join("");

    $("#drawer-logistics").innerHTML = [
      field("Zone couverte",request.coverage_area),
      field("Rayon livraison",request.delivery_radius),
      field("Remise / retrait",request.handover_mode),
      field("Technicien",request.technician_available),
      field("Politique caution",request.deposit_policy),
      field("Assurance",request.insurance_status),
      field("Notes logistiques",request.logistics_notes)
    ].join("");

    renderDocuments(request);
    $("#review-note").value = "";
  }

  async function loadHistory(requestId){
    const box = $("#drawer-history");
    box.innerHTML = `<div class="loading"><span class="material-symbols-outlined">sync</span></div>`;
    const {data,error} = await state.sb.rpc("admin_partner_review_history",{p_partner_request_id:requestId});
    if(error){
      console.warn("Historique admin",error);
      box.innerHTML = `<div class="note error">Historique indisponible. Exécutez le fichier SQL du module.</div>`;
      return;
    }
    const items = data || [];
    if(!items.length){
      box.innerHTML = `<div class="note">Aucune décision interne enregistrée pour ce dossier.</div>`;
      return;
    }
    const labels = {approved:"Partenaire validé",pending:"Dossier maintenu en attente",note:"Note interne ajoutée"};
    box.innerHTML = items.map((item)=>`<div class="history-item"><strong>${escapeHtml(labels[item.action] || item.action || "Action")}</strong>${item.note?`<p>${escapeHtml(item.note)}</p>`:""}<small>${escapeHtml(dateFR(item.created_at))}</small></div>`).join("");
  }

  async function openDrawer(id){
    const request = state.requests.find((item)=>String(item.id) === String(id));
    if(!request) return;
    state.selected = request;
    renderRequestDetails(request);
    const drawer = $("#partner-drawer");
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden","false");
    await loadHistory(request.id);
  }

  function closeDrawer(){
    $("#partner-drawer").classList.remove("open");
    $("#partner-drawer").setAttribute("aria-hidden","true");
    state.selected = null;
  }

  async function review(action){
    if(!state.selected) return;
    const note = clean($("#review-note").value);
    const approve = action === "approved";
    if(approve && !window.confirm("Valider ce partenaire ? Son statut passera à approved et son espace partenaire déjà existant sera accessible.")) return;

    const buttons = [$("#save-note"),$("#keep-pending"),$("#approve-partner")].filter(Boolean);
    buttons.forEach((button)=>button.disabled=true);

    try{
      const {error} = await state.sb.rpc("admin_review_partner_request",{
        p_partner_request_id:state.selected.id,
        p_action:action,
        p_note:note || null
      });
      if(error) throw error;
      setNote(action === "approved" ? "Partenaire validé." : action === "pending" ? "Dossier conservé en attente." : "Note interne enregistrée.");
      const selectedId = state.selected.id;
      await loadRequests();
      state.selected = state.requests.find((item)=>String(item.id) === String(selectedId)) || null;
      if(state.selected){
        renderRequestDetails(state.selected);
        await loadHistory(state.selected.id);
      }
    }catch(error){
      console.error("Décision partenaire",error);
      setNote("Impossible d’enregistrer cette décision : " + (error.message || "erreur Supabase"),true);
    }finally{
      buttons.forEach((button)=>button.disabled=false);
    }
  }

  function bind(){
    $("#admin-search")?.addEventListener("input",renderRequests);
    $("#admin-refresh")?.addEventListener("click",loadRequests);
    $$("[data-status]").forEach((button)=>button.addEventListener("click",()=>{
      state.filter = button.dataset.status || "all";
      $$("[data-status]").forEach((item)=>item.classList.toggle("active",item === button));
      renderRequests();
    }));
    $("#drawer-close")?.addEventListener("click",closeDrawer);
    $("#partner-drawer")?.addEventListener("click",(event)=>{if(event.target.id === "partner-drawer")closeDrawer();});
    $("#save-note")?.addEventListener("click",()=>review("note"));
    $("#keep-pending")?.addEventListener("click",()=>review("pending"));
    $("#approve-partner")?.addEventListener("click",()=>review("approved"));
    document.addEventListener("keydown",(event)=>{if(event.key === "Escape") closeDrawer();});
  }

  async function init(){
    try{
      if(!await requireAdmin()) return;
      bind();
      await loadRequests();
    }catch(error){
      console.error("Admin partenaires",error);
      setNote("Le back office est temporairement indisponible.",true);
    }
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",init);
  else init();
})();
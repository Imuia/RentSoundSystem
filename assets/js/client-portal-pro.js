
(function(){
  "use strict";

  const SUPABASE_URL = "https://crxofkxinsspfgdsxpiy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj";
  const state = {
    sb: null,
    user: null,
    profile: null,
    reservations: [],
    inventory: [],
    threads: [],
    activeThreadId: null,
    messages: [],
    calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    reservationFilter: "all",
    orderFilter: "all",
    inventoryFilter: "all",
    realtimeChannels: []
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const page = () => document.body.dataset.rssPage || "reservations";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function money(value) {
    return Number(value || 0).toLocaleString("fr-FR", { style:"currency", currency:"EUR" });
  }

  function dateFR(value) {
    if (!value) return "À confirmer";
    const date = new Date(String(value).slice(0,10) + "T12:00:00");
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString("fr-FR", { day:"2-digit", month:"short", year:"numeric" });
  }

  function shortDate(value) {
    if (!value) return "";
    const date = new Date(String(value).slice(0,10) + "T12:00:00");
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR", { day:"2-digit", month:"short" });
  }

  function dateTimeFR(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("fr-FR", { day:"2-digit", month:"short" }) + " · " + date.toLocaleTimeString("fr-FR", { hour:"2-digit", minute:"2-digit" });
  }

  function toast(message) {
    let element = $(".rss-toast");
    if (!element) {
      element = document.createElement("div");
      element.className = "rss-toast";
      document.body.appendChild(element);
    }
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(window.__rssToast);
    window.__rssToast = setTimeout(() => element.classList.remove("show"), 3500);
  }

  function setNote(selector, message, error=false) {
    const element = $(selector);
    if (!element) return;
    element.textContent = message || "";
    element.classList.toggle("is-error", Boolean(error));
  }

  async function notifySupport(threadId, messageId, eventType) {
    try {
      const {data:{session}} = await state.sb.auth.getSession();
      if (!session?.access_token) return;
      await fetch("/api/support/notify", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "Authorization":"Bearer " + session.access_token
        },
        body:JSON.stringify({
          thread_id:threadId,
          message_id:messageId || null,
          event:eventType || "client_message"
        })
      });
    } catch (error) {
      // La demande reste enregistrée même si la notification e-mail rencontre un retard.
      console.warn("Notification support non bloquante :", error);
    }
  }

  function initials(name) {
    return String(name || "Client").split(/\s+/).filter(Boolean).slice(0,2).map((word) => word[0]).join("").toUpperCase() || "CL";
  }

  function refFor(row) {
    const given = row.order_reference || row.order_id || row.reference || row.reservation_number;
    if (given) return String(given);
    const id = String(row.id || "");
    return id ? "RS-" + id.replace(/-/g,"").slice(0,8).toUpperCase() : "RS-RÉSERVATION";
  }

  function normalizeReservation(row) {
    const payment = String(row.payment_status || "").toLowerCase();
    const booking = String(row.status || "").toLowerCase();
    const deposit = String(row.deposit_status || "").toLowerCase();
    let paymentLabel = "En attente de validation";
    let paymentClass = "pending";
    if (booking.includes("cancel")) { paymentLabel = "Annulée"; paymentClass = "cancel"; }
    else if (payment.includes("succeed") || payment.includes("paid") || booking.includes("confirm") || booking.includes("paid")) { paymentLabel = "Paiement confirmé"; paymentClass = "success"; }
    else if (payment.includes("fail")) { paymentLabel = "Paiement à régulariser"; paymentClass = "cancel"; }

    let depositLabel = "";
    if (Number(row.deposit_amount || 0) > 0) {
      depositLabel = deposit.includes("requires_capture") ? "Caution autorisée" : deposit.includes("succeed") ? "Caution enregistrée" : "Caution à confirmer";
    }
    return {
      id: row.id,
      reference: refFor(row),
      equipment: row.equipment_name || row.product_name || "Matériel réservé",
      partner: row.renter_name || row.partner_name || row.partner_email || "",
      startDate: row.start_date || "",
      endDate: row.end_date || row.start_date || "",
      location: row.event_city || row.city || row.location || "",
      total: Number(row.total_price || row.total || 0),
      deposit: Number(row.deposit_amount || row.deposit || 0),
      paymentLabel, paymentClass, depositLabel,
      paymentIntent: row.rental_payment_intent_id || "",
      depositIntent: row.deposit_payment_intent_id || "",
      paymentRaw: row.payment_status || "",
      depositRaw: row.deposit_status || "",
      createdAt: row.created_at || "",
      raw: row
    };
  }

  function isUpcoming(item) {
    if (!item.startDate) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    return new Date(item.startDate + "T12:00:00") >= today;
  }

  function updateProfileUi() {
    const fallback = state.user?.user_metadata?.full_name || state.user?.email?.split("@")[0] || "Client";
    const name = state.profile?.full_name || fallback;
    const email = state.user?.email || state.profile?.email || "";
    const avatar = $("#client-avatar"); if (avatar) avatar.textContent = initials(name);
    const sideName = $("#sidebar-client-name"); if (sideName) sideName.textContent = name;
    const sideEmail = $("#sidebar-client-email"); if (sideEmail) sideEmail.textContent = email;
  }

  async function ensureSession() {
    if (!window.supabase) throw new Error("Supabase JS n’est pas chargé.");
    state.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const {data:{session}} = await state.sb.auth.getSession();
    if (!session?.user) {
      const redirect = window.location.pathname + window.location.search;
      location.href = "/connexion-inscription.html?redirect=" + encodeURIComponent(redirect);
      return false;
    }
    state.user = session.user;
    return true;
  }

  async function loadProfile() {
    try {
      const {data, error} = await state.sb.from("profiles").select("full_name,company_name,email").eq("id",state.user.id).maybeSingle();
      if (!error && data) state.profile = data;
    } catch (error) {
      console.warn("Profil indisponible", error);
    }
    updateProfileUi();
  }

  async function loadReservations() {
    if (!state.user) return [];
    const {data,error} = await state.sb.from("reservations").select("*").eq("user_id",state.user.id).order("created_at",{ascending:false}).limit(100);
    if (error) {
      console.warn("Réservations", error);
      state.reservations = [];
      setNote(".sync-note","Impossible de charger vos réservations pour le moment.",true);
      renderPage();
      return [];
    }
    state.reservations = (data || []).map(normalizeReservation);
    renderPage();
    setNote(".sync-note","Synchronisé avec votre compte.",false);
    return state.reservations;
  }

  function renderReservationStats() {
    const upcoming = state.reservations.filter(isUpcoming).length;
    const confirmed = state.reservations.filter((item)=>item.paymentClass==="success").length;
    const total = state.reservations.reduce((sum,item)=>sum+item.total,0);
    if ($("#stat-upcoming")) $("#stat-upcoming").textContent = String(upcoming);
    if ($("#stat-confirmed")) $("#stat-confirmed").textContent = String(confirmed);
    if ($("#stat-total")) $("#stat-total").textContent = money(total);
  }

  function reservationHtml(item) {
    const selected = new URLSearchParams(location.search).get("order");
    const highlight = selected && (selected===item.reference || selected===item.id) ? " is-highlighted" : "";
    const dateText = item.startDate ? `${dateFR(item.startDate)} → ${dateFR(item.endDate)}` : "Dates à confirmer";
    const place = item.location ? ` · ${escapeHtml(item.location)}` : "";
    const partner = item.partner ? ` · Loueur : ${escapeHtml(item.partner)}` : "";
    const caution = item.deposit > 0 ? `Caution : ${money(item.deposit)}` : "Aucune caution demandée";
    return `<article class="reservation-card${highlight}" data-detail-order="${escapeHtml(item.id || "")}">
      <div><div class="reservation-ref">${escapeHtml(item.reference)}</div><h3>${escapeHtml(item.equipment)}</h3><div class="reservation-meta">${dateText}${place}${partner}</div></div>
      <div class="reservation-right"><div class="reservation-total">${money(item.total)}</div><div class="reservation-caution">${caution}</div><div class="status-row"><span class="status-pill ${item.paymentClass}">${escapeHtml(item.paymentLabel)}</span>${item.depositLabel?`<span class="status-pill muted">${escapeHtml(item.depositLabel)}</span>`:""}</div></div>
    </article>`;
  }

  function renderReservations() {
    renderReservationStats();
    const box = $("#reservation-list"); if (!box) return;
    const items = state.reservationFilter==="upcoming" ? state.reservations.filter(isUpcoming) : state.reservationFilter==="past" ? state.reservations.filter((item)=>!isUpcoming(item)) : state.reservations;
    box.innerHTML = items.length ? items.map(reservationHtml).join("") : `<div class="empty-state"><span class="material-symbols-outlined">event_busy</span><h3>Aucune réservation à afficher</h3><p>Vos locations confirmées apparaîtront ici après validation du paiement.</p></div>`;
    $$("[data-detail-order]").forEach((item)=>item.addEventListener("click",()=>openOrderModal(state.reservations.find((row)=>String(row.id)===String(item.dataset.detailOrder)))));
  }

  function renderOrderStats() {
    const paid = state.reservations.filter((item)=>item.paymentClass==="success").length;
    const pending = state.reservations.filter((item)=>item.paymentClass==="pending").length;
    if ($("#order-stat-total")) $("#order-stat-total").textContent = String(state.reservations.length);
    if ($("#order-stat-paid")) $("#order-stat-paid").textContent = String(paid);
    if ($("#order-stat-pending")) $("#order-stat-pending").textContent = String(pending);
  }

  function orderHtml(item) {
    const tax = item.raw?.tax_amount || item.raw?.tax || null;
    const dates = item.startDate ? `${dateFR(item.startDate)} → ${dateFR(item.endDate)}` : "Dates à confirmer";
    return `<article class="order-card">
      <div><div class="order-ref">${escapeHtml(item.reference)}</div><h3>${escapeHtml(item.equipment)}</h3><div class="order-meta">${dates}${item.location?` · ${escapeHtml(item.location)}`:""}${item.partner?` · ${escapeHtml(item.partner)}`:""}</div></div>
      <div class="order-right"><div class="order-total">${money(item.total)}</div><div class="order-caution">${item.deposit>0?`Caution : ${money(item.deposit)}`:"Sans caution"}</div><div class="status-row"><span class="status-pill ${item.paymentClass}">${escapeHtml(item.paymentLabel)}</span><button type="button" data-order-detail="${escapeHtml(item.id || "")}" class="portal-secondary">Détail</button></div></div>
    </article>`;
  }

  function renderOrders() {
    renderOrderStats();
    const box = $("#order-list"); if (!box) return;
    const items = state.orderFilter==="paid" ? state.reservations.filter((item)=>item.paymentClass==="success") : state.orderFilter==="pending" ? state.reservations.filter((item)=>item.paymentClass==="pending") : state.reservations;
    box.innerHTML = items.length ? items.map(orderHtml).join("") : `<div class="empty-state"><span class="material-symbols-outlined">receipt_long</span><h3>Aucune commande dans cette catégorie</h3><p>Les commandes apparaîtront après la création d’une réservation.</p></div>`;
    $$("[data-order-detail]").forEach((button)=>button.addEventListener("click",(event)=>{event.stopPropagation();openOrderModal(state.reservations.find((row)=>String(row.id)===String(button.dataset.orderDetail)));}));
  }

  function closeModal() {
    $("#rss-order-modal")?.remove();
  }

  function openOrderModal(order) {
    if (!order) return;
    closeModal();
    const caution = order.deposit>0 ? money(order.deposit) : "Aucune caution";
    const html = `<div id="rss-order-modal" class="modal-backdrop" role="dialog" aria-modal="true">
      <section class="modal-card">
        <div class="modal-head"><div><div class="order-ref">${escapeHtml(order.reference)}</div><h2>${escapeHtml(order.equipment)}</h2></div><button type="button" class="icon-button" data-modal-close><span class="material-symbols-outlined">close</span></button></div>
        <div class="modal-row"><span>Dates de location</span><strong>${dateFR(order.startDate)} → ${dateFR(order.endDate)}</strong></div>
        <div class="modal-row"><span>Lieu / logistique</span><strong>${escapeHtml(order.location || "À confirmer")}</strong></div>
        <div class="modal-row"><span>Statut de paiement</span><strong>${escapeHtml(order.paymentLabel)}</strong></div>
        <div class="modal-row"><span>Empreinte de caution</span><strong>${escapeHtml(order.depositLabel || caution)}</strong></div>
        <div class="modal-row"><span>Montant réglé / commande</span><strong>${money(order.total)}</strong></div>
        <div class="modal-row"><span>Loueur</span><strong>${escapeHtml(order.partner || "RentSoundSystem")}</strong></div>
        <p class="sync-note">Les identifiants Stripe restent confidentiels et ne sont pas affichés dans l’espace client.</p>
      </section>
    </div>`;
    document.body.insertAdjacentHTML("beforeend", html);
    $("#rss-order-modal").addEventListener("click",(event)=>{if(event.target.id==="rss-order-modal" || event.target.closest("[data-modal-close]")) closeModal();});
  }

  function startOfCalendarGrid(date) {
    const start = new Date(date.getFullYear(),date.getMonth(),1);
    start.setDate(start.getDate()-((start.getDay()+6)%7));
    return start;
  }
  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  }
  function occurs(item,key) {
    if (!item.startDate) return false;
    return key>=String(item.startDate).slice(0,10) && key<=String(item.endDate||item.startDate).slice(0,10);
  }
  function renderCalendar() {
    const grid=$("#calendar-grid"), title=$("#calendar-title"); if(!grid||!title)return;
    const month=state.calendarMonth;
    title.textContent=month.toLocaleDateString("fr-FR",{month:"long",year:"numeric"}).replace(/^./,(letter)=>letter.toUpperCase());
    const today=dateKey(new Date()), cursor=startOfCalendarGrid(month); let out="";
    for(let index=0; index<42; index+=1){
      const key=dateKey(cursor), items=state.reservations.filter((item)=>occurs(item,key)), other=cursor.getMonth()!==month.getMonth();
      out+=`<div class="calendar-cell${other?" is-other":""}${key===today?" is-today":""}"><div class="calendar-day-number">${cursor.getDate()}</div>${items.slice(0,2).map((item)=>`<button type="button" class="calendar-event ${item.paymentClass==="pending"?"pending":""}" data-calendar-order="${escapeHtml(item.id||"")}">${escapeHtml(item.equipment)}</button>`).join("")}${items.length>2?`<div class="reservation-caution">+${items.length-2} autre(s)</div>`:""}</div>`;
      cursor.setDate(cursor.getDate()+1);
    }
    grid.innerHTML=out;
    $$("[data-calendar-order]").forEach((button)=>button.addEventListener("click",()=>renderCalendarDetail(state.reservations.find((item)=>String(item.id)===String(button.dataset.calendarOrder)))));
  }
  function renderCalendarDetail(item) {
    const target=$("#calendar-detail");if(!target)return;
    target.innerHTML = item ? `<strong>${escapeHtml(item.equipment)}</strong><br>${dateFR(item.startDate)} → ${dateFR(item.endDate)}<br>${item.location?escapeHtml(item.location)+"<br>":""}${money(item.total)} · ${escapeHtml(item.paymentLabel)}<br><span style="color:#ff7cae;font-weight:800">${escapeHtml(item.reference)}</span>` : "Sélectionnez une location dans le calendrier pour afficher son détail.";
  }

  function normalizeInventory(row) {
    const total = Math.max(0, Number(row.quantity_total || 0));
    const available = Math.max(0, Number(row.quantity_available ?? total));
    const status = String(row.status || (available>0?"available":"rented")).toLowerCase();
    return {
      id:row.id,title:row.title||"Équipement sans nom",brand:row.brand||"",model:row.model||"",category:row.category||"Non classé",
      total, available, status:["available","rented","maintenance"].includes(status)?status:"available",dailyPrice:Number(row.daily_price||0),location:row.location||"", listingId:row.listing_id||""
    };
  }

  function invStatusLabel(status) {
    return status==="rented" ? "Loué" : status==="maintenance" ? "Maintenance" : "Disponible";
  }

  function inventoryRow(item) {
    const title=[item.brand,item.title,item.model].filter(Boolean).join(" · ");
    return `<tr>
      <td><strong>${escapeHtml(title || item.title)}</strong><br><span style="color:var(--rss-muted);font-size:11px">${item.total} unité${item.total>1?"s":""}</span></td>
      <td>${escapeHtml(item.category)}</td>
      <td><span class="inventory-status ${item.status}">${invStatusLabel(item.status)}</span></td>
      <td><strong>${item.available} / ${item.total}</strong></td>
      <td>${item.dailyPrice?money(item.dailyPrice):"Sur devis"}</td>
      <td>${escapeHtml(item.location || "—")}</td>
      <td><div class="inventory-inline-actions"><button type="button" data-edit-inventory="${escapeHtml(item.id)}" class="portal-secondary">Modifier</button></div></td>
    </tr>`;
  }

  function renderInventory() {
    const body=$("#inventory-body");if(!body)return;
    const search=($("#inventory-search")?.value||"").trim().toLowerCase();
    const filter=$("#inventory-filter")?.value||"all";
    const items=state.inventory.filter((item)=>{
      const text=[item.title,item.brand,item.model,item.category,item.location].join(" ").toLowerCase();
      return (!search||text.includes(search))&&(filter==="all"||item.status===filter);
    });
    const available=state.inventory.reduce((sum,item)=>sum+item.available,0);
    const rented=state.inventory.reduce((sum,item)=>sum+Math.max(0,item.total-item.available),0);
    if($("#inventory-stat-items"))$("#inventory-stat-items").textContent=String(state.inventory.length);
    if($("#inventory-stat-available"))$("#inventory-stat-available").textContent=String(available);
    if($("#inventory-stat-rented"))$("#inventory-stat-rented").textContent=String(rented);
    body.innerHTML=items.length?items.map(inventoryRow).join(""):`<tr><td colspan="7" style="padding:36px;text-align:center;color:var(--rss-muted)">Aucun équipement ne correspond à cette recherche.</td></tr>`;
    $$("[data-edit-inventory]").forEach((button)=>button.addEventListener("click",()=>openInventoryModal(state.inventory.find((item)=>String(item.id)===String(button.dataset.editInventory)))));
  }

  async function loadInventory() {
    setNote("#inventory-sync-note","Synchronisation du parc matériel…",false);
    const {data,error}=await state.sb.from("inventory_items").select("*").eq("owner_user_id",state.user.id).order("created_at",{ascending:false});
    if(error){
      console.warn("Inventaire",error);
      state.inventory=[];
      renderInventory();
      const missing=String(error.message||"").toLowerCase().includes("does not exist")||String(error.message||"").toLowerCase().includes("schema cache");
      setNote("#inventory-sync-note",missing?"Activez d’abord le fichier SQL Supabase fourni dans le package.":"Impossible de charger l’inventaire : vérifiez les droits Supabase.",true);
      return;
    }
    state.inventory=(data||[]).map(normalizeInventory);
    renderInventory();
    setNote("#inventory-sync-note","Parc matériel synchronisé.",false);
  }

  function inventoryModalHtml(item) {
    const editing=Boolean(item);
    return `<div id="rss-inventory-modal" class="modal-backdrop" role="dialog" aria-modal="true"><section class="modal-card">
      <div class="modal-head"><div><div class="order-ref">${editing?"Gestion matériel":"Nouveau matériel"}</div><h2>${editing?escapeHtml(item.title):"Ajouter un équipement"}</h2></div><button type="button" class="icon-button" data-modal-close><span class="material-symbols-outlined">close</span></button></div>
      <form id="inventory-form" class="inventory-edit-form">
        <label class="full"><span class="field-label">Nom de l’équipement</span><input class="field-input" name="title" required value="${escapeHtml(item?.title||"")}" placeholder="Ex. Pioneer CDJ-3000"></label>
        <label><span class="field-label">Marque</span><input class="field-input" name="brand" value="${escapeHtml(item?.brand||"")}" placeholder="Ex. Pioneer DJ"></label>
        <label><span class="field-label">Modèle</span><input class="field-input" name="model" value="${escapeHtml(item?.model||"")}" placeholder="Ex. CDJ-3000"></label>
        <label><span class="field-label">Catégorie</span><input class="field-input" name="category" value="${escapeHtml(item?.category||"")}" placeholder="DJ gear, sonorisation…"></label>
        <label><span class="field-label">Emplacement</span><input class="field-input" name="location" value="${escapeHtml(item?.location||"")}" placeholder="Ville, entrepôt…"></label>
        <label><span class="field-label">Quantité totale</span><input class="field-input" name="quantity_total" min="0" type="number" required value="${Number(item?.total||1)}"></label>
        <label><span class="field-label">Quantité disponible</span><input class="field-input" name="quantity_available" min="0" type="number" required value="${Number(item?.available??1)}"></label>
        <label><span class="field-label">État</span><select class="field-select" name="status"><option value="available" ${item?.status==="available"?"selected":""}>Disponible</option><option value="rented" ${item?.status==="rented"?"selected":""}>Loué</option><option value="maintenance" ${item?.status==="maintenance"?"selected":""}>Maintenance</option></select></label>
        <label><span class="field-label">Tarif journalier HT/TTC selon votre modèle</span><input class="field-input" name="daily_price" min="0" step="0.01" type="number" value="${Number(item?.dailyPrice||0)}"></label>
        <div class="full form-footer"><p class="form-note">Cet inventaire opérationnel est privé à votre compte. Il ne publie pas automatiquement une annonce sur le catalogue.</p><button type="submit" class="portal-primary"><span class="material-symbols-outlined">save</span>${editing?"Enregistrer":"Ajouter"}</button></div>
      </form>
    </section></div>`;
  }

  function openInventoryModal(item) {
    closeModal();
    document.body.insertAdjacentHTML("beforeend",inventoryModalHtml(item));
    $("#rss-inventory-modal").addEventListener("click",(event)=>{if(event.target.id==="rss-inventory-modal"||event.target.closest("[data-modal-close]"))closeModal();});
    $("#inventory-form").addEventListener("submit",(event)=>saveInventory(event,item));
  }

  async function saveInventory(event,item) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const total=Math.max(0,Number(form.get("quantity_total")||0));
    const available=Math.max(0,Math.min(total,Number(form.get("quantity_available")||0)));
    const payload={owner_user_id:state.user.id,title:String(form.get("title")||"").trim(),brand:String(form.get("brand")||"").trim(),model:String(form.get("model")||"").trim(),category:String(form.get("category")||"").trim(),location:String(form.get("location")||"").trim(),quantity_total:total,quantity_available:available,status:String(form.get("status")||"available"),daily_price:Number(form.get("daily_price")||0)};
    try{
      const result=item ? await state.sb.from("inventory_items").update(payload).eq("id",item.id).eq("owner_user_id",state.user.id) : await state.sb.from("inventory_items").insert(payload);
      if(result.error)throw result.error;
      closeModal();toast(item?"Équipement mis à jour.":"Équipement ajouté à votre parc.");await loadInventory();
    }catch(error){console.error("Enregistrement inventaire",error);toast("Impossible d’enregistrer cet équipement.");}
  }

  function threadName(thread) {
    return thread.subject || "Demande RentSoundSystem";
  }

  function renderThreads() {
    const box=$("#thread-list");if(!box)return;
    if(!state.threads.length){box.innerHTML=`<div class="empty-state"><span class="material-symbols-outlined">forum</span><h3>Aucune demande</h3><p>Créez une demande pour échanger avec l’équipe RentSoundSystem.</p></div>`;return;}
    box.innerHTML=state.threads.map((thread)=>{
      const closed=String(thread.status||"open")==="closed";
      const statusLabel=closed?"Clôturée":"En attente de réponse";
      return `<button type="button" class="thread-item${String(thread.id)===String(state.activeThreadId)?" is-active":""}" data-thread-id="${escapeHtml(thread.id)}"><strong>${escapeHtml(threadName(thread))}</strong><span>${thread.reservation_label?escapeHtml(thread.reservation_label):"Équipe RentSoundSystem"}</span><span class="thread-status${closed?" closed":""}">${statusLabel}</span><time>${dateTimeFR(thread.last_message_at||thread.created_at)}</time></button>`;
    }).join("");
    $$("[data-thread-id]").forEach((button)=>button.addEventListener("click",()=>selectThread(button.dataset.threadId)));
  }

  async function loadThreads() {
    setNote("#messages-sync-note","Synchronisation de vos conversations…",false);
    const {data,error}=await state.sb.from("support_threads").select("*").eq("user_id",state.user.id).order("last_message_at",{ascending:false}).limit(100);
    if(error){
      console.warn("Threads",error);
      state.threads=[];renderThreads();
      const missing=String(error.message||"").toLowerCase().includes("does not exist")||String(error.message||"").toLowerCase().includes("schema cache");
      setNote("#messages-sync-note",missing?"Activez d’abord le fichier SQL Supabase fourni dans le package.":"Impossible de charger la messagerie : vérifiez les droits Supabase.",true);
      return;
    }
    state.threads=(data||[]).map((row)=>({...row,reservation_label:reservationLabel(row.reservation_id)}));
    const activeStillExists=state.threads.some((thread)=>String(thread.id)===String(state.activeThreadId));
    if(activeStillExists) await selectThread(state.activeThreadId);
    else if(state.threads[0]) await selectThread(state.threads[0].id);
    else {
      state.activeThreadId=null;
      renderThreads();
      const stream=$("#message-stream");
      if(stream)stream.innerHTML=`<div class="message-empty"><span class="material-symbols-outlined">forum</span><h3>Aucune conversation ouverte</h3><p>Créez une demande pour échanger avec l’équipe RentSoundSystem.</p></div>`;
      if($("#message-input"))$("#message-input").disabled=true;
      if($("#send-message-btn"))$("#send-message-btn").disabled=true;
    }
    setNote("#messages-sync-note","Messagerie synchronisée.",false);
  }

  function reservationLabel(id) {
    const order=state.reservations.find((item)=>String(item.id)===String(id));
    return order?`${order.reference} · ${order.equipment}`:"Service client RentSoundSystem";
  }

  async function selectThread(threadId) {
    state.activeThreadId=threadId;
    renderThreads();
    const thread=state.threads.find((item)=>String(item.id)===String(threadId));
    if($("#message-title"))$("#message-title").textContent=threadName(thread||{});
    if($("#message-subtitle")){
      const topic=thread?.reservation_label||"Équipe RentSoundSystem";
      const status=String(thread?.status||"open")==="closed" ? "Demande clôturée" : "En attente de réponse";
      $("#message-subtitle").textContent=topic+" · "+status;
    }
    if($("#message-input"))$("#message-input").disabled=false;
    if($("#send-message-btn"))$("#send-message-btn").disabled=false;
    const stream=$("#message-stream");if(stream)stream.innerHTML=`<div class="message-empty"><span class="material-symbols-outlined">sync</span><p>Chargement des messages…</p></div>`;
    const {data,error}=await state.sb.from("support_messages").select("*").eq("thread_id",threadId).order("created_at",{ascending:true}).limit(300);
    if(error){console.warn("Messages",error);if(stream)stream.innerHTML=`<div class="message-empty"><span class="material-symbols-outlined">error</span><h3>Messages indisponibles</h3><p>Vérifiez la configuration Supabase de la messagerie.</p></div>`;return;}
    state.messages=data||[];
    renderMessages();
  }

  function renderMessages() {
    const stream=$("#message-stream");if(!stream)return;
    if(!state.messages.length){stream.innerHTML=`<div class="message-empty"><span class="material-symbols-outlined">mark_chat_unread</span><h3>Conversation ouverte</h3><p>Envoyez le premier message pour préciser votre besoin.</p></div>`;return;}
    stream.innerHTML=state.messages.map((message)=>{
      const self=String(message.sender_id)===String(state.user.id)||message.sender_role==="client";
      const author=self ? "Vous" : (message.sender_role==="partner" ? "Partenaire" : "RentSoundSystem");
      return `<div class="message-bubble${self?" self":""}"><div>${escapeHtml(message.body||"")}</div><div class="message-meta"><span>${author}</span><span>${dateTimeFR(message.created_at)}</span></div></div>`;
    }).join("");
    stream.scrollTop=stream.scrollHeight;
  }

  function newThreadModal() {
    const options=state.reservations.map((item)=>`<option value="${escapeHtml(item.id)}">${escapeHtml(item.reference)} · ${escapeHtml(item.equipment)}</option>`).join("");
    return `<div id="rss-thread-modal" class="modal-backdrop" role="dialog" aria-modal="true"><section class="modal-card">
      <div class="modal-head"><div><div class="order-ref">Messagerie RentSoundSystem</div><h2>Nouvelle demande</h2></div><button type="button" class="icon-button" data-modal-close><span class="material-symbols-outlined">close</span></button></div>
      <form id="thread-form" class="inventory-edit-form">
        <label class="full"><span class="field-label">Objet</span><input class="field-input" name="subject" required placeholder="Ex. Question sur la livraison"></label>
        <label class="full"><span class="field-label">Réservation concernée</span><select class="field-select" name="reservation_id"><option value="">Aucune réservation précise</option>${options}</select></label>
        <label class="full"><span class="field-label">Votre message</span><textarea class="field-textarea" name="body" required placeholder="Décrivez votre demande avec les informations utiles…"></textarea></label>
        <div class="full form-footer"><p class="form-note">Votre demande est signalée à l’équipe RentSoundSystem et reste suivie dans cette messagerie.</p><button type="submit" class="portal-primary"><span class="material-symbols-outlined">send</span>Envoyer la demande</button></div>
      </form>
    </section></div>`;
  }

  function openThreadModal() {
    closeModal();document.body.insertAdjacentHTML("beforeend",newThreadModal());
    $("#rss-thread-modal").addEventListener("click",(event)=>{if(event.target.id==="rss-thread-modal"||event.target.closest("[data-modal-close]"))closeModal();});
    $("#thread-form").addEventListener("submit",createThread);
  }

  async function createThread(event) {
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const subject=String(form.get("subject")||"").trim();
    const body=String(form.get("body")||"").trim();
    const reservationId=String(form.get("reservation_id")||"").trim()||null;
    if(!subject||!body)return;
    const reservation=state.reservations.find((item)=>String(item.id)===String(reservationId));
    const clientName=state.profile?.full_name||state.user?.user_metadata?.full_name||"Client RentSoundSystem";
    const clientEmail=state.user?.email||"";
    const partnerName=reservation?.raw?.partner_name||reservation?.raw?.renter_name||reservation?.partner||"";
    const partnerEmail=reservation?.raw?.partner_email||"";
    try{
      const {data:thread,error:threadError}=await state.sb.from("support_threads").insert({
        user_id:state.user.id,
        reservation_id:reservationId,
        subject,
        status:"open",
        client_name:clientName,
        client_email:clientEmail,
        partner_name:partnerName,
        partner_email:partnerEmail
      }).select("*").single();
      if(threadError)throw threadError;
      const {data:firstMessage,error:messageError}=await state.sb.from("support_messages")
        .insert({thread_id:thread.id,sender_id:state.user.id,sender_role:"client",body})
        .select("id").single();
      if(messageError)throw messageError;
      await notifySupport(thread.id,firstMessage?.id,"client_message");
      closeModal();state.activeThreadId=thread.id;await loadThreads();toast("Votre demande a été envoyée à RentSoundSystem.");
    }catch(error){console.error("Création conversation",error);toast("Impossible de créer cette conversation.");}
  }

  async function sendMessage(event) {
    event.preventDefault();
    const input=$("#message-input"), body=String(input?.value||"").trim();
    if(!body||!state.activeThreadId)return;
    const button=$("#send-message-btn");if(button){button.disabled=true;button.innerHTML='<span class="material-symbols-outlined">hourglass_top</span>Envoi…';}
    try{
      const {data:message,error}=await state.sb.from("support_messages")
        .insert({thread_id:state.activeThreadId,sender_id:state.user.id,sender_role:"client",body})
        .select("id").single();
      if(error)throw error;
      input.value="";
      await notifySupport(state.activeThreadId,message?.id,"client_message");
      await loadThreads();
    }catch(error){console.error("Envoi message",error);toast("Impossible d’envoyer ce message.");}finally{if(button){button.disabled=false;button.innerHTML='<span class="material-symbols-outlined">send</span>Envoyer';}}
  }

  function renderSettings() {
    const name=state.profile?.full_name||state.user?.user_metadata?.full_name||"";
    const company=state.profile?.company_name||"";
    const email=state.user?.email||state.profile?.email||"";
    if($("#profile-name"))$("#profile-name").value=name;
    if($("#profile-company"))$("#profile-company").value=company;
    if($("#profile-email"))$("#profile-email").value=email;
  }

  async function saveProfile(event) {
    event.preventDefault();
    const name=String($("#profile-name")?.value||"").trim(), company=String($("#profile-company")?.value||"").trim();
    if(!name){toast("Indiquez votre nom complet.");$("#profile-name")?.focus();return;}
    const button=$("#save-profile");if(button){button.disabled=true;button.textContent="Enregistrement…";}
    try{
      const payload={id:state.user.id,full_name:name,company_name:company,email:state.user.email};
      const {error}=await state.sb.from("profiles").upsert(payload,{onConflict:"id"});
      if(error)throw error;
      await state.sb.auth.updateUser({data:{full_name:name}});
      state.profile={...(state.profile||{}),...payload};updateProfileUi();toast("Profil enregistré.");
    }catch(error){console.error("Profil",error);toast("Le profil n’a pas pu être enregistré.");}finally{if(button){button.disabled=false;button.innerHTML='<span class="material-symbols-outlined">save</span>Enregistrer';}}
  }

  function renderPage() {
    if(page()==="reservations")renderReservations();
    if(page()==="orders")renderOrders();
    if(page()==="calendar"){renderCalendar();if(!$("#calendar-detail")?.textContent.trim())renderCalendarDetail(null);}
    if(page()==="inventory")renderInventory();
    if(page()==="settings")renderSettings();
  }

  function subscribe(table,callback,filter) {
    try{
      const config={event:"*",schema:"public",table};
      if(filter) config.filter=filter;
      const channel=state.sb.channel("rss-"+table+"-"+state.user.id+"-"+Date.now()).on("postgres_changes",config,callback).subscribe();
      state.realtimeChannels.push(channel);
    }catch(error){console.warn("Realtime indisponible",error);}
  }

  function bindGlobal() {
    $$("[data-rss-nav]").forEach((link)=>link.classList.toggle("is-active",link.dataset.rssNav===page()));
    $("#logout-btn")?.addEventListener("click",async()=>{try{await state.sb.auth.signOut();}catch(error){console.warn(error);}location.href="/";});
    $$("[data-reservation-filter]").forEach((button)=>button.addEventListener("click",()=>{state.reservationFilter=button.dataset.reservationFilter||"all";$$("[data-reservation-filter]").forEach((item)=>item.classList.toggle("is-active",item===button));renderReservations();}));
    $$("[data-order-filter]").forEach((button)=>button.addEventListener("click",()=>{state.orderFilter=button.dataset.orderFilter||"all";$$("[data-order-filter]").forEach((item)=>item.classList.toggle("is-active",item===button));renderOrders();}));
    $$("[data-refresh-reservations],[data-refresh-orders]").forEach((button)=>button.addEventListener("click",async()=>{button.disabled=true;await loadReservations();button.disabled=false;}));
    $("#prev-month")?.addEventListener("click",()=>{state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()-1,1);renderCalendar();});
    $("#next-month")?.addEventListener("click",()=>{state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()+1,1);renderCalendar();});
    $("#inventory-search")?.addEventListener("input",renderInventory);
    $("#inventory-filter")?.addEventListener("change",renderInventory);
    $("#new-inventory-item")?.addEventListener("click",()=>openInventoryModal(null));
    $("[data-refresh-inventory]")?.addEventListener("click",loadInventory);
    $("#new-thread-btn")?.addEventListener("click",openThreadModal);
    $("#new-thread-top-btn")?.addEventListener("click",openThreadModal);
    $("#message-form")?.addEventListener("submit",sendMessage);
    $("#profile-form")?.addEventListener("submit",saveProfile);
  }

  async function init() {
    try{
      if(!await ensureSession())return;
      bindGlobal();await loadProfile();
      if(["reservations","orders","calendar","messages"].includes(page()))await loadReservations();
      if(page()==="calendar")renderCalendarDetail(null);
      if(page()==="inventory")await loadInventory();
      if(page()==="messages"){
        const requestedThread=new URLSearchParams(window.location.search).get("thread");
        if(requestedThread)state.activeThreadId=requestedThread;
        await loadThreads();
      }
      if(page()==="settings")renderSettings();
      if(["reservations","orders","calendar"].includes(page()))subscribe("reservations",loadReservations,"user_id=eq."+state.user.id);
      if(page()==="inventory")subscribe("inventory_items",loadInventory,"owner_user_id=eq."+state.user.id);
      if(page()==="messages"){
        subscribe("support_threads",loadThreads,"user_id=eq."+state.user.id);
        subscribe("support_messages",()=>{if(state.activeThreadId)selectThread(state.activeThreadId);});
      }
      window.addEventListener("focus",()=>{if(["reservations","orders","calendar"].includes(page()))loadReservations();if(page()==="inventory")loadInventory();if(page()==="messages")loadThreads();},{passive:true});
    }catch(error){console.error("Espace client",error);toast("Votre espace client est temporairement indisponible.");}
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

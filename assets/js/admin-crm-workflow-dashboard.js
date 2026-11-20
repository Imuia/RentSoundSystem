(() => {
  'use strict';
  if (window.__RSS_CRM_DASHBOARD_V2__) return;
  window.__RSS_CRM_DASHBOARD_V2__ = true;

  const TABLE = 'crm_workflow_cases';
  const STAGES = [
    'Nouveau lead', 'Qualification', 'Vérification', 'Demande de prix',
    'Contrôle offre', 'Devis', 'Signature', 'Paiement & caution',
    'Logistique', 'Livraison', 'Retour & inspection', 'Clôture'
  ];
  const PAGES = [
    'admin-crm-etape-1-qualification.html', 'admin-crm-etape-1-qualification.html',
    'admin-crm-etape-2-verification.html', 'admin-crm-etape-3-demande-prix.html',
    'admin-crm-etape-4-controle-offre.html', 'admin-crm-etape-5-devis.html',
    'admin-crm-etape-6-signature.html', 'admin-crm-etape-7-paiement-caution.html',
    'admin-crm-etape-8-logistique.html', 'admin-crm-etape-9-suivi-livraison.html',
    'admin-crm-etape-10-retour-inspection.html', 'admin-crm-cloture-caution.html'
  ];
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  let db = null, cases = [], active = null, busy = false, partnerFilter = '', view = 'dossier';

  function toast(message, bad = false) {
    const el = $('#crm-dashboard-status');
    if (el) {
      el.textContent = message;
      el.style.color = bad ? '#ff8a8a' : '#cd8ea9';
      el.dataset.state = bad ? 'error' : 'ok';
    }
  }
  function getClient() {
    const cfg = window.RSS_ADMIN_CONFIG || {};
    const names = cfg.clientCandidates || ['rssSupabase', 'supabaseClient', '_supabase', 'db', 'supabaseDb'];
    for (const name of names) if (window[name]?.from) return window[name];
    return window.rssSupabase?.from ? window.rssSupabase : null;
  }
  function stageOf(row) { return Math.max(0, Math.min(11, Number(row?.stage) || 0)); }
  function parseObject(v) {
    if (!v) return {};
    if (typeof v === 'object') return v;
    if (typeof v === 'string') { try { const x = JSON.parse(v); return x && typeof x === 'object' ? x : {}; } catch (_) { return {}; } }
    return {};
  }
  function snapshotOf(row) {
    const s = parseObject(row?.source_snapshot);
    return [s, parseObject(s.data), parseObject(s.details), parseObject(s.services), parseObject(s.request), parseObject(s.event), parseObject(s.equipment_data)];
  }
  function pick(row, keys, fallback = '—') {
    for (const source of [row || {}, ...snapshotOf(row)]) {
      for (const key of keys) {
        const v = source?.[key];
        if (v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)) {
          if (Array.isArray(v)) return v.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(', ');
          if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}: ${x}`).join(' · ');
          return String(v);
        }
      }
    }
    return fallback;
  }
  function parseDate(value) {
    if (!value || value === '—') return '—';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('fr-FR');
  }
  function caseLabel(c) { return c.reference || c.client_name || c.client_email || `Dossier ${String(c.id).slice(0, 8)}`; }
  function partnerOf(c) { return pick(c, ['partner_name', 'supplier_name', 'assigned_partner', 'provider_name'], ''); }
  function filteredCases() { return partnerFilter ? cases.filter(c => partnerOf(c) === partnerFilter) : cases; }
  function setText(selector, value) { const el = $(selector); if (el) el.textContent = value; }

  function renderSelect() {
    const sel = $('#crm-case-select');
    if (!sel) return;
    const list = filteredCases();
    sel.innerHTML = '<option value="">— Sélectionner un dossier —</option>' + list.map(c => `<option value="${esc(c.id)}">${esc(caseLabel(c))} · ${esc(STAGES[stageOf(c)])}</option>`).join('');
    if (active && list.some(c => String(c.id) === String(active.id))) sel.value = String(active.id);
    else sel.value = '';
  }
  function renderPartnerFilter() {
    const sel = $('#crm-partner-select');
    if (!sel) return;
    const names = [...new Set(cases.map(partnerOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    sel.innerHTML = '<option value="">Tous les partenaires</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
    sel.value = partnerFilter;
    const btn = $('#crm-partner-filter');
    if (btn) btn.querySelector('span:last-child').textContent = partnerFilter ? partnerFilter : 'Partenaires (Tous)';
  }
  function renderStageCounts() {
    const list = filteredCases();
    document.querySelectorAll('[data-crm-stage]').forEach(el => {
      const n = Number(el.dataset.crmStage);
      const count = list.filter(c => stageOf(c) === n).length;
      const badge = el.querySelector('span:last-child');
      if (badge) badge.textContent = String(count);
      el.classList.toggle('bg-[#fc036f]', !!active && n === stageOf(active));
      el.classList.toggle('text-white', !!active && n === stageOf(active));
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-current', active && n === stageOf(active) ? 'step' : 'false');
    });
  }
  function updateDetails(row) {
    const details = [
      pick(row, ['equipment', 'equipment_description', 'equipment_summary', 'equipment_types', 'equipment_name', 'material', 'items', 'product_name']),
      pick(row, ['equipment_quantity', 'quantity', 'equipment_count', 'qty']),
      pick(row, ['amplification', 'technical_details', 'equipment_condition', 'equipment_notes', 'message']),
      pick(row, ['technical_notes', 'requirements', 'additional_info', 'description']),
      pick(row, ['partner_name', 'supplier_name', 'assigned_partner', 'provider_name']),
      pick(row, ['partner_location', 'supplier_location', 'partner_city', 'supplier_city']),
      pick(row, ['delivery_slot', 'delivery_date', 'delivery_time', 'start_date', 'event_date']),
      pick(row, ['technical_contact', 'partner_contact', 'contact_person', 'partner_phone', 'phone', 'client_phone']),
      pick(row, ['quote_total', 'total_amount', 'amount', 'total_price', 'quote_amount']),
      pick(row, ['payment_status', 'deposit_status', 'status_payment']),
      pick(row, ['deposit_amount', 'security_deposit', 'caution_amount']),
      pick(row, ['balance_due', 'remaining_balance', 'balance_amount'])
    ];
    const nodes = [...document.querySelectorAll('.crm-stitch-content .grid.grid-cols-1.md\\:grid-cols-2.xl\\:grid-cols-3 .bg-\\[\\#1a0c13\\] > div > span:last-child')];
    details.forEach((value, i) => { if (nodes[i]) nodes[i].textContent = value; });
  }
  function renderTimeline(row) {
    const el = $('#crm-timeline');
    if (!el) return;
    const data = parseObject(row?.stage_data);
    const events = Object.entries(data).filter(([, v]) => v && (v.note || v.saved_at || v.action)).sort((a, b) => String(b[1].saved_at || '').localeCompare(String(a[1].saved_at || '')));
    el.innerHTML = events.length ? events.map(([key, value], i) => {
      const n = Math.max(0, Math.min(11, Number(key)));
      const when = value.saved_at ? new Date(value.saved_at).toLocaleString('fr-FR') : '—';
      return `<div class="relative group"><div class="absolute -left-6 top-1 size-3.5 rounded-full ${i === 0 ? 'bg-[#fc036f]' : 'bg-[#4a2133]'} ring-4 ring-[#1c0d14]"></div><div class="flex flex-col gap-1"><div class="flex items-center justify-between gap-3"><span class="text-xs font-bold text-white">${esc(value.action || `Étape ${n + 1} enregistrée`)}</span><span class="text-[11px] font-mono text-[#ffb2bf]">${esc(when)}</span></div><p class="text-xs text-[#cd8ea9]">${esc(value.note || 'Mise à jour du dossier')}</p></div></div>`;
    }).join('') : '<p class="text-xs text-[#cd8ea9]">Aucun événement enregistré pour ce dossier.</p>';
  }
  function renderOtherCases() {
    const el = $('#crm-other-cases');
    if (!el) return;
    const list = filteredCases().filter(c => !active || String(c.id) !== String(active.id)).slice(0, 5);
    el.innerHTML = list.length ? list.map(c => `<button type="button" data-crm-open="${esc(c.id)}" class="w-full text-left p-3 rounded bg-[#231018] border border-[#4a2133]/60 hover:border-[#fc036f]/60 transition-all"><div class="flex justify-between items-start gap-2 mb-1"><span class="text-xs font-bold text-white">${esc(caseLabel(c))}</span><span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#331522] text-[#ffb2bf]">Étape ${stageOf(c) + 1}</span></div><p class="text-[11px] text-[#cd8ea9]">${esc(pick(c, ['event_city', 'city'], 'Ville non renseignée'))} · ${esc(parseDate(pick(c, ['event_date', 'start_date'], '')))}</p></button>`).join('') : '<p class="text-xs text-[#cd8ea9]">Aucun autre dossier actif.</p>';
  }
  function renderCase() {
    if (!active) {
      setText('#crm-case-title', 'Aucun dossier sélectionné');
      setText('#crm-case-reference', 'En attente de dossier');
      setText('#crm-case-stage-badge', 'Aucun dossier');
      setText('#crm-deposit-badge', 'Caution : non renseignée');
      const meta = $('#crm-case-meta');
      if (meta) meta.innerHTML = '<span>Importez les demandes de devis ou sélectionnez un dossier CRM.</span>';
      updateDetails(null);
      const next = $('#crm-action-next'); if (next) next.disabled = true;
      renderTimeline(null); renderOtherCases(); renderStageCounts();
      toast('Aucun dossier CRM. Cliquez sur « Importer les devis » pour charger les demandes existantes.', true);
      return;
    }
    const s = stageOf(active);
    setText('#crm-case-title', pick(active, ['client_name', 'company_name', 'client_email'], 'Dossier client'));
    setText('#crm-case-reference', active.reference || `RSS-${String(active.id).slice(0, 8).toUpperCase()}`);
    setText('#crm-case-stage-badge', `ÉTAPE ${s + 1} / 12 : ${STAGES[s]}`);
    setText('#crm-deposit-badge', pick(active, ['deposit_status', 'payment_status'], 'Caution : à confirmer'));
    const meta = $('#crm-case-meta');
    if (meta) {
      const vals = [
        ['location_on', pick(active, ['event_city', 'city', 'location'])],
        ['calendar_today', parseDate(pick(active, ['event_date', 'start_date', 'created_at']))],
        ['corporate_fare', pick(active, ['company_name', 'client_name', 'full_name'])],
        ['inventory_2', pick(active, ['equipment', 'equipment_summary', 'equipment_types'])]
      ];
      meta.innerHTML = vals.map(([icon, value]) => `<span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-sm text-[#fc036f]">${icon}</span>${esc(value)}</span>`).join('');
    }
    updateDetails(active);
    renderTimeline(active);
    renderOtherCases();
    const next = $('#crm-action-next');
    if (next) {
      const label = next.querySelector('span:last-child');
      if (label) label.textContent = s >= 11 ? 'Dossier clôturé' : `Déclencher Étape ${s + 2} : ${STAGES[s + 1]}`;
      next.disabled = s >= 11;
    }
    renderStageCounts();
    toast(`Dossier chargé : ${caseLabel(active)}`);
  }
  function renderKanban() {
    const board = $('#crm-kanban-board');
    if (!board) return;
    const list = filteredCases();
    board.innerHTML = `<div class="flex items-center justify-between gap-3 mb-5"><div><h2 class="text-white text-xl font-bold">Tableau Kanban</h2><p class="text-xs text-[#cd8ea9]">${list.length} dossier(s) · sélectionnez une carte pour ouvrir le dossier</p></div><button type="button" id="crm-kanban-back" class="px-3 py-2 rounded bg-[#331522] border border-[#4a2133] text-[#ffb2bf] text-xs font-semibold">Retour à la vue dossier</button></div><div class="flex gap-4 overflow-x-auto pb-4">${STAGES.map((name, i) => {
      const rows = list.filter(c => stageOf(c) === i);
      return `<section class="crm-kanban-column rounded border border-[#4a2133] bg-[#1c0d14] p-3"><div class="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-[#351825]"><h3 class="text-xs font-bold text-white">${esc(name)}</h3><span class="text-[10px] px-2 py-1 rounded bg-[#331522] text-[#ffb2bf]">${rows.length}</span></div><div class="flex flex-col gap-2">${rows.length ? rows.map(c => `<button type="button" data-crm-open="${esc(c.id)}" class="crm-kanban-card p-3 rounded bg-[#231018] border border-[#4a2133] hover:border-[#fc036f]"><strong class="block text-xs text-white mb-1">${esc(caseLabel(c))}</strong><span class="block text-[11px] text-[#cd8ea9]">${esc(pick(c, ['event_city', 'city'], 'Ville non renseignée'))}</span><span class="block text-[10px] text-[#cd8ea9] mt-2">${esc(pick(c, ['client_email', 'email'], ''))}</span></button>`).join('') : '<p class="text-[11px] text-[#8c6a77]">Aucun dossier</p>'}</div></section>`;
    }).join('')}</div>`;
  }
  function showView(nextView) {
    view = nextView;
    const dossier = $('#crm-dossier-view'), board = $('#crm-kanban-board');
    if (dossier) dossier.hidden = nextView !== 'dossier';
    if (board) board.hidden = nextView !== 'kanban';
    $('#crm-view-dossier')?.classList.toggle('bg-[#fc036f]', nextView === 'dossier');
    $('#crm-view-dossier')?.classList.toggle('text-white', nextView === 'dossier');
    $('#crm-view-kanban')?.classList.toggle('bg-[#fc036f]', nextView === 'kanban');
    $('#crm-view-kanban')?.classList.toggle('text-white', nextView === 'kanban');
    if (nextView === 'kanban') renderKanban();
  }
  function stageUrl(n) {
    const url = new URL(PAGES[n], location.origin);
    if (active) url.searchParams.set('case', active.id);
    return url.pathname + url.search;
  }
  function openStage(n) {
    if (!active) { toast('Sélectionnez ou importez un dossier avant de changer d’étape.', true); return; }
    location.href = stageUrl(Math.max(0, Math.min(11, n)));
  }
  async function loadCases() {
    const { data, error } = await db.from(TABLE).select('*').order('updated_at', { ascending: false }).limit(500);
    if (error) throw error;
    cases = data || [];
    const requested = new URLSearchParams(location.search).get('case') || new URLSearchParams(location.search).get('id');
    active = (requested && cases.find(c => String(c.id) === String(requested))) || (active && cases.find(c => String(c.id) === String(active.id))) || filteredCases()[0] || null;
    if (partnerFilter && active && !filteredCases().some(c => String(c.id) === String(active.id))) active = filteredCases()[0] || null;
    renderSelect(); renderPartnerFilter(); renderCase();
    if (view === 'kanban') renderKanban();
  }
  function asText(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  }
  function asDate(v) {
    if (!v) return null;
    const str = String(v);
    const m = str.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : null;
  }
  async function importQuotes() {
    const { data, error } = await db.from('quote_requests')
      .select('*').order('created_at', { ascending: false }).limit(500);

    if (error) throw new Error('Lecture des demandes impossible : ' + error.message);
    if (!data?.length) {
      toast('Aucune demande de devis trouv?e.');
      return;
    }

    const { data: existing, error: existingError } = await db
      .from(TABLE).select('source_quote_id');

    if (existingError) throw new Error('V?rification des dossiers existants impossible : ' + existingError.message);

    const existingIds = new Set((existing || []).map(c => String(c.source_quote_id)));
    const candidates = data.filter(q => !existingIds.has(String(q.id)));

    if (!candidates.length) {
      toast('Toutes les demandes sont d?j? pr?sentes dans le CRM.');
      return;
    }

    const prepared = candidates.map(q => {
      const nested = parseObject(q.services);
      const name = q.full_name || q.client_name || q.customer_name ||
        q.company_name || q.contact_name || '';
      const email = q.email || q.client_email || q.customer_email || '';
      const equipment = q.equipment || q.equipment_description ||
        q.equipment_types || q.items || nested.equipment || '';
      const eventDate = asDate(q.event_date || q.start_date || q.date);
      const flags = [];
      if (!name) flags.push('Nom manquant');
      if (!email) flags.push('Email manquant');
      if (!equipment) flags.push('Mat?riel non pr?cis?');
      if (!eventDate) flags.push('Date ?v?nement manquante');

      const ref = q.reference || q.quote_reference || nested.quote_reference ||
        'RSS-' + String(q.id).slice(0, 8).toUpperCase();

      return {
        quote: q,
        flags,
        payload: {
          source_quote_id: String(q.id),
          reference: asText(ref),
          client_name: asText(name || email || 'Client ? identifier'),
          client_email: asText(email),
          client_phone: asText(q.phone || q.client_phone || q.customer_phone),
          event_type: asText(q.event_type || q.event || nested.event_type),
          event_city: asText(q.event_city || q.city || q.location),
          event_date: eventDate,
          return_date: asDate(q.return_date || q.end_date),
          equipment: asText(equipment),
          quantity: Number.parseInt(q.quantity || q.equipment_count, 10) || null,
          source_status: asText(q.status || 'new'),
          status: 'open',
          stage: 0,
          stage_data: {},
          source_snapshot: q,
          updated_at: new Date().toISOString()
        }
      };
    });

    const dialog = document.createElement('dialog');
    dialog.id = 'crm-import-preview-dialog';
    dialog.style.cssText = 'width:min(900px,94vw);max-height:85vh;padding:0;border:1px solid #6b2945;border-radius:12px;background:#180b12;color:white;';

    const rows = prepared.map((item, index) => {
      const q = item.quote;
      const label = item.payload.client_name || 'Client';
      const details = [
        item.payload.client_email,
        item.payload.event_city,
        item.payload.event_date,
        item.payload.equipment
      ].filter(Boolean).join(' ? ');
      const warning = item.flags.length
        ? '<span style="color:#ffbd75">' + esc(item.flags.join(', ')) + '</span>'
        : '<span style="color:#83d6a2">Informations principales pr?sentes</span>';
      return '<label style="display:flex;gap:12px;padding:12px;border-bottom:1px solid #4a2133;align-items:flex-start;cursor:pointer">' +
        '<input type="checkbox" data-import-index="' + index + '"' +
        (item.flags.length ? '' : ' checked') +
        ' style="margin-top:4px;accent-color:#fc036f">' +
        '<span style="min-width:0;overflow-wrap:anywhere"><strong>' + esc(label) +
        '</strong><br><small style="color:#cd8ea9">' + esc(details || 'Informations compl?mentaires absentes') +
        '</small><br><small>' + warning + '</small></span></label>';
    }).join('');

    dialog.innerHTML =
      '<div style="padding:18px 20px;border-bottom:1px solid #4a2133">' +
      '<h2 style="font-size:19px;font-weight:700">Pr?visualisation des demandes</h2>' +
      '<p style="color:#cd8ea9;font-size:12px;margin-top:5px">' +
      prepared.length + ' nouvelle(s) demande(s) ? ' + (data.length - candidates.length) +
      ' d?j? pr?sente(s) dans le CRM</p></div>' +
      '<div style="max-height:52vh;overflow:auto">' + rows + '</div>' +
      '<div style="padding:16px 20px;border-top:1px solid #4a2133">' +
      '<p style="font-size:11px;color:#cd8ea9;margin-bottom:12px">Les demandes incompl?tes sont d?coch?es par d?faut. V?rifiez-les avant de les s?lectionner. Aucune donn?e ne sera import?e sans confirmation.</p>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">' +
      '<button type="button" data-preview-cancel style="padding:9px 16px;border:1px solid #6b2945;border-radius:6px">Annuler</button>' +
      '<button type="button" data-preview-confirm style="padding:9px 16px;background:#fc036f;color:white;border-radius:6px;font-weight:700">Confirmer l?importation</button>' +
      '</div></div>';

    document.body.appendChild(dialog);

    const selected = await new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      dialog.querySelector('[data-preview-cancel]').addEventListener('click', () => {
        dialog.close();
        finish(null);
      });
      dialog.querySelector('[data-preview-confirm]').addEventListener('click', () => {
        const indexes = [...dialog.querySelectorAll('[data-import-index]:checked')]
          .map(input => Number(input.dataset.importIndex));
        dialog.close();
        finish(indexes);
      });
      dialog.addEventListener('cancel', () => finish(null), { once: true });
      dialog.addEventListener('close', () => {
        finish(null);
        dialog.remove();
      }, { once: true });
      dialog.showModal();
    });

    if (!selected?.length) {
      toast('Importation annul?e ou aucune demande s?lectionn?e.');
      return;
    }

    const payload = selected.map(index => prepared[index].payload);
    const { data: inserted, error: insertError } = await db
      .from(TABLE)
      .upsert(payload, { onConflict: 'source_quote_id', ignoreDuplicates: true })
      .select('id');

    if (insertError) throw new Error('Import CRM impossible : ' + insertError.message);

    await loadCases();
    toast((inserted?.length ?? 0) + ' dossier(s) import?(s) dans le CRM.');
  }
  async function updateActive(patch, eventText) {
    if (!active) throw new Error('Aucun dossier sélectionné.');
    if (busy) return;
    busy = true;
    try {
      const now = new Date().toISOString();
      const stageData = parseObject(active.stage_data);
      if (eventText) stageData[String(stageOf(active))] = { ...(stageData[String(stageOf(active))] || {}), action: eventText, note: eventText, saved_at: now };
      const payload = { ...patch, ...(eventText ? { stage_data: stageData } : {}), updated_at: now };
      const { data, error } = await db.from(TABLE).update(payload).eq('id', active.id).select('*').single();
      if (error) throw error;
      active = data;
      cases = cases.map(c => String(c.id) === String(data.id) ? data : c);
      renderSelect(); renderPartnerFilter(); renderCase();
      if (view === 'kanban') renderKanban();
    } finally { busy = false; }
  }
  function ensureMoreMenu() {
    let menu = $('#crm-more-menu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'crm-more-menu';
    menu.className = 'absolute z-50 right-0 bottom-11 min-w-48 rounded border border-[#4a2133] bg-[#1c0d14] p-2 shadow-xl';
    menu.hidden = true;
    menu.innerHTML = '<button type="button" data-more-action="copy" class="block w-full text-left rounded px-3 py-2 text-xs text-[#ffb2bf] hover:bg-[#331522]">Copier la référence</button><button type="button" data-more-action="email" class="block w-full text-left rounded px-3 py-2 text-xs text-[#ffb2bf] hover:bg-[#331522]">Envoyer un email</button><button type="button" data-more-action="dispute" class="block w-full text-left rounded px-3 py-2 text-xs text-[#ffb2bf] hover:bg-[#331522]">Ouvrir la page Litiges</button>';
    const anchor = $('#crm-action-more');
    if (anchor?.parentElement) { anchor.parentElement.classList.add('relative'); anchor.parentElement.appendChild(menu); }
    return menu;
  }
  function showBootError(error) {
    const sel = $('#crm-case-select');
    if (sel) sel.innerHTML = '<option value="">Connexion CRM indisponible</option>';
    toast(error?.message || 'Erreur de connexion au CRM.', true);
    console.error('[RentSoundSystem CRM]', error);
  }
  async function boot() {
    db = getClient();
    if (!db) { showBootError(new Error('Client Supabase introuvable. Vérifiez le chargement de admin-config.js et admin-supabase-adapter.js.')); return; }
    try {
      if (db.auth?.getUser) {
        const { data, error } = await db.auth.getUser();
        if (error) throw error;
        if (!data?.user) throw new Error('Session administrateur absente. Reconnectez-vous à l’administration.');
      }
      await loadCases();
      if (!cases.length) toast('Connexion Supabase OK. Aucun dossier CRM : cliquez sur « Importer les devis ».');
    } catch (error) { showBootError(error); }
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('button,[data-crm-stage]');
    if (!button) return;
    try {
      if (button.id === 'crm-refresh') { button.disabled = true; await loadCases(); }
      else if (button.id === 'crm-import') { button.disabled = true; await importQuotes(); }
      else if (button.id === 'crm-view-dossier') showView('dossier');
      else if (button.id === 'crm-view-kanban') showView('kanban');
      else if (button.id === 'crm-partner-filter') {
        const sel = $('#crm-partner-select');
        if (sel) { sel.hidden = !sel.hidden; button.setAttribute('aria-expanded', String(!sel.hidden)); if (!sel.hidden) sel.focus(); }
      }
      else if (button.id === 'crm-action-next') {
        if (!active) throw new Error('Sélectionnez un dossier.');
        const current = stageOf(active), next = Math.min(11, current + 1);
        await updateActive({ stage: next, status: next === 11 ? 'closed' : 'open' }, `Passage à l’étape ${next + 1} : ${STAGES[next]}`);
      }
      else if (button.id === 'crm-action-pdf') {
        if (!active) throw new Error('Sélectionnez un dossier avant de générer son document.');
        toast('Ouvrez la boîte d’impression puis choisissez « Enregistrer au format PDF ».');
        window.print();
      }
      else if (button.id === 'crm-action-call') {
        const phone = pick(active, ['technical_contact_phone', 'partner_phone', 'contact_phone', 'phone', 'client_phone'], '');
        if (!phone) throw new Error('Aucun numéro de téléphone enregistré dans ce dossier.');
        location.href = `tel:${encodeURIComponent(phone)}`;
      }
      else if (button.id === 'crm-action-dispute') {
        await updateActive({ dispute_status: 'open' }, 'Litige signalé depuis le tableau de bord');
        toast('Litige enregistré dans le dossier CRM.');
      }
      else if (button.id === 'crm-action-more') { const menu = ensureMoreMenu(); menu.hidden = !menu.hidden; }
      else if (button.dataset.moreAction === 'copy') {
        if (!active) throw new Error('Aucun dossier sélectionné.');
        const ref = active.reference || String(active.id);
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(ref);
        else { const temp = document.createElement('textarea'); temp.value = ref; document.body.appendChild(temp); temp.select(); document.execCommand('copy'); temp.remove(); }
        toast(`Référence copiée : ${ref}`); ensureMoreMenu().hidden = true;
      }
      else if (button.dataset.moreAction === 'email') {
        const email = pick(active, ['client_email', 'email', 'customer_email'], '');
        if (!email) throw new Error('Aucune adresse email dans ce dossier.');
        location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`RentSoundSystem – ${active.reference || 'Votre dossier'}`)}`;
      }
      else if (button.dataset.moreAction === 'dispute') location.href = '/admin-crm-litige.html' + (active ? `?case=${encodeURIComponent(active.id)}` : '');
      else if (button.id === 'crm-kanban-back') showView('dossier');
      else if (button.dataset.crmOpen) {
        active = cases.find(c => String(c.id) === String(button.dataset.crmOpen)) || null;
        renderSelect(); renderCase(); showView('dossier');
      }
      else if (button.dataset.crmStage !== undefined) openStage(Number(button.dataset.crmStage));
    } catch (error) { toast(error.message || 'Action impossible.', true); console.error('[RentSoundSystem CRM action]', error); }
    finally {
      if (button.id === 'crm-refresh' || button.id === 'crm-import') button.disabled = false;
    }
  });
  $('#crm-case-select')?.addEventListener('change', event => {
    active = cases.find(c => String(c.id) === event.target.value) || null;
    renderCase();
    if (view === 'kanban') renderKanban();
  });
  $('#crm-partner-select')?.addEventListener('change', event => {
    partnerFilter = event.target.value;
    const list = filteredCases();
    if (!list.some(c => String(c.id) === String(active?.id))) active = list[0] || null;
    renderPartnerFilter(); renderSelect(); renderCase();
    if (view === 'kanban') renderKanban();
  });
  document.addEventListener('keydown', event => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-crm-stage]')) {
      event.preventDefault(); openStage(Number(event.target.dataset.crmStage));
    }
    if (event.key === 'Escape') { const menu = $('#crm-more-menu'); if (menu) menu.hidden = true; }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

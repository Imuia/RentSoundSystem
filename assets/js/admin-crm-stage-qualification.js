(() => {
  'use strict';
  if (window.__RSS_CRM_QUALIFICATION_V1__) return;
  window.__RSS_CRM_QUALIFICATION_V1__ = true;

  const TABLE = 'crm_workflow_cases';
  const $ = (s, root = document) => root.querySelector(s);
  const form = $('#crm-qualification-form');
  const statusBox = $('#crm-qualification-status');
  const contextBox = $('#crm-case-context');
  const saveBtn = $('#crm-qualification-save');
  const submitBtn = $('#crm-qualification-submit');
  let db = null, currentCase = null, busy = false;

  const config = window.RSS_ADMIN_CONFIG || {};
  function client() {
    const candidates = config.clientCandidates || ['rssSupabase', 'supabaseClient', '_supabase', 'db', 'supabaseDb'];
    for (const name of candidates) if (window[name]?.from) return window[name];
    return window.rssSupabase?.from ? window.rssSupabase : null;
  }
  function parseObject(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try { const parsed = JSON.parse(value); return parsed && typeof parsed === 'object' ? parsed : {}; } catch (_) { return {}; }
  }
  function snapshot(row) {
    const s = parseObject(row?.source_snapshot);
    return [s, parseObject(s.data), parseObject(s.details), parseObject(s.request), parseObject(s.event), parseObject(s.services)];
  }
  function pick(row, keys, fallback = '') {
    for (const source of [row || {}, ...snapshot(row)]) {
      for (const key of keys) {
        const value = source?.[key];
        if (value !== undefined && value !== null && value !== '') return value;
      }
    }
    return fallback;
  }
  function stageData(row) { return parseObject(row?.stage_data); }
  function dateInput(value) { if (!value) return ''; const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/); return match ? match[1] : ''; }
  function setStatus(message, error = false) {
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.classList.remove('hidden');
    statusBox.style.borderColor = error ? 'rgba(248,113,113,.5)' : 'rgba(252,3,109,.35)';
    statusBox.style.background = error ? 'rgba(127,29,29,.18)' : 'rgba(252,3,109,.08)';
    statusBox.style.color = error ? '#fca5a5' : '#ffb2bf';
  }
  function setBusy(value) {
    busy = value;
    [saveBtn, submitBtn].forEach(btn => { if (btn) btn.disabled = value; });
    if (saveBtn) saveBtn.style.opacity = value ? '.65' : '1';
    if (submitBtn) submitBtn.style.opacity = value ? '.65' : '1';
  }
  function assign(name, value) {
    const field = form?.elements.namedItem(name);
    if (!field || value === undefined || value === null) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = String(value);
  }
  function populate(row) {
    const data = stageData(row)['1'] || {};
    const first = data.first_name ?? pick(row, ['first_name'], '');
    const last = data.last_name ?? pick(row, ['last_name'], '');
    const fullName = pick(row, ['client_name', 'full_name', 'customer_name', 'contact_name'], '');
    const nameParts = String(fullName).trim().split(/\s+/);
    const values = {
      first_name: first || (nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : fullName),
      last_name: last || (nameParts.length > 1 ? nameParts.slice(-1)[0] : ''),
      company_name: data.company_name ?? pick(row, ['company_name', 'company', 'organization'], ''),
      job_title: data.job_title ?? pick(row, ['job_title', 'function', 'position'], ''),
      client_phone: data.client_phone ?? pick(row, ['client_phone', 'phone', 'customer_phone'], ''),
      client_email: data.client_email ?? pick(row, ['client_email', 'email', 'customer_email'], ''),
      billing_address: data.billing_address ?? pick(row, ['billing_address', 'invoice_address', 'address'], ''),
      website: data.website ?? pick(row, ['website', 'site_web'], ''),
      social_links: data.social_links ?? pick(row, ['social_links', 'social_networks'], ''),
      event_date: dateInput(data.event_date ?? pick(row, ['event_date', 'start_date', 'date'], '')),
      delivery_time: data.delivery_time ?? pick(row, ['delivery_time', 'delivery_hour'], ''),
      pickup_time: data.pickup_time ?? pick(row, ['pickup_time', 'return_time', 'recovery_time'], ''),
      event_city: data.event_city ?? pick(row, ['event_city', 'city', 'location'], ''),
      event_address: data.event_address ?? pick(row, ['event_address', 'venue_address', 'address_event'], ''),
      event_type: data.event_type ?? pick(row, ['event_type', 'event'], ''),
      participants: data.participants ?? pick(row, ['participants', 'guest_count', 'attendees'], ''),
      equipment: data.equipment ?? pick(row, ['equipment', 'equipment_description', 'equipment_types', 'items'], ''),
      technical_needs: data.technical_needs ?? pick(row, ['technical_needs', 'technical_requirements', 'requirements'], ''),
      estimated_budget: data.estimated_budget ?? pick(row, ['estimated_budget', 'budget', 'budget_amount'], ''),
      information_verified: Boolean(data.information_verified)
    };
    Object.entries(values).forEach(([key, value]) => assign(key, value));
    const ref = row.reference || `RSS-${String(row.id).slice(0, 8).toUpperCase()}`;
    const name = row.client_name || row.client_email || 'Client sans nom';
    if (contextBox) {
      contextBox.innerHTML = `<strong class="text-white">Dossier sélectionné :</strong> ${escapeHtml(name)} <span class="mx-2 text-[#5d3f44]">·</span> <strong class="text-white">${escapeHtml(ref)}</strong> <span class="mx-2 text-[#5d3f44]">·</span> Étape actuelle : ${Number(row.stage || 0) + 1}/12`;
    }
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function collect() {
    const data = {};
    new FormData(form).forEach((value, key) => { data[key] = String(value).trim(); });
    data.information_verified = $('#verify-info')?.checked === true;
    return data;
  }
  function validate(finalize) {
    const first = $('#crm-first-name')?.value.trim();
    const last = $('#crm-last-name')?.value.trim();
    const email = $('#crm-client-email')?.value.trim();
    const phone = $('#crm-client-phone')?.value.trim();
    if (finalize) {
      if (!first || !last) throw new Error('Renseignez le prénom et le nom du client.');
      if (!email && !phone) throw new Error('Renseignez au moins un moyen de contact : email ou téléphone.');
      if (!$('#verify-info')?.checked) throw new Error('Cochez « Informations complètes » avant de valider la qualification.');
      const emailInput = $('#crm-client-email');
      if (email && emailInput && !emailInput.checkValidity()) throw new Error('L’adresse email renseignée n’est pas valide.');
      const website = $('#crm-website');
      if (website?.value && !website.checkValidity()) throw new Error('L’adresse du site web n’est pas valide.');
    }
  }
  async function save(finalize) {
    if (busy) return;
    if (!currentCase) throw new Error('Aucun dossier CRM sélectionné. Revenez à la vue Workflow et ouvrez un dossier.');
    validate(finalize);
    setBusy(true);
    try {
      const values = collect();
      const data = stageData(currentCase);
      data['1'] = { ...parseObject(data['1']), ...values, saved_at: new Date().toISOString(), action: finalize ? 'Qualification validée' : 'Qualification enregistrée' };
      const fullName = [values.first_name, values.last_name].filter(Boolean).join(' ').trim();
      const patch = {
        stage_data: data,
        client_name: fullName || currentCase.client_name || null,
        client_email: values.client_email || null,
        client_phone: values.client_phone || null,
        event_type: values.event_type || null,
        event_city: values.event_city || null,
        event_date: values.event_date || null,
        equipment: values.equipment || null,
        updated_at: new Date().toISOString()
      };
      if (finalize) patch.stage = Math.max(Number(currentCase.stage) || 0, 2);
      const { data: saved, error } = await db.from(TABLE).update(patch).eq('id', currentCase.id).select('*').single();
      if (error) throw new Error(`Enregistrement Supabase impossible : ${error.message}`);
      currentCase = saved;
      populate(saved);
      if (finalize) {
        setStatus('Qualification enregistrée. Passage à l’étape 3 : Vérification de la société…');
        const url = new URL('/admin-crm-etape-2-verification.html', location.origin);
        url.searchParams.set('case', saved.id);
        location.href = url.pathname + url.search;
      } else {
        setStatus('Qualification enregistrée dans le dossier CRM. Vous pouvez continuer plus tard.');
      }
    } finally { setBusy(false); }
  }
  async function boot() {
    try {
      db = client();
      if (!db) throw new Error('Client Supabase introuvable. Vérifiez admin-config.js et admin-supabase-adapter.js.');
      if (db.auth?.getUser) {
        const { data, error } = await db.auth.getUser();
        if (error) throw error;
        if (!data?.user) throw new Error('Session administrateur absente. Reconnectez-vous.');
      }
      const caseId = new URLSearchParams(location.search).get('case') || new URLSearchParams(location.search).get('id');
      if (!caseId) throw new Error('Aucun dossier sélectionné. Revenez à la vue Workflow et ouvrez le dossier à qualifier.');
      const { data, error } = await db.from(TABLE).select('*').eq('id', caseId).single();
      if (error) throw new Error(`Chargement du dossier impossible : ${error.message}`);
      currentCase = data;
      populate(data);
      const caseParam = `?case=${encodeURIComponent(data.id)}`;
      document.querySelectorAll('.crm-stage-nav a').forEach(link => {
        const url = new URL(link.href, location.origin);
        if (url.pathname !== '/admin-crm-workflow.html') url.searchParams.set('case', data.id);
        else url.searchParams.set('case', data.id);
        link.href = url.pathname + url.search;
      });
      if (contextBox) contextBox.dataset.loaded = 'true';
      setStatus('Dossier chargé. Les modifications seront enregistrées dans ce dossier CRM.');
    } catch (error) {
      if (contextBox) {
        contextBox.textContent = error.message || 'Impossible de charger le dossier.';
        contextBox.style.color = '#fca5a5';
        contextBox.style.borderColor = 'rgba(248,113,113,.5)';
      }
      setStatus(error.message || 'Erreur de chargement.', true);
      console.error('[RSS CRM qualification]', error);
    }
  }

  saveBtn?.addEventListener('click', async () => { try { await save(false); } catch (e) { setStatus(e.message, true); } });
  form?.addEventListener('submit', async event => {
    event.preventDefault();
    try { await save(true); } catch (e) { setStatus(e.message, true); } 
  });
  document.querySelector('[data-refresh-page]')?.addEventListener('click', () => location.reload());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

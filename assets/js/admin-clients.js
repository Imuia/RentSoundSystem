(() => {
  'use strict';
  const A = window.RSSAdmin;
  if (!A) return;

  const CRM_STORAGE_KEY = 'rss_crm_leads_data_v1';

  const state = {
    clients: [],
    reservations: [],
    stage: 'all',
    search: '',
    page: 1,
    pageSize: 15,
    selectedClient: null
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  // Charge les données CRM stockées en local ou simulées
  function getLocalCRMData() {
    try {
      const raw = localStorage.getItem(CRM_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveLocalCRMData(data) {
    try {
      localStorage.setItem(CRM_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('Erreur stockage local CRM', e);
    }
  }

  function getClientMeta(clientId) {
    const data = getLocalCRMData();
    return data[clientId] || { stage: 'lead', notes: [], dealValue: 0, lastContact: null };
  }

  function updateClientMeta(clientId, updates) {
    const data = getLocalCRMData();
    const current = data[clientId] || { stage: 'lead', notes: [], dealValue: 0, lastContact: null };
    data[clientId] = { ...current, ...updates, updatedAt: new Date().toISOString() };
    saveLocalCRMData(data);
    return data[clientId];
  }

  function formatStageLabel(stage) {
    switch (String(stage || '').toLowerCase()) {
      case 'lead': return { label: 'Lead (Nouveau)', class: 'warning' };
      case 'prospect': return { label: 'Prospect (Qualifié)', class: 'info' };
      case 'active': return { label: 'Client Actif', class: 'success' };
      case 'vip': return { label: 'Client VIP', class: 'success' };
      case 'inactive': return { label: 'Inactif', class: 'neutral' };
      default: return { label: 'Lead', class: 'warning' };
    }
  }

  async function loadData() {
    const statusNote = $('[data-crm-status-note]');
    const loading = $('[data-crm-loading]');
    const empty = $('[data-crm-empty]');

    if (loading) loading.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    if (statusNote) statusNote.textContent = 'Chargement des clients & réservations...';

    try {
      // Chargement de la ressource clients et reservations Supabase
      const [clientRows, reservationRows] = await Promise.all([
        A.listResource('clients', { limit: 2000 }).catch(() => []),
        A.listResource('reservations', { limit: 2000 }).catch(() => [])
      ]);

      state.reservations = reservationRows;

      // Fusionner avec les métadonnées local/CRM ou créer des entrées
      const localCRM = getLocalCRMData();

      state.clients = clientRows.map(row => {
        const id = String(row.id || row.user_id || row.email || Math.random());
        const meta = localCRM[id] || { stage: 'active', notes: [], dealValue: 0, lastContact: row.created_at || null };

        // Calcul du total dépensé via les réservations du client
        const clientEmail = (row.email || '').toLowerCase();
        const clientRes = reservationRows.filter(r => (r.customer_email || r.client_email || '').toLowerCase() === clientEmail);
        const totalSpent = clientRes.reduce((sum, r) => sum + (Number(r.total_price || r.amount || r.total) || 0), 0);

        return {
          id,
          raw: row,
          name: row.full_name || row.title || row.company_name || row.email || 'Client Sans Nom',
          email: row.email || row.subtitle || '',
          phone: row.phone || row.telephone || '—',
          company: row.company_name || row.company || '—',
          city: row.city || row.location || row.country || 'France',
          createdAt: row.created_at || new Date().toISOString(),
          totalSpent,
          reservationCount: clientRes.length,
          stage: meta.stage || (totalSpent > 3000 ? 'vip' : totalSpent > 0 ? 'active' : 'lead'),
          dealValue: meta.dealValue || (totalSpent > 0 ? totalSpent : 1200),
          lastContact: meta.lastContact || row.created_at || new Date().toISOString(),
          notes: meta.notes || []
        };
      });

      // Ajouter aussi les leads créés directement en local s'ils n'existent pas dans Supabase
      Object.keys(localCRM).forEach(id => {
        if (!state.clients.some(c => c.id === id) && localCRM[id].isLocalLead) {
          const l = localCRM[id];
          state.clients.unshift({
            id,
            raw: {},
            name: l.name,
            email: l.email,
            phone: l.phone || '—',
            company: l.company || '—',
            city: l.city || '—',
            createdAt: l.createdAt || new Date().toISOString(),
            totalSpent: 0,
            reservationCount: 0,
            stage: l.stage || 'lead',
            dealValue: l.dealValue || 0,
            lastContact: l.lastContact || l.createdAt,
            notes: l.notes || []
          });
        }
      });

      updateKPIs();
      render();
      if (statusNote) statusNote.textContent = `${state.clients.length} contact(s) chargé(s) dans le CRM.`;
    } catch (err) {
      console.error('[CRM] Erreur chargement', err);
      if (statusNote) statusNote.textContent = 'Mode dégradé CRM / Chargement local.';
    } finally {
      if (loading) loading.classList.add('hidden');
    }
  }

  function updateKPIs() {
    const total = state.clients.length;
    const leads = state.clients.filter(c => c.stage === 'lead' || c.stage === 'prospect').length;
    const pipeline = state.clients
      .filter(c => c.stage === 'lead' || c.stage === 'prospect')
      .reduce((sum, c) => sum + (Number(c.dealValue) || 0), 0);
    const converted = state.clients.filter(c => c.stage === 'active' || c.stage === 'vip').length;

    const leadCount = state.clients.filter(c => c.stage === 'lead').length;
    const prospectCount = state.clients.filter(c => c.stage === 'prospect').length;
    const activeCount = state.clients.filter(c => c.stage === 'active').length;
    const vipCount = state.clients.filter(c => c.stage === 'vip').length;
    const inactiveCount = state.clients.filter(c => c.stage === 'inactive').length;

    $('[data-crm-kpi-total]').textContent = total;
    $('[data-crm-kpi-leads]').textContent = leads;
    $('[data-crm-kpi-pipeline]').textContent = A.formatMoney(pipeline);
    $('[data-crm-kpi-converted]').textContent = converted;

    $('#count-all').textContent = total;
    $('#count-lead').textContent = leadCount;
    $('#count-prospect').textContent = prospectCount;
    $('#count-active').textContent = activeCount;
    $('#count-vip').textContent = vipCount;
    $('#count-inactive').textContent = inactiveCount;
  }

  function filteredClients() {
    const needle = state.search.trim().toLowerCase();
    return state.clients.filter(c => {
      const matchStage = state.stage === 'all' || c.stage === state.stage;
      if (!matchStage) return false;
      if (!needle) return true;
      const text = [c.name, c.email, c.phone, c.company, c.city].join(' ').toLowerCase();
      return text.includes(needle);
    });
  }

  function render() {
    const filtered = filteredClients();
    const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;

    const start = (state.page - 1) * state.pageSize;
    const pageRows = filtered.slice(start, start + state.pageSize);

    const body = $('[data-crm-body]');
    const empty = $('[data-crm-empty]');
    const countLabel = $('[data-crm-count]');
    const pageInfo = $('[data-crm-page-info]');
    const prevBtn = $('[data-crm-prev]');
    const nextBtn = $('[data-crm-next]');

    if (countLabel) countLabel.textContent = `${filtered.length} contact${filtered.length > 1 ? 's' : ''}`;
    if (pageInfo) pageInfo.textContent = `Page ${state.page} sur ${totalPages}`;
    if (prevBtn) prevBtn.disabled = state.page <= 1;
    if (nextBtn) nextBtn.disabled = state.page >= totalPages;

    if (!body) return;
    body.innerHTML = '';

    if (!pageRows.length) {
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    pageRows.forEach(c => {
      const tr = document.createElement('tr');
      const stageInfo = formatStageLabel(c.stage);

      tr.innerHTML = `
        <td>
          <div class="admin-table-primary">
            <div class="admin-table-avatar">${A.initials(c.name)}</div>
            <div>
              <strong>${A.escapeHtml(c.name)}</strong>
              <span>${A.escapeHtml(c.email || c.phone || '—')}</span>
            </div>
          </div>
        </td>
        <td>
          <strong>${A.escapeHtml(c.company !== '—' ? c.company : c.city)}</strong>
          <span style="display:block;font-size:11px;color:var(--rss-muted)">${A.escapeHtml(c.city)}</span>
        </td>
        <td>
          <strong>${c.totalSpent > 0 ? A.formatMoney(c.totalSpent) : A.formatMoney(c.dealValue)}</strong>
          <span style="display:block;font-size:10px;color:var(--rss-muted)">${c.reservationCount} commande(s)</span>
        </td>
        <td>${A.formatDate(c.lastContact || c.createdAt, true)}</td>
        <td><span class="admin-status ${stageInfo.class}">${stageInfo.label}</span></td>
        <td style="text-align:right">
          <div class="admin-table-actions">
            <button class="admin-table-action" type="button" title="Ouvrir la fiche CRM" data-crm-open="${c.id}">
              <span class="material-symbols-outlined">visibility</span>
            </button>
          </div>
        </td>
      `;

      tr.querySelector(`[data-crm-open="${c.id}"]`)?.addEventListener('click', () => openCRMDrawer(c));
      body.appendChild(tr);
    });
  }

  function openCRMDrawer(client) {
    state.selectedClient = client;
    const backdrop = $('[data-crm-drawer]');
    if (!backdrop) return;

    $('[data-crm-drawer-name]').textContent = client.name;
    $('[data-crm-drawer-sub]').textContent = [client.email, client.phone, client.company !== '—' ? client.company : null].filter(Boolean).join(' · ');

    // URLs actions rapides
    const emailBtn = $('#crm-action-email');
    if (emailBtn) emailBtn.href = client.email ? `mailto:${client.email}` : '#';

    const phoneBtn = $('#crm-action-phone');
    if (phoneBtn) phoneBtn.href = client.phone && client.phone !== '—' ? `tel:${client.phone.replaceAll(' ', '')}` : '#';

    // Info grille
    const infoBox = $('#crm-drawer-info');
    if (infoBox) {
      infoBox.innerHTML = `
        <div class="detail"><span>E-mail</span><strong>${A.escapeHtml(client.email || '—')}</strong></div>
        <div class="detail"><span>Téléphone</span><strong>${A.escapeHtml(client.phone || '—')}</strong></div>
        <div class="detail"><span>Société</span><strong>${A.escapeHtml(client.company || '—')}</strong></div>
        <div class="detail"><span>Ville / Zone</span><strong>${A.escapeHtml(client.city || '—')}</strong></div>
        <div class="detail"><span>Total Dépensé</span><strong>${A.formatMoney(client.totalSpent)}</strong></div>
        <div class="detail"><span>Création Fiche</span><strong>${A.formatDate(client.createdAt)}</strong></div>
      `;
    }

    // Select statut CRM & valeur
    const stageSelect = $('#crm-status-select');
    if (stageSelect) stageSelect.value = client.stage || 'lead';

    const valueInput = $('#crm-value-input');
    if (valueInput) valueInput.value = client.dealValue || 0;

    renderDrawerNotes();
    renderDrawerHistory();

    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
  }

  function closeCRMDrawer() {
    const backdrop = $('[data-crm-drawer]');
    if (backdrop) {
      backdrop.classList.remove('open');
      backdrop.setAttribute('aria-hidden', 'true');
    }
    state.selectedClient = null;
  }

  function renderDrawerNotes() {
    const box = $('#crm-notes-list');
    if (!box || !state.selectedClient) return;

    const notes = state.selectedClient.notes || [];
    if (!notes.length) {
      box.innerHTML = '<div class="admin-note">Aucune note de suivi enregistrée pour ce contact.</div>';
      return;
    }

    box.innerHTML = notes.map(n => `
      <div class="history-item">
        <strong>${A.escapeHtml(n.author || 'Administrateur')}</strong>
        <p>${A.escapeHtml(n.text)}</p>
        <small>${A.formatDate(n.date, true)}</small>
      </div>
    `).join('');
  }

  function renderDrawerHistory() {
    const box = $('#crm-history-list');
    if (!box || !state.selectedClient) return;

    const email = (state.selectedClient.email || '').toLowerCase();
    const resList = state.reservations.filter(r => (r.customer_email || r.client_email || '').toLowerCase() === email);

    if (!resList.length) {
      box.innerHTML = '<div class="admin-note">Aucune réservation passée enregistrée.</div>';
      return;
    }

    box.innerHTML = resList.map(r => `
      <div class="history-item">
        <strong>${A.escapeHtml(r.equipment_name || r.title || 'Réservation')} — ${A.formatMoney(r.total_price || r.amount || 0)}</strong>
        <p>Statut : ${A.escapeHtml(r.status || 'confirmée')} | Date : ${A.formatDate(r.created_at || r.start_date)}</p>
      </div>
    `).join('');
  }

  // Sauvegarde des modifications dans le drawer
  function bindDrawerEvents() {
    $('[data-crm-drawer-close]')?.addEventListener('click', closeCRMDrawer);

    $('#crm-save-status')?.addEventListener('click', () => {
      if (!state.selectedClient) return;
      const newStage = $('#crm-status-select')?.value || 'lead';
      const newValue = Number($('#crm-value-input')?.value || 0);

      state.selectedClient.stage = newStage;
      state.selectedClient.dealValue = newValue;
      state.selectedClient.lastContact = new Date().toISOString();

      updateClientMeta(state.selectedClient.id, {
        stage: newStage,
        dealValue: newValue,
        lastContact: state.selectedClient.lastContact
      });

      A.toast('Étape CRM mise à jour', 'success');
      updateKPIs();
      render();
    });

    $('#crm-add-note')?.addEventListener('click', () => {
      if (!state.selectedClient) return;
      const input = $('#crm-note-text');
      const text = input?.value.trim();
      if (!text) return A.toast('Veuillez saisir une note', 'error');

      const newNote = {
        author: 'Admin RSS',
        text,
        date: new Date().toISOString()
      };

      if (!state.selectedClient.notes) state.selectedClient.notes = [];
      state.selectedClient.notes.unshift(newNote);
      state.selectedClient.lastContact = new Date().toISOString();

      updateClientMeta(state.selectedClient.id, {
        notes: state.selectedClient.notes,
        lastContact: state.selectedClient.lastContact
      });

      if (input) input.value = '';
      A.toast('Note ajoutée avec succès', 'success');
      renderDrawerNotes();
      render();
    });
  }

  // Modale création nouveau lead
  function bindNewLeadModal() {
    const modal = $('[data-crm-modal-new]');
    const openBtn = $('[data-crm-add-lead]');
    const closeBtns = $$('[data-crm-modal-new-close]');
    const form = $('#crm-new-lead-form');

    const open = () => {
      modal?.classList.add('open');
      modal?.setAttribute('aria-hidden', 'false');
    };

    const close = () => {
      modal?.classList.remove('open');
      modal?.setAttribute('aria-hidden', 'true');
    };

    openBtn?.addEventListener('click', open);
    closeBtns.forEach(btn => btn.addEventListener('click', close));

    form?.addEventListener('submit', (e) => {
      e.preventDefault();

      const name = $('#new-lead-name')?.value.trim();
      const email = $('#new-lead-email')?.value.trim();
      const phone = $('#new-lead-phone')?.value.trim() || '—';
      const company = $('#new-lead-company')?.value.trim() || '—';
      const city = $('#new-lead-city')?.value.trim() || '—';
      const stage = $('#new-lead-stage')?.value || 'lead';
      const dealValue = Number($('#new-lead-value')?.value || 0);
      const noteText = $('#new-lead-note')?.value.trim();

      if (!name || !email) {
        return A.toast('Nom et e-mail requis', 'error');
      }

      const id = `lead_${Date.now()}`;
      const now = new Date().toISOString();
      const initialNotes = noteText ? [{ author: 'Admin RSS', text: noteText, date: now }] : [];

      const localLeadData = {
        isLocalLead: true,
        name,
        email,
        phone,
        company,
        city,
        createdAt: now,
        stage,
        dealValue,
        lastContact: now,
        notes: initialNotes
      };

      saveLocalCRMData({
        ...getLocalCRMData(),
        [id]: localLeadData
      });

      state.clients.unshift({
        id,
        raw: {},
        name,
        email,
        phone,
        company,
        city,
        createdAt: now,
        totalSpent: 0,
        reservationCount: 0,
        stage,
        dealValue,
        lastContact: now,
        notes: initialNotes
      });

      form.reset();
      close();
      A.toast('Contact / Lead créé avec succès !', 'success');
      updateKPIs();
      render();
    });
  }

  function bindEvents() {
    // Filtres d'étape CRM
    $$('[data-crm-stage]').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('[data-crm-stage]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.stage = btn.dataset.crmStage || 'all';
        state.page = 1;
        render();
      });
    });

    // Recherche
    $('[data-crm-search]')?.addEventListener('input', (e) => {
      state.search = e.target.value;
      state.page = 1;
      render();
    });

    // Pagination
    $('[data-crm-prev]')?.addEventListener('click', () => {
      if (state.page > 1) {
        state.page -= 1;
        render();
      }
    });

    $('[data-crm-next]')?.addEventListener('click', () => {
      state.page += 1;
      render();
    });

    // Export CSV
    $('[data-crm-export]')?.addEventListener('click', () => {
      const rows = filteredClients().map(c => ({
        ID: c.id,
        Nom: c.name,
        Email: c.email,
        Telephone: c.phone,
        Societe: c.company,
        Ville: c.city,
        Etape_CRM: c.stage,
        Valeur_Deal_EUR: c.dealValue,
        Total_Depense_EUR: c.totalSpent,
        Nombre_Commandes: c.reservationCount,
        Dernier_Contact: c.lastContact
      }));
      A.exportRows(rows, `crm-export-${new Date().toISOString().slice(0, 10)}.csv`);
    });

    bindDrawerEvents();
    bindNewLeadModal();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (typeof A.requireAdmin === 'function') {
      if (!await A.requireAdmin()) return;
    }
    bindEvents();
    await loadData();
  });
})();

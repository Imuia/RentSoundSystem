(() => {
  'use strict';

  const config = window.RSS_ADMIN_CONFIG || {};
  const state = {
    supabase: null,
    user: null,
    currentResource: null,
    currentTable: null,
    rows: [],
    filtered: [],
    page: 1,
    pageSize: Number(config.pageSize || 12),
    search: '',
    status: 'all'
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function getClient() {
    if (state.supabase) return state.supabase;
    for (const key of config.clientCandidates || []) {
      if (window[key] && typeof window[key].from === 'function') {
        state.supabase = window[key];
        return state.supabase;
      }
    }
    if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
      state.supabase = window.supabaseClient;
      return state.supabase;
    }
    return null;
  }

  function pick(row, candidates, fallback = '') {
    if (!row || !Array.isArray(candidates)) return fallback;
    for (const key of candidates) {
      const value = row[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return fallback;
  }

  function formatMoney(value, currency = 'EUR') {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(number);
    } catch {
      return `${number.toLocaleString('fr-FR')} €`;
    }
  }

  function formatDate(value, withTime = false) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('fr-FR', withTime
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' }
    ).format(date);
  }

  function normalizeStatus(value) {
    if (value === true) return 'actif';
    if (value === false) return 'inactif';
    return String(value || 'inconnu').toLowerCase().trim();
  }

  function statusClass(value) {
    const status = normalizeStatus(value);
    if (/paid|payé|publ|approved|valid|confirm|active|actif|completed|termin/.test(status)) return 'success';
    if (/pending|attente|draft|devis|processing|nouveau|review/.test(status)) return 'warning';
    if (/fail|échec|cancel|annul|refund|litige|rejet|inactif|disabled/.test(status)) return 'danger';
    if (/sent|envoy|scheduled|planifi|open|ouvert/.test(status)) return 'info';
    return 'neutral';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function initials(value) {
    return String(value || 'RSS')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase())
      .join('') || 'RS';
  }

  function toast(message, type = '') {
    let container = $('.admin-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'admin-toast-container';
      document.body.appendChild(container);
    }
    const item = document.createElement('div');
    item.className = `admin-toast ${type}`.trim();
    item.textContent = message;
    container.appendChild(item);
    setTimeout(() => item.remove(), 3600);
  }

  function setupShell() {
    const sidebar = $('.admin-sidebar');
    const overlay = $('.admin-mobile-overlay');
    const menu = $('[data-admin-menu]');
    const close = $('[data-admin-close-menu]');
    const toggle = (open) => {
      sidebar?.classList.toggle('open', open);
      overlay?.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    };
    menu?.addEventListener('click', () => toggle(true));
    close?.addEventListener('click', () => toggle(false));
    overlay?.addEventListener('click', () => toggle(false));

    const page = document.body.dataset.adminPage;
    if (page) {
      $$('[data-nav-page]').forEach(link => link.classList.toggle('active', link.dataset.navPage === page));
    }

    $('[data-refresh-page]')?.addEventListener('click', () => window.location.reload());
  }

  async function detectUser() {
    const client = getClient();
    const emailTargets = $$('[data-admin-email], #admin-email');
    if (!client?.auth?.getUser) {
      emailTargets.forEach(el => { el.textContent = 'Administrateur'; });
      return null;
    }
    try {
      const { data, error } = await client.auth.getUser();
      if (error) throw error;
      state.user = data?.user || null;
      const email = state.user?.email || 'Administrateur';
      emailTargets.forEach(el => { el.textContent = email; });
      return state.user;
    } catch (error) {
      emailTargets.forEach(el => { el.textContent = 'Session à vérifier'; });
      console.warn('[RSS Admin] Auth non vérifiée:', error);
      return null;
    }
  }

  async function tryTable(tables, options = {}) {
    const client = getClient();
    if (!client) return { rows: [], table: null, error: new Error('Client Supabase introuvable') };
    let lastError = null;
    for (const table of tables || []) {
      try {
        let query = client.from(table).select('*');
        if (options.limit) query = query.limit(options.limit);
        const { data, error } = await query;
        if (error) throw error;
        return { rows: Array.isArray(data) ? data : [], table, error: null };
      } catch (error) {
        lastError = error;
      }
    }
    return { rows: [], table: null, error: lastError || new Error('Aucune table compatible trouvée') };
  }

  async function loadResource(resourceName, options = {}) {
    const resource = config.resources?.[resourceName];
    if (!resource) throw new Error(`Ressource inconnue : ${resourceName}`);
    state.currentResource = resourceName;
    const result = await tryTable(resource.tables, options);
    state.currentTable = result.table;
    state.rows = result.rows;
    state.filtered = result.rows;
    return { ...result, resource };
  }

  function rowView(row, resourceName = state.currentResource) {
    const resource = config.resources?.[resourceName] || {};
    return {
      id: pick(row, resource.id, ''),
      title: pick(row, resource.title, 'Sans titre'),
      subtitle: pick(row, resource.subtitle, ''),
      status: pick(row, resource.status, 'inconnu'),
      amount: pick(row, resource.amount, null),
      date: pick(row, resource.date, null),
      location: pick(row, resource.location, ''),
      raw: row
    };
  }

  function filterRows(rows, resourceName, search = '', status = 'all') {
    const needle = search.trim().toLowerCase();
    return rows.filter(row => {
      const view = rowView(row, resourceName);
      const searchable = JSON.stringify(row).toLowerCase();
      const searchOk = !needle || searchable.includes(needle);
      const statusOk = status === 'all' || normalizeStatus(view.status).includes(status.toLowerCase());
      return searchOk && statusOk;
    });
  }

  function exportRows(rows, filename = 'export.csv') {
    if (!rows?.length) {
      toast('Aucune donnée à exporter', 'error');
      return;
    }
    const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
    const csv = [keys.join(';')]
      .concat(rows.map(row => keys.map(key => {
        const value = row[key];
        const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');
        return `"${text.replaceAll('"', '""')}"`;
      }).join(';')))
      .join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    toast('Export CSV créé', 'success');
  }

  function exportCurrentRows() {
    exportRows(state.filtered, `${state.currentResource || 'admin'}-${new Date().toISOString().slice(0,10)}.csv`);
  }

  function openGenericDrawer(row, title = 'Détail') {
    const backdrop = $('[data-generic-drawer]');
    const content = $('[data-generic-drawer-content]');
    const heading = $('[data-generic-drawer-title]');
    if (!backdrop || !content) return;
    heading.textContent = title;
    content.innerHTML = Object.entries(row)
      .map(([key, value]) => `<div class="detail"><span>${escapeHtml(key.replaceAll('_', ' '))}</span><strong>${escapeHtml(typeof value === 'object' ? JSON.stringify(value) : value)}</strong></div>`)
      .join('');
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
  }

  function closeGenericDrawer() {
    const backdrop = $('[data-generic-drawer]');
    backdrop?.classList.remove('open');
    backdrop?.setAttribute('aria-hidden', 'true');
  }

  function setupGenericDrawer() {
    $('[data-generic-drawer-close]')?.addEventListener('click', closeGenericDrawer);
    $('[data-generic-drawer]')?.addEventListener('click', (event) => {
      if (event.target.matches('[data-generic-drawer]')) closeGenericDrawer();
    });
  }

  async function updateStatus(row, status, resourceName = state.currentResource) {
    const client = getClient();
    const resource = config.resources?.[resourceName];
    if (!client || !state.currentTable || !resource) throw new Error('Connexion ou table indisponible');
    const idField = resource.id?.find(key => row[key] !== undefined);
    const statusField = resource.status?.find(key => row[key] !== undefined);
    if (!idField || !statusField) throw new Error('Champ identifiant ou statut introuvable');
    const { error } = await client.from(state.currentTable).update({ [statusField]: status }).eq(idField, row[idField]);
    if (error) throw error;
    row[statusField] = status;
    return row;
  }

  function getIntegrationState() {
    return {
      connected: Boolean(getClient()),
      table: state.currentTable,
      resource: state.currentResource
    };
  }

  window.RSSAdmin = {
    state,
    config,
    $, $$,
    getClient,
    pick,
    formatMoney,
    formatDate,
    normalizeStatus,
    statusClass,
    escapeHtml,
    initials,
    toast,
    tryTable,
    loadResource,
    rowView,
    filterRows,
    exportRows,
    openGenericDrawer,
    closeGenericDrawer,
    updateStatus,
    getIntegrationState
  };

  document.addEventListener('DOMContentLoaded', () => {
    setupShell();
    setupGenericDrawer();
    detectUser();
  });
})();

(() => {
  'use strict';

  const config = window.RSS_ADMIN_CONFIG || {};
  const state = {
    supabase: null,
    user: null,
    role: null,
    currentResource: null,
    rows: [],
    filtered: [],
    page: 1,
    pageSize: Number(config.pageSize || 20),
    search: '',
    status: 'all',
    loading: false
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function getClient() {
    if (state.supabase && typeof state.supabase.from === 'function') return state.supabase;
    if (window.rssSupabase && typeof window.rssSupabase.from === 'function') {
      state.supabase = window.rssSupabase;
      return state.supabase;
    }
    for (const key of config.clientCandidates || []) {
      if (window[key] && typeof window[key].from === 'function') {
        state.supabase = window[key];
        return state.supabase;
      }
    }
    if (config.supabaseUrl && config.supabaseAnonKey && window.supabase?.createClient) {
      state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      window.rssSupabase = state.supabase;
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
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency, maximumFractionDigits: 2
      }).format(number);
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
    if (/paid|succeed|payé|publ|approved|valid|confirm|active|actif|completed|termin/.test(status)) return 'success';
    if (/pending|attente|draft|devis|processing|nouveau|review/.test(status)) return 'warning';
    if (/fail|échec|cancel|annul|refund|litige|rejet|inactif|disabled|hidden|blocked/.test(status)) return 'danger';
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
    setTimeout(() => item.remove(), 4200);
  }

  function showFatal(title, message) {
    const content = $('.admin-content');
    if (!content) return;
    content.innerHTML = `<section class="admin-card"><div class="admin-empty"><div><span class="material-symbols-outlined">lock</span><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></div></div></section>`;
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

    const globalSearch = $('.admin-search-global input');
    globalSearch?.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      const value = globalSearch.value.trim();
      const local = $('[data-resource-search]');
      if (local) {
        local.value = value;
        local.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (value) {
        location.href = `/admin-reservations.html?q=${encodeURIComponent(value)}`;
      }
    });
  }

  async function requireAdmin() {
    const client = getClient();
    if (!client) {
      showFatal('Supabase indisponible', 'Le client Supabase ne peut pas être initialisé.');
      throw new Error('Client Supabase introuvable');
    }

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;
    const session = sessionData?.session;
    if (!session?.user) {
      const redirect = location.pathname + location.search;
      location.href = `${config.loginUrl || '/connexion-inscription.html'}?redirect=${encodeURIComponent(redirect)}`;
      return false;
    }

    state.user = session.user;
    $$('[data-admin-email], #admin-email').forEach(el => { el.textContent = state.user.email || 'Administrateur'; });

    const { data: role, error } = await client.rpc('my_admin_role');
    const allowed = config.allowedAdminRoles || ['admin', 'super_admin'];
    if (error || !allowed.includes(String(role || ''))) {
      showFatal('Accès non autorisé', 'Cette page est réservée aux administrateurs RentSoundSystem actifs.');
      console.warn('[RSS Admin] rôle refusé', error || role);
      return false;
    }

    state.role = String(role);
    document.documentElement.dataset.adminRole = state.role;
    return true;
  }

  function unwrapRpcRows(data) {
    if (!Array.isArray(data)) return [];
    return data.map(item => {
      if (item && typeof item === 'object' && item.row_data && typeof item.row_data === 'object') return item.row_data;
      return item;
    }).filter(item => item && typeof item === 'object');
  }

  async function listResource(resourceName, options = {}) {
    const client = getClient();
    if (!client) throw new Error('Client Supabase introuvable');
    const limit = Math.min(Number(options.limit || config.maxRows || 2000), 5000);
    const { data, error } = await client.rpc('admin_list_resource', {
      p_resource: resourceName,
      p_limit: limit,
      p_offset: Number(options.offset || 0),
      p_search: options.search || null,
      p_status: options.status && options.status !== 'all' ? options.status : null
    });
    if (error) throw error;
    return unwrapRpcRows(data);
  }

  async function loadResource(resourceName, options = {}) {
    const resource = config.resources?.[resourceName];
    if (!resource) throw new Error(`Ressource inconnue : ${resourceName}`);
    state.currentResource = resourceName;
    const rows = await listResource(resourceName, options);
    state.rows = rows;
    state.filtered = rows;
    return { rows, resource, table: resource.source, error: null };
  }

  function rowView(row, resourceName = state.currentResource) {
    const resource = config.resources?.[resourceName] || {};
    return {
      id: pick(row, resource.id, row.id || ''),
      title: pick(row, resource.title, row.title || 'Sans titre'),
      subtitle: pick(row, resource.subtitle, row.subtitle || ''),
      status: pick(row, resource.status, row.status || 'inconnu'),
      amount: pick(row, resource.amount, row.amount ?? null),
      date: pick(row, resource.date, row.date || null),
      location: pick(row, resource.location, row.location || ''),
      source: row._source || resource.source || resourceName,
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
    if (!rows?.length) return toast('Aucune donnée à exporter', 'error');
    const hidden = new Set(['password', 'access_token', 'refresh_token', 'service_role_key']);
    const keys = Array.from(new Set(rows.flatMap(row => Object.keys(row)))).filter(key => !hidden.has(key));
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

  function valueHtml(value) {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'object') return escapeHtml(JSON.stringify(value, null, 2));
    const text = String(value);
    if (/^https?:\/\//i.test(text)) {
      return `<a href="${escapeHtml(text)}" target="_blank" rel="noopener" style="color:var(--rss-info);word-break:break-all">Ouvrir le lien</a>`;
    }
    return escapeHtml(text);
  }

  function openGenericDrawer(row, title = 'Détail') {
    const backdrop = $('[data-generic-drawer]');
    const content = $('[data-generic-drawer-content]');
    const heading = $('[data-generic-drawer-title]');
    if (!backdrop || !content || !heading) return;
    heading.textContent = title;
    const ignored = new Set(['_resource', '_source', 'title', 'subtitle', 'amount', 'date', 'location']);
    content.innerHTML = Object.entries(row)
      .filter(([key]) => !ignored.has(key))
      .map(([key, value]) => `<div class="detail"><span>${escapeHtml(key.replaceAll('_', ' '))}</span><strong>${valueHtml(value)}</strong></div>`)
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
    $('[data-generic-drawer]')?.addEventListener('click', event => {
      if (event.target.matches('[data-generic-drawer]')) closeGenericDrawer();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeGenericDrawer();
    });
  }

  async function updateStatus(row, status, resourceName = state.currentResource, note = null) {
    const client = getClient();
    const resource = config.resources?.[resourceName];
    if (!client || !resource) throw new Error('Connexion ou ressource indisponible');
    if (resource.readOnly) throw new Error('Cette ressource est en lecture seule');
    if (!resource.statusOptions?.includes(status)) throw new Error('Transition de statut non autorisée');
    const id = rowView(row, resourceName).id;
    const source = row._source || resource.source || resourceName;
    const { data, error } = await client.rpc('admin_update_resource_status', {
      p_resource: resourceName,
      p_source: source,
      p_id: String(id),
      p_status: status,
      p_note: note || null
    });
    if (error) throw error;
    return data;
  }

  async function getSettings() {
    const client = getClient();
    const { data, error } = await client.rpc('admin_get_settings');
    if (error) throw error;
    return data || {};
  }

  async function saveSettings(settings) {
    const client = getClient();
    const { data, error } = await client.rpc('admin_save_settings', { p_settings: settings || {} });
    if (error) throw error;
    return data;
  }

  window.RSSAdmin = {
    state, config, $, $$,
    getClient, requireAdmin,
    pick, formatMoney, formatDate, normalizeStatus, statusClass,
    escapeHtml, initials, toast,
    listResource, loadResource, rowView, filterRows, exportRows,
    openGenericDrawer, closeGenericDrawer, updateStatus,
    getSettings, saveSettings
  };

  document.addEventListener('DOMContentLoaded', () => {
    setupShell();
    setupGenericDrawer();
  });
})();

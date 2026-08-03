(() => {
  'use strict';
  const A = window.RSSAdmin;
  if (!A) return;

  const resourceName = document.body.dataset.resource;
  if (!resourceName) return;
  const resource = A.config.resources?.[resourceName];

  const tableBody = document.querySelector('[data-resource-body]');
  const loading = document.querySelector('[data-resource-loading]');
  const empty = document.querySelector('[data-resource-empty]');
  const searchInput = document.querySelector('[data-resource-search]');
  const statusButtons = Array.from(document.querySelectorAll('[data-resource-status]'));
  const countLabel = document.querySelector('[data-resource-count]');
  const integrationNote = document.querySelector('[data-integration-note]');
  const prevButton = document.querySelector('[data-page-prev]');
  const nextButton = document.querySelector('[data-page-next]');
  const pageInfo = document.querySelector('[data-page-info]');
  const refreshButton = document.querySelector('[data-resource-refresh]');
  const exportButton = document.querySelector('[data-export-page]');

  function pageRows() {
    const filtered = A.filterRows(A.state.rows, resourceName, A.state.search, A.state.status);
    A.state.filtered = filtered;
    const totalPages = Math.max(1, Math.ceil(filtered.length / A.state.pageSize));
    if (A.state.page > totalPages) A.state.page = totalPages;
    const start = (A.state.page - 1) * A.state.pageSize;
    return { filtered, rows: filtered.slice(start, start + A.state.pageSize), totalPages };
  }

  function allowedStatusPrompt(current) {
    const options = resource?.statusOptions || [];
    if (!options.length) return null;
    const answer = window.prompt(
      `Choisissez un statut autorisé :\n${options.join(' · ')}`,
      options.includes(String(current)) ? String(current) : options[0]
    );
    if (!answer) return null;
    const value = answer.trim();
    if (!options.includes(value)) {
      A.toast(`Statut refusé. Valeurs autorisées : ${options.join(', ')}`, 'error');
      return null;
    }
    return value;
  }

  function render() {
    const { filtered, rows, totalPages } = pageRows();
    if (countLabel) countLabel.textContent = `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`;
    if (pageInfo) pageInfo.textContent = `Page ${A.state.page} sur ${totalPages}`;
    if (prevButton) prevButton.disabled = A.state.page <= 1;
    if (nextButton) nextButton.disabled = A.state.page >= totalPages;
    if (!tableBody) return;

    tableBody.innerHTML = '';
    empty?.classList.toggle('hidden', rows.length > 0);

    for (const row of rows) {
      const v = A.rowView(row, resourceName);
      const tr = document.createElement('tr');
      const canEdit = !resource?.readOnly && Array.isArray(resource?.statusOptions) && resource.statusOptions.length > 0;
      tr.innerHTML = `
        <td><div class="admin-table-primary"><div class="admin-table-avatar">${A.initials(v.title)}</div><div><strong>${A.escapeHtml(v.title)}</strong><span>${A.escapeHtml(v.subtitle || v.id || '—')}</span></div></div></td>
        <td>${A.escapeHtml(v.location || '—')}</td>
        <td>${v.amount === null || v.amount === '' ? '—' : A.formatMoney(v.amount, row.currency || 'EUR')}</td>
        <td>${A.formatDate(v.date, true)}</td>
        <td><span class="admin-status ${A.statusClass(v.status)}">${A.escapeHtml(v.status)}</span></td>
        <td><div class="admin-table-actions">
          <button class="admin-table-action" type="button" title="Voir le détail" data-row-open><span class="material-symbols-outlined">visibility</span></button>
          ${canEdit ? '<button class="admin-table-action" type="button" title="Changer le statut" data-row-status><span class="material-symbols-outlined">edit_note</span></button>' : ''}
        </div></td>`;

      tr.querySelector('[data-row-open]')?.addEventListener('click', () => A.openGenericDrawer(row, v.title));
      tr.querySelector('[data-row-status]')?.addEventListener('click', async () => {
        const newStatus = allowedStatusPrompt(String(v.status || ''));
        if (!newStatus || newStatus === String(v.status || '')) return;
        const note = window.prompt('Note interne facultative :', '') || null;
        if (!window.confirm(`Confirmer le passage au statut « ${newStatus} » ?`)) return;
        try {
          await A.updateStatus(row, newStatus, resourceName, note);
          A.toast('Statut mis à jour', 'success');
          await load();
        } catch (error) {
          console.error(error);
          A.toast(error.message || 'Mise à jour impossible', 'error');
        }
      });
      tableBody.appendChild(tr);
    }
  }

  async function load() {
    if (A.state.loading) return;
    A.state.loading = true;
    loading?.classList.remove('hidden');
    empty?.classList.add('hidden');
    if (integrationNote) integrationNote.textContent = 'Connexion sécurisée à Supabase…';
    if (refreshButton) refreshButton.disabled = true;
    try {
      await A.loadResource(resourceName, { limit: A.config.maxRows || 2000 });
      const q = new URLSearchParams(location.search).get('q');
      if (q && searchInput && !searchInput.value) searchInput.value = q;
      A.state.search = searchInput?.value || '';
      if (integrationNote) integrationNote.textContent = `${A.state.rows.length} enregistrement(s) chargé(s) via les fonctions administrateur sécurisées.`;
      render();
    } catch (error) {
      console.error(`[RSS Admin] ${resourceName}`, error);
      if (integrationNote) integrationNote.textContent = `Erreur : ${error.message || 'source indisponible'}`;
      empty?.classList.remove('hidden');
      A.toast('Impossible de charger les données. Exécutez le fichier SQL admin.', 'error');
    } finally {
      loading?.classList.add('hidden');
      if (refreshButton) refreshButton.disabled = false;
      A.state.loading = false;
    }
  }

  searchInput?.addEventListener('input', () => {
    A.state.search = searchInput.value;
    A.state.page = 1;
    render();
  });

  statusButtons.forEach(button => button.addEventListener('click', () => {
    statusButtons.forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    A.state.status = button.dataset.resourceStatus || 'all';
    A.state.page = 1;
    render();
  }));

  prevButton?.addEventListener('click', () => { if (A.state.page > 1) { A.state.page -= 1; render(); } });
  nextButton?.addEventListener('click', () => { A.state.page += 1; render(); });
  refreshButton?.addEventListener('click', load);
  exportButton?.addEventListener('click', () => A.exportRows(A.state.filtered, `${resourceName}-${new Date().toISOString().slice(0,10)}.csv`));

  document.addEventListener('DOMContentLoaded', async () => {
    if (!await A.requireAdmin()) return;
    await load();
  });
})();

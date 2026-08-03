(() => {
  'use strict';
  const A = window.RSSAdmin;
  if (!A) return;

  const page = document.body.dataset.adminPage;
  const resourceName = document.body.dataset.resource;
  if (!resourceName) return;

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

  function render() {
    const filtered = A.filterRows(A.state.rows, resourceName, A.state.search, A.state.status);
    A.state.filtered = filtered;
    const totalPages = Math.max(1, Math.ceil(filtered.length / A.state.pageSize));
    if (A.state.page > totalPages) A.state.page = totalPages;
    const start = (A.state.page - 1) * A.state.pageSize;
    const rows = filtered.slice(start, start + A.state.pageSize);

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
      tr.innerHTML = `
        <td>
          <div class="admin-table-primary">
            <div class="admin-table-avatar">${A.initials(v.title)}</div>
            <div><strong>${A.escapeHtml(v.title)}</strong><span>${A.escapeHtml(v.subtitle || v.id || '—')}</span></div>
          </div>
        </td>
        <td>${A.escapeHtml(v.location || '—')}</td>
        <td>${v.amount === null || v.amount === '' ? '—' : A.formatMoney(v.amount, row.currency || 'EUR')}</td>
        <td>${A.formatDate(v.date, false)}</td>
        <td><span class="admin-status ${A.statusClass(v.status)}">${A.escapeHtml(v.status)}</span></td>
        <td>
          <div class="admin-table-actions">
            <button class="admin-table-action" type="button" title="Voir le détail" data-row-view><span class="material-symbols-outlined">visibility</span></button>
            <button class="admin-table-action" type="button" title="Actualiser le statut" data-row-status><span class="material-symbols-outlined">edit_note</span></button>
          </div>
        </td>`;
      tr.querySelector('[data-row-view]').addEventListener('click', () => A.openGenericDrawer(row, v.title));
      tr.querySelector('[data-row-status]').addEventListener('click', async () => {
        const newStatus = window.prompt('Nouveau statut :', String(v.status || ''));
        if (!newStatus || newStatus === String(v.status || '')) return;
        try {
          await A.updateStatus(row, newStatus, resourceName);
          A.toast('Statut mis à jour', 'success');
          render();
        } catch (error) {
          A.toast(error.message || 'Mise à jour impossible', 'error');
        }
      });
      tableBody.appendChild(tr);
    }
  }

  async function load() {
    loading?.classList.remove('hidden');
    empty?.classList.add('hidden');
    try {
      const result = await A.loadResource(resourceName, { limit: 500 });
      if (integrationNote) {
        if (result.table) {
          integrationNote.textContent = `Données chargées depuis Supabase · table ${result.table}`;
          integrationNote.classList.remove('error');
        } else {
          integrationNote.textContent = 'Aucune table compatible trouvée. Vérifiez assets/js/admin-config.js.';
          integrationNote.classList.add('error');
        }
      }
      render();
    } catch (error) {
      if (integrationNote) {
        integrationNote.textContent = error.message || 'Chargement impossible';
        integrationNote.classList.add('error');
      }
      A.state.rows = [];
      render();
    } finally {
      loading?.classList.add('hidden');
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
  prevButton?.addEventListener('click', () => { A.state.page = Math.max(1, A.state.page - 1); render(); });
  nextButton?.addEventListener('click', () => { A.state.page += 1; render(); });
  document.querySelector('[data-resource-refresh]')?.addEventListener('click', load);
  document.querySelector('[data-export-page]')?.addEventListener('click', () => A.exportRows(A.state.filtered, `${page}-${new Date().toISOString().slice(0,10)}.csv`));

  document.addEventListener('DOMContentLoaded', load);
})();

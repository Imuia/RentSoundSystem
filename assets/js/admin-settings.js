(() => {
  'use strict';
  const A = window.RSSAdmin;
  if (!A) return;

  const pageSize = document.querySelector('#setting-page-size');
  const density = document.querySelector('#setting-density');
  const siteUrl = document.querySelector('#setting-site-url');
  const supportEmail = document.querySelector('#setting-support-email');
  const status = document.querySelector('[data-settings-supabase]');

  function loadPreferences() {
    try {
      const saved = JSON.parse(localStorage.getItem('rss_admin_preferences') || '{}');
      if (saved.pageSize) pageSize.value = String(saved.pageSize);
      if (saved.density) density.value = saved.density;
      if (saved.siteUrl) siteUrl.value = saved.siteUrl;
      if (saved.supportEmail) supportEmail.value = saved.supportEmail;
      document.documentElement.dataset.adminDensity = saved.density || 'comfortable';
    } catch (error) {
      console.warn('[RSS Admin] Préférences illisibles', error);
    }
  }

  function savePreferences() {
    const preferences = {
      pageSize: Number(pageSize.value || 12),
      density: density.value || 'comfortable',
      siteUrl: siteUrl.value.trim(),
      supportEmail: supportEmail.value.trim()
    };
    localStorage.setItem('rss_admin_preferences', JSON.stringify(preferences));
    document.documentElement.dataset.adminDensity = preferences.density;
    A.toast('Préférences enregistrées sur cet appareil', 'success');
  }

  async function testSources() {
    const client = A.getClient();
    if (!client) {
      status.textContent = 'Client Supabase non détecté. Vérifiez le chargement de votre configuration existante.';
      return A.toast('Supabase non détecté', 'error');
    }
    status.textContent = 'Client Supabase détecté. Test des tables en cours…';
    const tests = [];
    for (const [name, resource] of Object.entries(A.config.resources || {})) {
      const result = await A.tryTable(resource.tables, { limit: 1 });
      if (result.table) tests.push(`${name}: ${result.table}`);
    }
    status.textContent = tests.length ? `Connexion active · ${tests.length} source(s) compatible(s).` : 'Connexion active, mais aucune table configurée n’a répondu.';
    A.toast(tests.length ? 'Test terminé avec succès' : 'Tables à configurer', tests.length ? 'success' : 'error');
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadPreferences();
    status.textContent = A.getClient() ? 'Client Supabase détecté.' : 'Client Supabase non détecté.';
    document.querySelector('[data-save-settings]')?.addEventListener('click', savePreferences);
    document.querySelector('[data-test-sources]')?.addEventListener('click', testSources);
  });
})();

(() => {
  'use strict';
  const A = window.RSSAdmin;
  if (!A) return;

  const pageSize = document.querySelector('#setting-page-size');
  const density = document.querySelector('#setting-density');
  const siteUrl = document.querySelector('#setting-site-url');
  const supportEmail = document.querySelector('#setting-support-email');
  const status = document.querySelector('[data-settings-supabase]');
  const saveButton = document.querySelector('[data-save-settings]');
  const testButton = document.querySelector('[data-test-sources]');

  function apply(settings) {
    if (settings.pageSize) pageSize.value = String(settings.pageSize);
    if (settings.density) density.value = settings.density;
    if (settings.siteUrl) siteUrl.value = settings.siteUrl;
    if (settings.supportEmail) supportEmail.value = settings.supportEmail;
    document.documentElement.dataset.adminDensity = settings.density || 'comfortable';
  }

  async function loadSettings() {
    try {
      const settings = await A.getSettings();
      apply(settings);
      status.textContent = 'Paramètres partagés chargés depuis Supabase.';
    } catch (error) {
      console.warn('[RSS Admin] paramètres Supabase', error);
      try {
        const local = JSON.parse(localStorage.getItem('rss_admin_preferences') || '{}');
        apply(local);
      } catch {}
      status.textContent = 'Paramètres Supabase indisponibles : affichage des préférences locales.';
    }
  }

  async function savePreferences() {
    const settings = {
      pageSize: Math.max(5, Math.min(100, Number(pageSize.value || 20))),
      density: density.value || 'comfortable',
      siteUrl: siteUrl.value.trim(),
      supportEmail: supportEmail.value.trim()
    };
    saveButton.disabled = true;
    try {
      await A.saveSettings(settings);
      localStorage.setItem('rss_admin_preferences', JSON.stringify(settings));
      document.documentElement.dataset.adminDensity = settings.density;
      A.toast('Paramètres partagés enregistrés', 'success');
      status.textContent = 'Paramètres enregistrés dans Supabase.';
    } catch (error) {
      console.error(error);
      localStorage.setItem('rss_admin_preferences', JSON.stringify(settings));
      A.toast('Supabase indisponible : préférences enregistrées localement', 'error');
      status.textContent = `Échec Supabase : ${error.message || 'erreur inconnue'}`;
    } finally {
      saveButton.disabled = false;
    }
  }

  async function testSources() {
    testButton.disabled = true;
    status.textContent = 'Test des ressources administrateur en cours…';
    const names = Object.keys(A.config.resources || {});
    const results = await Promise.all(names.map(async name => {
      try {
        await A.listResource(name, { limit: 1 });
        return { name, ok: true };
      } catch (error) {
        return { name, ok: false, error };
      }
    }));
    const ok = results.filter(item => item.ok).length;
    const failed = results.filter(item => !item.ok);
    status.textContent = failed.length
      ? `${ok}/${results.length} ressources disponibles. Échecs : ${failed.map(item => item.name).join(', ')}.`
      : `${ok}/${results.length} ressources administrateur opérationnelles.`;
    A.toast(failed.length ? 'Certaines ressources nécessitent le SQL fourni' : 'Toutes les ressources répondent', failed.length ? 'error' : 'success');
    testButton.disabled = false;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (!await A.requireAdmin()) return;
    await loadSettings();
    saveButton?.addEventListener('click', savePreferences);
    testButton?.addEventListener('click', testSources);
  });
})();

/**
 * Adaptateur de connexion Supabase pour les nouvelles pages admin.
 * Aucune clé n'est incluse dans ce fichier.
 */
(() => {
  'use strict';
  if (window.rssSupabase && typeof window.rssSupabase.from === 'function') return;

  const candidates = [window.supabaseClient, window._supabase, window.db, window.supabaseDb];
  for (const candidate of candidates) {
    if (candidate && typeof candidate.from === 'function') {
      window.rssSupabase = candidate;
      return;
    }
  }

  const runtime = window.__ENV__ || window.RUNTIME_CONFIG || window.APP_CONFIG || {};
  const metaUrl = document.querySelector('meta[name="rss-supabase-url"]')?.content;
  const metaKey = document.querySelector('meta[name="rss-supabase-anon-key"]')?.content;
  const url = window.SUPABASE_URL || runtime.SUPABASE_URL || runtime.supabaseUrl || metaUrl;
  const anonKey = window.SUPABASE_ANON_KEY || runtime.SUPABASE_ANON_KEY || runtime.supabaseAnonKey || metaKey;

  if (url && anonKey && window.supabase?.createClient) {
    window.rssSupabase = window.supabase.createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
})();

/**
 * Adaptateur Supabase commun à toutes les pages d'administration.
 * Il réutilise le client déjà présent dans le site ou crée un client avec la clé publique.
 */
(() => {
  'use strict';
  if (window.rssSupabase && typeof window.rssSupabase.from === 'function') return;

  const config = window.RSS_ADMIN_CONFIG || {};
  const candidates = [
    window.supabaseClient,
    window._supabase,
    window.db,
    window.supabaseDb,
    window.rssSupabase
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate.from === 'function') {
      window.rssSupabase = candidate;
      return;
    }
  }

  const runtime = window.__ENV__ || window.RUNTIME_CONFIG || window.APP_CONFIG || {};
  const metaUrl = document.querySelector('meta[name="rss-supabase-url"]')?.content;
  const metaKey = document.querySelector('meta[name="rss-supabase-anon-key"]')?.content;
  const url = window.SUPABASE_URL || runtime.SUPABASE_URL || runtime.supabaseUrl || metaUrl || config.supabaseUrl;
  const anonKey = window.SUPABASE_ANON_KEY || runtime.SUPABASE_ANON_KEY || runtime.supabaseAnonKey || metaKey || config.supabaseAnonKey;

  if (url && anonKey && window.supabase?.createClient) {
    window.rssSupabase = window.supabase.createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
})();

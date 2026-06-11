
(function(){
  'use strict';

  const SUPABASE_URL = 'https://crxofkxinsspfgdsxpiy.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj';

  const STRIPE_PAYMENT_LINKS = {
    activation: '',      // TODO: coller ici le lien Stripe frais d'activation
    subscription: '',    // TODO: coller ici le lien Stripe abonnement partenaire
    commission: ''       // TODO: coller ici le lien Stripe configuration commission
  };

  const OFFICIAL_CATEGORIES = [
    'Deejay',
    'Event & production',
    'Furniture',
    'Headphone',
    'Keyboards',
    'Multimedia',
    'Sound & lighting',
    'String instruments',
    'Studio',
    'Wind instruments'
  ];

  let supabaseClient = null;

  function qs(sel, root){ return (root || document).querySelector(sel); }
  function qsa(sel, root){ return Array.from((root || document).querySelectorAll(sel)); }

  function text(el){
    return (el && el.textContent || '').replace(/\s+/g,' ').trim().toLowerCase();
  }

  function notify(message, type){
    let box = qs('#rss-partner-notice');
    if(!box){
      box = document.createElement('div');
      box.id = 'rss-partner-notice';
      box.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:99999;max-width:420px;padding:14px 16px;border-radius:12px;background:#1f1f1f;border:1px solid rgba(252,3,109,.35);color:#e2e2e2;box-shadow:0 10px 35px rgba(0,0,0,.35);font-family:Inter,sans-serif;font-size:14px;line-height:1.45;';
      document.body.appendChild(box);
    }
    box.innerHTML = message;
    box.style.borderColor = type === 'error' ? 'rgba(255,90,90,.55)' : 'rgba(252,3,109,.35)';
    setTimeout(function(){ if(box) box.remove(); }, 5200);
  }

  function initSupabase(){
    if(window.supabase && !supabaseClient){
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return supabaseClient;
  }

  function getState(){
    try { return JSON.parse(localStorage.getItem('rssPartnerOnboarding') || '{}'); }
    catch(e){ return {}; }
  }

  function setState(patch){
    const data = Object.assign({}, getState(), patch || {}, { updated_at: new Date().toISOString() });
    localStorage.setItem('rssPartnerOnboarding', JSON.stringify(data));
    return data;
  }

  function getInput(id){
    const el = qs('#' + id);
    return el ? (el.value || '').trim() : '';
  }

  function setInput(id, value){
    const el = qs('#' + id);
    if(el && value !== undefined && value !== null && !el.value) el.value = value;
  }

  function prefillForms(){
    const s = getState();
    setInput('fullName', s.full_name);
    setInput('email', s.email);
    setInput('company_name', s.company_name);
    setInput('reg_number', s.registration_number);
    setInput('vat_number', s.vat_number);
    setInput('address_1', s.address);
    setInput('city', s.city);
    setInput('postal_code', s.postal_code);
    setInput('country', s.country);
  }

  async function currentUser(){
    const sb = initSupabase();
    if(!sb) return null;
    try {
      const { data } = await sb.auth.getUser();
      return data && data.user ? data.user : null;
    } catch(e){ return null; }
  }

  async function saveStep1(){
    const fullName = getInput('fullName');
    const email = getInput('email');
    const password = getInput('password');
    if(!fullName || !email || !password){
      notify('Merci de compléter votre nom, email et mot de passe.', 'error');
      return false;
    }
    if(password.length < 8){
      notify('Le mot de passe doit contenir au moins 8 caractères.', 'error');
      return false;
    }

    setState({
      full_name: fullName,
      email: email,
      onboarding_step: 1,
      status: 'draft'
    });

    const sb = initSupabase();
    if(sb){
      try {
        const { error } = await sb.auth.signUp({
          email: email,
          password: password,
          options: { data: { full_name: fullName, role: 'partner' } }
        });
        if(error && !String(error.message || '').toLowerCase().includes('already')){
          console.warn('SignUp warning:', error.message);
        }
      } catch(e){ console.warn(e); }
    }
    location.href = '/partenaire-societe.html';
    return true;
  }

  async function saveStep2(){
    const patch = {
      company_name: getInput('company_name'),
      registration_number: getInput('reg_number'),
      vat_number: getInput('vat_number'),
      address: getInput('address_1'),
      city: getInput('city'),
      postal_code: getInput('postal_code'),
      country: getInput('country'),
      onboarding_step: 2
    };
    if(!patch.company_name || !patch.city || !patch.country){
      notify('Merci de compléter au minimum société, ville et pays.', 'error');
      return false;
    }
    setState(patch);
    location.href = '/partenaire-logistique.html';
    return true;
  }

  async function saveStep3(){
    const serviceAreas = qsa('input[type="checkbox"]:checked').map(function(el){
      return el.value || el.name || (el.closest('label') ? text(el.closest('label')) : 'option');
    });
    setState({
      equipment_types: serviceAreas,
      logistics_saved: true,
      onboarding_step: 3
    });
    location.href = '/partenaire-kyc.html';
    return true;
  }

  function collectKycDocuments(){
    return qsa('input[type="file"]').map(function(input){
      return Array.from(input.files || []).map(function(file){
        return { field: input.name || input.id || 'document', name: file.name, size: file.size, type: file.type };
      });
    }).flat();
  }

  async function submitPartnerRequest(){
    const s = setState({
      documents: collectKycDocuments(),
      status: 'pending',
      onboarding_step: 4,
      submitted_at: new Date().toISOString()
    });

    const sb = initSupabase();
    if(sb){
      try {
        const user = await currentUser();
        const payload = {
          user_id: user ? user.id : null,
          full_name: s.full_name || '',
          email: s.email || '',
          phone: s.phone || '',
          company_name: s.company_name || '',
          registration_number: s.registration_number || '',
          vat_number: s.vat_number || '',
          address: s.address || '',
          city: s.city || '',
          postal_code: s.postal_code || '',
          country: s.country || '',
          equipment_types: Array.isArray(s.equipment_types) ? s.equipment_types : [],
          documents: s.documents || [],
          status: 'pending',
          source: 'partner_onboarding'
        };
        const { error } = await sb.from('partner_requests').insert(payload);
        if(error) throw error;
      } catch(e){
        console.warn('Supabase partner request not saved:', e);
        notify('Le dossier est sauvegardé localement, mais Supabase n’a pas répondu. Vérifiez la table partner_requests et les policies.', 'error');
        // On continue pour ne pas bloquer le tunnel.
      }
    }

    location.href = '/partenaire-succes.html';
  }

  async function loginPartner(){
    const email = getInput('login-email');
    const password = getInput('login-password');
    const msg = qs('#rss-login-message');
    if(!email || !password){
      if(msg) msg.textContent = 'Merci de saisir votre email et votre mot de passe.';
      return;
    }

    const sb = initSupabase();
    if(sb){
      try {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if(error) throw error;
        setState({ email: email, logged_in: true });
        routeDashboard();
        return;
      } catch(e){
        console.warn(e);
        if(msg) msg.textContent = 'Connexion impossible. Vérifiez vos identifiants ou confirmez votre email.';
        return;
      }
    }

    setState({ email: email, logged_in: true });
    routeDashboard();
  }

  async function getPartnerStatus(){
    const s = getState();
    const sb = initSupabase();
    if(sb){
      try{
        const user = await currentUser();
        let query = sb.from('partner_requests').select('*').order('created_at', { ascending:false }).limit(1);
        if(user) query = query.eq('user_id', user.id);
        else if(s.email) query = query.eq('email', s.email);
        const { data, error } = await query;
        if(!error && data && data.length){
          setState({
            status: data[0].status || 'pending',
            partner_request_id: data[0].id,
            company_name: data[0].company_name || s.company_name,
            city: data[0].city || s.city,
            country: data[0].country || s.country
          });
          return data[0].status || 'pending';
        }
      } catch(e){ console.warn(e); }
    }
    return s.status || 'pending';
  }

  async function routeDashboard(){
    const status = await getPartnerStatus();
    if(status === 'approved'){
      location.href = '/tableau-de-bord-partenaire.html';
    } else if(status === 'rejected'){
      location.href = '/partenaire-en-attente.html';
    } else {
      location.href = '/tableau-de-bord-partenaire-validation.html';
    }
  }

  async function saveListing(){
    const title = getInput('listing-title');
    const category = getInput('listing-category');
    const city = getInput('listing-city');
    if(!title || !category || !city){
      const msg = qs('#rss-listing-message');
      if(msg) msg.textContent = 'Merci de compléter titre, catégorie et ville.';
      return;
    }

    const status = await getPartnerStatus();
    const listingStatus = status === 'approved' ? 'pending_review' : 'partner_pending';

    const payload = {
      title: title,
      category: category,
      brand: getInput('listing-brand'),
      price: Number(getInput('listing-price') || 0),
      city: city,
      description: getInput('listing-description'),
      status: listingStatus,
      source: 'partner_dashboard',
      created_at: new Date().toISOString()
    };

    const localListings = JSON.parse(localStorage.getItem('rssPartnerListings') || '[]');
    localListings.unshift(payload);
    localStorage.setItem('rssPartnerListings', JSON.stringify(localListings));

    const sb = initSupabase();
    if(sb){
      try {
        const user = await currentUser();
        const { error } = await sb.from('partner_listings').insert(Object.assign({}, payload, { user_id: user ? user.id : null }));
        if(error) throw error;
      } catch(e){
        console.warn(e);
      }
    }

    const msg = qs('#rss-listing-message');
    if(msg) msg.textContent = status === 'approved'
      ? 'Annonce enregistrée. Elle part en vérification avant publication.'
      : 'Annonce enregistrée en brouillon. Elle sera activable après validation partenaire.';
    notify('Annonce enregistrée avec succès.');
  }

  function setupDashboardData(){
    const s = getState();
    const name = s.full_name || s.company_name || 'Partenaire';
    // Replace common placeholder texts without changing design.
    qsa('h1,h2,p,span,div').forEach(function(el){
      if(el.childElementCount) return;
      if((el.textContent || '').includes('DJ Vertex')) el.textContent = el.textContent.replace('DJ Vertex', name);
    });
  }

  function setupPayment(){
    qsa('.rss-pay-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        const plan = btn.getAttribute('data-stripe-plan');
        const url = STRIPE_PAYMENT_LINKS[plan];
        if(url){
          window.location.href = url;
        } else {
          qs('#rss-payment-message').innerHTML = 'Lien Stripe non configuré pour ce choix. Ajoutez votre Payment Link dans <strong>partner-sync.js</strong>.';
          notify('Lien Stripe à configurer dans partner-sync.js.', 'error');
        }
      });
    });
  }

  function enhanceNavigation(){
    // update obvious anchor hrefs
    qsa('a').forEach(function(a){
      const t = text(a);
      if(t.includes('se connecter')) a.href = '/connexion-partenaire.html';
      if(t.includes('accueil')) a.href = '/';
      if(t.includes('équipement') || t.includes('equipement')) a.href = '/catalog.html';
      if(t.includes('devenir partenaire')) a.href = '/devenir-partenaire.html';
      if(t.includes('tableau de bord') || t.includes('overview')) a.href = '/tableau-de-bord-partenaire.html';
      if(t.includes('inventaire')) a.href = '/ajouter-annonce.html';
      if(t.includes('revenus') || t.includes('payments') || t.includes('paiements')) a.href = '/partenaire-paiement.html';
      if(t.includes('optimisation ia')) a.href = '/partenaire-optimisation-ia.html';
      if(t.includes('analytics') || t.includes('performance')) a.href = '/partenaire-analytics.html';
      if(t.includes('disputes') || t.includes('litige')) a.href = '/partenaire-litige.html';
      if(t.includes('support') || t.includes('aide')) a.href = '/contact.html';
      if(t.includes('logout') || t.includes('déconnexion')) a.addEventListener('click', logout);
    });

    document.addEventListener('click', async function(e){
      const target = e.target.closest('button,a');
      if(!target) return;
      const t = text(target);

      if(t.includes("continuer vers l'étape 2")){
        e.preventDefault(); await saveStep1(); return;
      }
      if(t === 'continuer'){
        e.preventDefault(); await saveStep2(); return;
      }
      if(t.includes('enregistrer et continuer')){
        e.preventDefault(); await saveStep3(); return;
      }
      if(t.includes('soumettre mon dossier')){
        e.preventDefault(); await submitPartnerRequest(); return;
      }
      if(t.includes('accéder à mon tableau de bord') || t.includes('accéder à mon espace')){
        e.preventDefault(); await routeDashboard(); return;
      }
      if(t.includes('ajouter du matériel') || t.includes('new listing') || t.includes('add')){
        e.preventDefault(); location.href = '/ajouter-annonce.html'; return;
      }
      if(t.includes('generate report')){
        e.preventDefault(); notify('Rapport en préparation. Fonction connectable à Supabase/Stripe ensuite.'); return;
      }
      if(t.includes('clôturer dossier')){
        e.preventDefault(); notify('Dossier marqué comme clôturé localement.'); return;
      }
      if(t.includes('contacter admin') || t.includes('contacter le support') || t.includes('contact manager')){
        e.preventDefault(); location.href = '/contact.html'; return;
      }
    });
  }

  async function logout(e){
    if(e) e.preventDefault();
    const sb = initSupabase();
    if(sb){
      try { await sb.auth.signOut(); } catch(err){}
    }
    setState({ logged_in:false });
    location.href = '/connexion-partenaire.html';
  }

  function setupForms(){
    const loginForm = qs('#rss-login-form');
    if(loginForm){
      loginForm.addEventListener('submit', function(e){ e.preventDefault(); loginPartner(); });
    }

    const listingForm = qs('#rss-listing-form');
    if(listingForm){
      listingForm.addEventListener('submit', function(e){ e.preventDefault(); saveListing(); });
    }

    qsa('form').forEach(function(form){
      if(form.id === 'rss-login-form' || form.id === 'rss-listing-form') return;
      form.addEventListener('submit', function(e){
        e.preventDefault();
        const page = window.RSS_PARTNER_PAGE || '';
        if(page.includes('inscription')) saveStep1();
        else if(page.includes('societe')) saveStep2();
        else if(page.includes('logistique')) saveStep3();
      });
    });
  }

  function setupGuard(){
    const page = window.RSS_PARTNER_PAGE || location.pathname;
    const state = getState();
    const protectedPages = ['tableau-de-bord-partenaire.html','partenaire-optimisation-ia.html','partenaire-analytics.html','partenaire-litige.html','ajouter-annonce.html','partenaire-paiement.html'];
    const isProtected = protectedPages.some(function(p){ return page.includes(p); });
    if(isProtected && !state.email && !state.logged_in){
      // Soft guard: do not break preview, but inform and redirect after delay.
      notify('Connectez-vous pour accéder à l’espace partenaire.', 'error');
      setTimeout(function(){ location.href = '/connexion-partenaire.html'; }, 1400);
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    initSupabase();
    prefillForms();
    setupForms();
    enhanceNavigation();
    setupDashboardData();
    setupPayment();
    setupGuard();

    // Useful for debugging tests in console.
    window.RSSPartner = {
      getState,
      setState,
      routeDashboard,
      saveStep1,
      saveStep2,
      saveStep3,
      submitPartnerRequest,
      OFFICIAL_CATEGORIES
    };
  });
})();

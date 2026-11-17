(() => {
  'use strict';
  const CFG = window.RSS_ADMIN_CONFIG || {};
  const TABLE = 'crm_workflow_cases';
  const STEPS = [
    'Nouveau lead','Qualification','Vérif. société','Demande partenaire','Réception devis',
    'Envoi devis','Signature','Paiement & caution','Logistique','Livraison','Retour & inspection','Clôture'
  ];
  const PAGES = [
    null,
    'admin-crm-etape-1-qualification.html','admin-crm-etape-2-verification.html',
    'admin-crm-etape-3-demande-prix.html','admin-crm-etape-4-controle-offre.html',
    'admin-crm-etape-5-devis.html','admin-crm-etape-6-signature.html',
    'admin-crm-etape-7-paiement-caution.html','admin-crm-etape-8-logistique.html',
    'admin-crm-etape-9-suivi-livraison.html','admin-crm-etape-10-retour-inspection.html',
    'admin-crm-cloture-caution.html'
  ];
  const $ = (s, r=document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const page = location.pathname.split('/').pop() || 'admin-crm-workflow.html';
  const stagePage = PAGES.indexOf(page);
  let db, cases=[], quotes=[], active=null, busy=false;

  function client() {
    if (window.rssSupabase?.from) return window.rssSupabase;
    if (window.supabaseClient?.from) return window.supabaseClient;
    if (window.supabase?.from) return window.supabase;
    return null;
  }
  function toast(msg, bad=false) {
    let el=$('#rss-crm-toast');
    if(!el){el=document.createElement('div');el.id='rss-crm-toast';document.body.append(el);}
    el.textContent=msg; el.style.cssText='position:fixed;right:22px;bottom:22px;z-index:99999;padding:13px 18px;border-radius:10px;background:'+(bad?'#7f1d1d':'#064e3b')+';color:white;box-shadow:0 8px 30px #0008;font:600 14px Inter,sans-serif;max-width: min(440px,90vw)';
    clearTimeout(el._timer); el._timer=setTimeout(()=>el.remove(),4500);
  }
  function getId(){return new URLSearchParams(location.search).get('case') || new URLSearchParams(location.search).get('id');}
  function currentStage(c){return Math.max(0,Math.min(11,Number(c?.stage||0)));}
  function caseLabel(c){return c?.reference || c?.client_name || c?.client_email || `Dossier ${String(c?.id||'').slice(0,8)}`;}
  function injectStyle(){
    if($('#rss-crm-style')) return;
    const st=document.createElement('style'); st.id='rss-crm-style'; st.textContent=`
      #rss-crm-app{margin:18px 0 28px;padding:20px;border:1px solid rgba(255,77,128,.35);border-radius:14px;background:linear-gradient(135deg,#1c1017,#131313);color:#f5e7eb;font:14px Inter,Arial,sans-serif}
      #rss-crm-app *{box-sizing:border-box} #rss-crm-app button,#rss-crm-app select,#rss-crm-app textarea{font:inherit}
      #rss-crm-app .crm-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      #rss-crm-app .crm-btn{border:1px solid #704052;border-radius:8px;padding:9px 13px;background:#29131e;color:#ffe8ef;cursor:pointer}
      #rss-crm-app .crm-btn.primary{background:#f50068;border-color:#f50068;color:white;font-weight:700}
      #rss-crm-app .crm-btn:disabled{opacity:.5;cursor:wait}
      #rss-crm-app select,#rss-crm-app textarea{background:#171217;color:#fff;border:1px solid #704052;border-radius:8px;padding:10px;max-width:100%}
      #rss-crm-app select{min-width:min(320px,100%)} #rss-crm-app textarea{width:100%;min-height:90px}
      #rss-crm-app .crm-muted{color:#c99eae} #rss-crm-app .crm-card{background:#190f15;border:1px solid #4c2635;border-radius:10px;padding:14px}
      #rss-crm-app .crm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:14px 0}
      #rss-crm-app .crm-stage{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0}
      #rss-crm-app .crm-stage span{padding:7px 9px;border-radius:7px;background:#282027;color:#bd9eaa;font-size:12px}
      #rss-crm-app .crm-stage span.on{background:#f50068;color:white}
      #rss-crm-app table{width:100%;border-collapse:collapse;margin-top:12px} #rss-crm-app th,#rss-crm-app td{text-align:left;padding:10px;border-bottom:1px solid #4c2635;vertical-align:top}
      #rss-crm-app th{color:#ff9bbd;font-size:12px;text-transform:uppercase} #rss-crm-app .crm-small{font-size:12px}
      @media(max-width:700px){#rss-crm-app{padding:13px}#rss-crm-app table{display:block;overflow:auto;white-space:nowrap}}
    `; document.head.append(st);
  }
  function shell(){
    if($('#rss-crm-app')) return $('#rss-crm-app');
    injectStyle();
    const main=$('main.admin-main')||$('main')||document.body;
    const app=document.createElement('section'); app.id='rss-crm-app';
    app.innerHTML=`<div class="crm-row" style="justify-content:space-between"><div><div style="font-weight:800;font-size:20px">CRM opérationnel</div><div class="crm-muted crm-small">Dossiers réels issus des demandes de devis · suivi sauvegardé dans Supabase</div></div><div class="crm-row"><button class="crm-btn" data-crm-refresh>↻ Actualiser</button><button class="crm-btn" data-crm-new>＋ Synchroniser les demandes</button></div></div><div data-crm-content style="margin-top:14px">Connexion à Supabase…</div>`;
    const anchor=$('.admin-topbar',main)||$('header',main);
    if(anchor?.nextSibling) main.insertBefore(app,anchor.nextSibling); else main.prepend(app);
    if(page==='admin-crm-workflow.html'){
      for(let n=app.nextElementSibling;n;n=n.nextElementSibling){ if(n.tagName!=='SCRIPT') n.hidden=true; }
    }
    app.addEventListener('click',handleClick);
    app.addEventListener('change',handleChange);
    return app;
  }
  function render(){
    const root=shell(), content=$('[data-crm-content]',root);
    const selected=active || (getId() && cases.find(c=>c.id===getId())) || cases[0] || null;
    if(selected) active=selected;
    if(page==='admin-crm-workflow.html'){
      content.innerHTML=`
        <div class="crm-grid">
          <div class="crm-card"><div class="crm-muted crm-small">Dossiers CRM</div><div style="font-size:28px;font-weight:800">${cases.length}</div></div>
          <div class="crm-card"><div class="crm-muted crm-small">Demandes devis source</div><div style="font-size:28px;font-weight:800">${quotes.length}</div></div>
          <div class="crm-card"><div class="crm-muted crm-small">En cours</div><div style="font-size:28px;font-weight:800">${cases.filter(c=>c.stage<11).length}</div></div>
          <div class="crm-card"><div class="crm-muted crm-small">Litiges ouverts</div><div style="font-size:28px;font-weight:800">${cases.filter(c=>c.dispute_status==='open').length}</div></div>
        </div>
        <div class="crm-row"><label for="rss-case-select">Dossier sélectionné</label><select id="rss-case-select">${cases.map(c=>`<option value="${esc(c.id)}" ${selected?.id===c.id?'selected':''}>${esc(caseLabel(c))} · ${esc(c.client_email||'')} · ${esc(STEPS[currentStage(c)])}</option>`).join('')}</select></div>
        ${selected?caseDetails(selected):'<div class="crm-card">Aucun dossier CRM. Cliquez sur « Synchroniser les demandes » pour importer les demandes de devis existantes.</div>'}
        <div class="crm-card" style="margin-top:14px"><strong>Tous les dossiers</strong><table><thead><tr><th>Client / Référence</th><th>Événement</th><th>Étape</th><th>Statut</th><th>Action</th></tr></thead><tbody>${cases.map(c=>`<tr><td><strong>${esc(caseLabel(c))}</strong><div class="crm-muted crm-small">${esc(c.client_email||'')}</div></td><td>${esc(c.event_city||'—')}<div class="crm-muted crm-small">${esc(c.event_date||'')}</div></td><td>${currentStage(c)+1}/12 · ${esc(STEPS[currentStage(c)])}</td><td>${esc(c.status||'open')}</td><td><button class="crm-btn" data-crm-open="${esc(c.id)}">Ouvrir</button></td></tr>`).join('')}</tbody></table></div>`;
    } else if(selected && page.startsWith('admin-crm-email-')){
      const subject=page.includes('litige')?'Information concernant votre dossier RentSoundSystem':page.includes('cloture')?'Clôture de votre location et de la caution':'Votre devis RentSoundSystem';
      const body=`Bonjour ${selected.client_name||''},\\n\\nNous revenons vers vous concernant votre demande ${selected.reference||''}.\\n\\nCordialement,\\nL’équipe RentSoundSystem`;
      content.innerHTML=`${caseDetails(selected)}<div class="crm-card" style="margin-top:14px"><strong>Préparer un email</strong><p class="crm-muted crm-small" style="margin:6px 0 12px">Le bouton ouvre votre logiciel de messagerie avec le destinataire et le brouillon. L’envoi réel n’est pas effectué par cette page.</p><label>Destinataire</label><input id="rss-mail-to" value="${esc(selected.client_email||'')}" style="display:block;width:100%;margin:6px 0 12px;background:#171217;color:white;border:1px solid #704052;border-radius:8px;padding:10px"><label>Objet</label><input id="rss-mail-subject" value="${esc(subject)}" style="display:block;width:100%;margin:6px 0 12px;background:#171217;color:white;border:1px solid #704052;border-radius:8px;padding:10px"><label>Message</label><textarea id="rss-mail-body" style="margin-top:6px">${esc(body)}</textarea><div class="crm-row" style="margin-top:10px"><button class="crm-btn primary" data-crm-mail>Ouvrir le brouillon email</button></div></div>`;
    } else if(selected){
      content.innerHTML=`<div class="crm-row" style="margin-bottom:12px"><label for="rss-case-select">Dossier actif</label><select id="rss-case-select">${cases.map(c=>`<option value="${esc(c.id)}" ${selected?.id===c.id?'selected':''}>${esc(caseLabel(c))} · ${esc(c.client_email||'')}</option>`).join('')}</select></div>${caseDetails(selected)}
        <div class="crm-card" style="margin-top:14px"><div style="font-weight:700;margin-bottom:8px">Compte rendu de l'étape</div><textarea id="rss-crm-note" placeholder="Notes, décision, informations à conserver…">${esc(selected.stage_data?.[String(Math.max(1,stagePage+1))]?.note||'')}</textarea><div class="crm-row" style="margin-top:10px"><button class="crm-btn" data-crm-save>Enregistrer les notes</button><button class="crm-btn primary" data-crm-next>${page==='admin-crm-litige.html'?'Enregistrer le litige':stagePage===11?'Clôturer le dossier':'Valider et passer à l’étape suivante'} →</button>${stagePage>=0?`<button class="crm-btn" data-crm-prev>← Étape précédente</button>`:''}</div></div>
        <div class="crm-muted crm-small" style="margin-top:10px">Les champs du formulaire de maquette sont conservés dans le dossier à l'enregistrement. Les opérations de paiement, signature électronique et envoi d'email nécessitent leurs intégrations serveur dédiées.</div>`;
    } else {
      content.innerHTML='<div class="crm-card">Aucun dossier chargé. Synchronisez les demandes depuis la page Workflow.</div>';
    }
  }
  function caseDetails(c){
    const st=currentStage(c);
    return `<div class="crm-card" style="margin-top:14px"><div class="crm-row" style="justify-content:space-between"><div><div class="crm-muted crm-small">DOSSIER CRM · ${esc(c.reference||String(c.id).slice(0,8))}</div><h2 style="font-size:22px;font-weight:800;margin:5px 0">${esc(c.client_name||c.client_email||'Client sans nom')}</h2><div class="crm-muted">${esc(c.client_email||'—')} · ${esc(c.client_phone||'—')}</div></div><div class="crm-row"><span class="crm-btn">Étape ${st+1}/12</span><span class="crm-btn">${esc(c.status||'open')}</span></div></div>
    <div class="crm-grid"><div><div class="crm-muted crm-small">Événement</div><strong>${esc(c.event_type||'—')}</strong></div><div><div class="crm-muted crm-small">Date</div><strong>${esc(c.event_date||'—')}</strong></div><div><div class="crm-muted crm-small">Ville</div><strong>${esc(c.event_city||'—')}</strong></div><div><div class="crm-muted crm-small">Matériel / quantité</div><strong>${esc(c.equipment||'—')} · ${esc(c.quantity??'—')}</strong></div></div>
    <div class="crm-stage">${STEPS.map((s,i)=>`<span class="${i===st?'on':''}">${i+1}. ${esc(s)}</span>`).join('')}</div>
    <div class="crm-row"><button class="crm-btn primary" data-crm-open="${esc(c.id)}">Ouvrir ce dossier</button><button class="crm-btn" data-crm-goto="${esc(c.id)}">Accéder à l'étape active</button>${c.source_quote_id?`<span class="crm-muted crm-small">Demande source : ${esc(c.source_quote_id)}</span>`:''}</div></div>`;
  }
  async function syncQuotes(){
    const {data,error}=await db.from('quote_requests').select('*').order('created_at',{ascending:false}).limit(500);
    if(error) throw error;
    quotes=data||[];
    for(const q of quotes){
      const sourceId=String(q.id);
      if(cases.some(c=>String(c.source_quote_id)===sourceId)) continue;
      const payload={
        source_quote_id:q.id, reference:q.services?.quote_reference || `RSS-${String(q.id).slice(0,8).toUpperCase()}`,
        client_name:q.full_name||q.company_name||q.email,client_email:q.email,client_phone:q.phone,
        event_type:q.event_type,event_city:q.event_city,event_date:q.event_date,
        return_date:q.return_date,equipment:q.equipment,quantity:q.quantity,
        source_status:q.status||'new',status:'open',stage:0,stage_data:{},
        source_snapshot:q,updated_at:new Date().toISOString()
      };
      const {error:upErr}=await db.from(TABLE).upsert(payload,{onConflict:'source_quote_id',ignoreDuplicates:true});
      if(upErr) throw upErr;
    }
    await loadCases();
  }
  async function loadCases(){
    const {data,error}=await db.from(TABLE).select('*').order('updated_at',{ascending:false}).limit(1000);
    if(error) throw error;
    cases=data||[];
    const id=getId();
    active=(id&&cases.find(c=>String(c.id)===id)) || active && cases.find(c=>c.id===active.id) || cases[0] || null;
    render();
  }
  function serializeForm(){
    const values={};
    document.querySelectorAll('main input,main select,main textarea').forEach((el,i)=>{
      if(el.closest('#rss-crm-app') || el.type==='button' || el.type==='submit' || el.type==='password' || !el.value) return;
      const key=el.name||el.id||`field_${i}`;
      values[key]=el.type==='checkbox'?el.checked:el.value;
    });
    return values;
  }
  async function save(nextStage=null){
    if(!active) throw new Error('Sélectionnez un dossier avant d’enregistrer.');
    const note=$('#rss-crm-note')?.value?.trim()||'';
    const stage=Math.max(0,Math.min(11,nextStage===null?currentStage(active):nextStage));
    const stageData={...(active.stage_data||{})};
    const key=String(Math.max(1,stagePage));
    stageData[key]={...(stageData[key]||{}),note,form:serializeForm(),saved_at:new Date().toISOString()};
    const patch={stage,stage_data:stageData,updated_at:new Date().toISOString(),status:stage===11?'closed':'open'};
    if(page==='admin-crm-litige.html') patch.dispute_status='open';
    const {data,error}=await db.from(TABLE).update(patch).eq('id',active.id).select('*').single();
    if(error) throw error;
    active=data; cases=cases.map(c=>c.id===data.id?data:c); toast('Dossier enregistré dans Supabase.'); render();
  }
  function gotoStep(id, step){
    const target=step===null?Math.max(0,Math.min(10,Number(active?.stage||0))):step;
    const url=new URL(PAGES[target]||'admin-crm-workflow.html',location.origin);
    url.searchParams.set('case',id); location.href=url.pathname+url.search;
  }
  async function handleClick(e){
    const b=e.target.closest('button'); if(!b) return;
    try{
      if(b.hasAttribute('data-crm-refresh')){b.disabled=true;await loadCases();toast('Dossiers actualisés.');b.disabled=false;}
      if(b.hasAttribute('data-crm-new')){b.disabled=true;await syncQuotes();toast(`${quotes.length} demandes source synchronisées.`);b.disabled=false;}
      if(b.hasAttribute('data-crm-open')){const c=cases.find(x=>String(x.id)===b.dataset.crmOpen);if(c){active=c;render();}}
      if(b.hasAttribute('data-crm-goto')){const c=cases.find(x=>String(x.id)===b.dataset.crmGoto);if(c){active=c;gotoStep(c.id,null);}}
      if(b.hasAttribute('data-crm-save')) await save();
      if(b.hasAttribute('data-crm-next')) await save(page==='admin-crm-litige.html'?currentStage(active):Math.min(11,currentStage(active)+1));
      if(b.hasAttribute('data-crm-prev')) await save(Math.max(0,currentStage(active)-1));
      if(b.hasAttribute('data-crm-mail')){
        const to=$('#rss-mail-to')?.value||'', subject=$('#rss-mail-subject')?.value||'', body=$('#rss-mail-body')?.value||'';
        if(!to) throw new Error('Adresse email du client absente.');
        location.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      }
    }catch(err){console.error('[RSS CRM]',err);toast(err.message||'Erreur CRM',true);b.disabled=false;}
  }
  document.addEventListener('click', async (e) => {
    const b=e.target.closest('button');
    if(!b || b.closest('#rss-crm-app')) return;
    const label=(b.innerText||b.textContent||'').replace(/\\s+/g,' ').trim();
    const n=Number(label);
    if(label==='Workflow' || label==='CRM & Workflow'){
      e.preventDefault(); location.href='/admin-crm-workflow.html'; return;
    }
    if(stagePage>=0 && /^([1-9]|10)$/.test(label) && active){
      e.preventDefault(); gotoStep(active.id, n); return;
    }
    if(stagePage>=0 && /clôture/i.test(label) && active){
      e.preventDefault(); gotoStep(active.id,10); return;
    }
    if(stagePage>=0 && /(enregistrer|sauvegarder|brouillon)/i.test(label)){
      e.preventDefault(); try{await save();}catch(err){toast(err.message,true);} return;
    }
    if(stagePage>=0 && /(valider|continuer|étape suivante|confirmer)/i.test(label)){
      e.preventDefault(); try{await save(page==='admin-crm-litige.html'?currentStage(active):Math.min(11,currentStage(active)+1));}catch(err){toast(err.message,true);} return;
    }
  }, true);
  function handleChange(e){
    if(e.target.id==='rss-case-select'){
      active=cases.find(c=>String(c.id)===e.target.value)||null;
      if(active && stagePage>=0){const url=new URL(location.href);url.searchParams.set('case',active.id);history.replaceState({},'',url);}
      render();
    }
  }
  async function boot(){
    shell();
    db=client();
    if(!db){$('[data-crm-content]').textContent='Client Supabase introuvable. Vérifiez le chargement de admin-supabase-adapter.js.';return;}
    try{
      const {data:{user},error:authError}=await db.auth.getUser();
      if(authError) throw authError;
      if(!user) throw new Error('Session administrateur absente. Reconnectez-vous.');
      await loadCases();
      if(page==='admin-crm-workflow.html' && !cases.length){await syncQuotes();}
      if(stagePage>=0 && !getId() && active){const u=new URL(location.href);u.searchParams.set('case',active.id);history.replaceState({},'',u);}
    }catch(err){
      console.error('[RSS CRM boot]',err);
      $('[data-crm-content]').innerHTML=`<div class="crm-card"><strong>Connexion CRM impossible</strong><p class="crm-muted">${esc(err.message)}</p><p class="crm-small">Vérifiez que la migration SQL CRM a été exécutée et que les policies autorisent les administrateurs.</p></div>`;
    }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot,{once:true}); else boot();
})();
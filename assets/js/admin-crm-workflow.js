(() => {
'use strict';
if (window.__RSS_CRM_WORKFLOW_V2__) return;
window.__RSS_CRM_WORKFLOW_V2__ = true;

const TABLE = 'crm_workflow_cases';
const PAGES = {
  0: 'admin-crm-etape-1-qualification.html',
  1: 'admin-crm-etape-1-qualification.html',
  2: 'admin-crm-etape-2-verification.html',
  3: 'admin-crm-etape-3-demande-prix.html',
  4: 'admin-crm-etape-4-controle-offre.html',
  5: 'admin-crm-etape-5-devis.html',
  6: 'admin-crm-etape-6-signature.html',
  7: 'admin-crm-etape-7-paiement-caution.html',
  8: 'admin-crm-etape-8-logistique.html',
  9: 'admin-crm-etape-9-suivi-livraison.html',
  10: 'admin-crm-etape-10-retour-inspection.html',
  11: 'admin-crm-cloture-caution.html'
};
const LABELS = ['Nouveau lead','Qualification','Vérification','Demande de prix','Contrôle offre','Devis','Signature','Paiement & caution','Logistique','Livraison','Retour & inspection','Clôture'];
const $ = (s, r=document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const page = location.pathname.split('/').pop() || 'admin-crm-workflow.html';
const stagePage = Object.entries(PAGES).find(([k,v]) => v === page && Number(k)>0)?.[0];
let db = null, cases = [], quotes = [], active = null, busy = false;

function getClient() {
  const cfg = window.RSS_ADMIN_CONFIG || {};
  for (const key of (cfg.clientCandidates || ['rssSupabase','supabaseClient','_supabase','db','supabaseDb'])) {
    const c = window[key];
    if (c && typeof c.from === 'function') return c;
  }
  return window.rssSupabase?.from ? window.rssSupabase : null;
}
function toast(message, bad=false) {
  let el = $('#rss-crm-toast');
  if (!el) { el=document.createElement('div'); el.id='rss-crm-toast'; document.body.append(el); }
  el.textContent = message;
  el.style.cssText = `position:fixed;right:22px;bottom:22px;z-index:100000;padding:13px 18px;border-radius:10px;background:${bad?'#7f1d1d':'#064e3b'};color:white;box-shadow:0 8px 30px #0008;font:600 14px Inter,sans-serif;max-width:min(440px,90vw)`;
  clearTimeout(el._timer); el._timer=setTimeout(()=>el.remove(),5000);
}
function queryCaseId(){const p=new URLSearchParams(location.search);return p.get('case')||p.get('id');}
function stage(c){return Math.max(0,Math.min(11,Number(c?.stage||0)));}
function label(c){return c?.reference||c?.client_name||c?.client_email||`Dossier ${String(c?.id||'').slice(0,8)}`;}
function pageForStage(n){return PAGES[Math.max(0,Math.min(11,Number(n)||0))]||PAGES[0];}
function gotoStep(id,n=null){
  if(!id){toast('Sélectionnez un dossier dans le bloc CRM avant de continuer.',true);return;}
  const target=n===null?stage(active):Number(n);
  const dest=pageForStage(target);
  const u=new URL(dest,location.origin);u.searchParams.set('case',id);
  location.href=u.pathname+u.search;
}
function injectStyle(){
 if($('#rss-crm-style'))return;
 const st=document.createElement('style');st.id='rss-crm-style';st.textContent=`
 #rss-crm-app{margin:18px 0 28px;padding:18px;border:1px solid rgba(255,77,128,.35);border-radius:14px;background:linear-gradient(135deg,#1c1017,#131313);color:#f5e7eb;font:14px Inter,Arial,sans-serif;position:relative;z-index:3}
 #rss-crm-app *{box-sizing:border-box}#rss-crm-app button,#rss-crm-app select,#rss-crm-app textarea,#rss-crm-app input{font:inherit}
 #rss-crm-app .crm-row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
 #rss-crm-app .crm-btn{border:1px solid #704052;border-radius:8px;padding:9px 13px;background:#29131e;color:#ffe8ef;cursor:pointer}
 #rss-crm-app .crm-btn.primary{background:#f50068;border-color:#f50068;color:white;font-weight:700}
 #rss-crm-app .crm-btn:disabled{opacity:.5;cursor:wait}
 #rss-crm-app select,#rss-crm-app textarea,#rss-crm-app input{background:#171217;color:#fff;border:1px solid #704052;border-radius:8px;padding:10px;max-width:100%}
 #rss-crm-app select{min-width:min(300px,100%)}#rss-crm-app textarea{width:100%;min-height:80px}
 #rss-crm-app .crm-muted{color:#c99eae}#rss-crm-app .crm-card{background:#190f15;border:1px solid #4c2635;border-radius:10px;padding:13px}
 #rss-crm-app .crm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;margin:12px 0}
 #rss-crm-app .crm-stage{display:flex;gap:5px;flex-wrap:wrap;margin:12px 0}
 #rss-crm-app .crm-stage span{padding:6px 8px;border-radius:7px;background:#282027;color:#bd9eaa;font-size:11px}
 #rss-crm-app .crm-stage span.on{background:#f50068;color:white}
 #rss-crm-app table{width:100%;border-collapse:collapse;margin-top:10px}
 #rss-crm-app th,#rss-crm-app td{text-align:left;padding:8px;border-bottom:1px solid #4c2635;vertical-align:top}
 #rss-crm-app th{color:#ff9bbd;font-size:11px;text-transform:uppercase}
 @media(max-width:700px){#rss-crm-app{padding:12px}#rss-crm-app table{display:block;overflow:auto;white-space:nowrap}}
 `;
 document.head.append(st);
}
function shell(){
 let app=$('#rss-crm-app');if(app)return app;
 injectStyle();
 app=document.createElement('section');app.id='rss-crm-app';
 app.innerHTML=`<div class="crm-row" style="justify-content:space-between"><div><strong style="font-size:19px">Dossier CRM actif</strong><div class="crm-muted" style="font-size:12px">Choisissez le dossier à traiter. Les boutons de la page enregistrent les informations dans ce dossier.</div></div><div class="crm-row"><button type="button" class="crm-btn" data-crm-refresh>Actualiser</button><button type="button" class="crm-btn primary" data-crm-sync>Importer les demandes de devis</button></div></div><div data-crm-content style="margin-top:12px">Connexion à Supabase…</div>`;
 const main=$('main.admin-main')||$('main')||document.body;
 const anchor=$('.admin-topbar',main)||$('header',main);
 if(anchor?.nextSibling)main.insertBefore(app,anchor.nextSibling);else main.prepend(app);
 app.addEventListener('click',handleAppClick);
 app.addEventListener('change',handleAppChange);
 if(page==='admin-crm-workflow.html'){
   // Keep the supplied dashboard visual hidden behind the functional CRM dashboard.
   for(let n=app.nextElementSibling;n;n=n.nextElementSibling){if(n.tagName!=='SCRIPT'&&n.id!=='rss-crm-app')n.hidden=true;}
 }
 return app;
}
function details(c){
 const s=stage(c);
 return `<div class="crm-card"><div class="crm-row" style="justify-content:space-between"><div><div class="crm-muted" style="font-size:11px">DOSSIER ${esc(c.reference||String(c.id).slice(0,8))}</div><strong style="font-size:20px">${esc(c.client_name||'Client')}</strong><div class="crm-muted">${esc(c.client_email||'—')} · ${esc(c.client_phone||'—')}</div></div><span class="crm-btn">Étape ${s+1}/12</span></div><div class="crm-grid"><div>Événement<br><strong>${esc(c.event_type||'—')}</strong></div><div>Date<br><strong>${esc(c.event_date||'—')}</strong></div><div>Ville<br><strong>${esc(c.event_city||'—')}</strong></div><div>Matériel<br><strong>${esc(c.equipment||'—')}</strong></div></div><div class="crm-stage">${LABELS.map((x,i)=>`<span class="${i===s?'on':''}">${i+1}. ${esc(x)}</span>`).join('')}</div></div>`;
}
function render(){
 const root=shell(), content=$('[data-crm-content]',root);
 const selected=active||cases.find(c=>String(c.id)===queryCaseId())||cases[0]||null;
 if(selected)active=selected;
 if(page==='admin-crm-workflow.html'){
  content.innerHTML=`<div class="crm-grid"><div class="crm-card">Dossiers CRM<strong style="display:block;font-size:25px">${cases.length}</strong></div><div class="crm-card">Demandes source<strong style="display:block;font-size:25px">${quotes.length}</strong></div><div class="crm-card">En cours<strong style="display:block;font-size:25px">${cases.filter(c=>c.status!=='closed').length}</strong></div><div class="crm-card">Litiges ouverts<strong style="display:block;font-size:25px">${cases.filter(c=>c.dispute_status==='open').length}</strong></div></div>
  <div class="crm-row"><label for="rss-case-select">Dossier</label><select id="rss-case-select"><option value="">— Choisir un dossier —</option>${cases.map(c=>`<option value="${esc(c.id)}" ${selected?.id===c.id?'selected':''}>${esc(label(c))} · ${esc(c.client_email||'')} · ${esc(LABELS[stage(c)])}</option>`).join('')}</select><button class="crm-btn primary" data-crm-open-stage>Ouvrir l'étape active</button></div>
  ${selected?details(selected):'<div class="crm-card" style="margin-top:12px">Aucun dossier. Cliquez sur « Importer les demandes de devis ».</div>'}
  <div class="crm-card" style="margin-top:12px"><strong>Tous les dossiers</strong><table><thead><tr><th>Client</th><th>Événement</th><th>Étape</th><th>Statut</th><th></th></tr></thead><tbody>${cases.map(c=>`<tr><td>${esc(label(c))}<br><span class="crm-muted">${esc(c.client_email||'')}</span></td><td>${esc(c.event_city||'—')}<br>${esc(c.event_date||'')}</td><td>${stage(c)+1}/12 · ${esc(LABELS[stage(c)])}</td><td>${esc(c.status||'open')}</td><td><button class="crm-btn" data-crm-select="${esc(c.id)}">Sélectionner</button></td></tr>`).join('')}</tbody></table></div>`;
 }else if(selected){
  const n=Number(stagePage||stage(selected));
  const note=selected.stage_data?.[String(n)]?.note||'';
  content.innerHTML=`${details(selected)}<div class="crm-card" style="margin-top:12px"><label for="rss-crm-note"><strong>Notes internes de cette étape</strong></label><textarea id="rss-crm-note" placeholder="Saisir les informations à conserver…">${esc(note)}</textarea><div class="crm-row" style="margin-top:9px"><button class="crm-btn" data-crm-save>Enregistrer les notes</button><button class="crm-btn primary" data-crm-next>Valider et passer à l'étape suivante →</button><button class="crm-btn" data-crm-prev>← Étape précédente</button></div><p class="crm-muted" style="font-size:11px;margin-top:8px">Les actions de paiement, signature, SMS et email restent des actions manuelles ou nécessitent un service externe ; ce CRM enregistre leur suivi, pas une transaction réelle.</p></div>`;
 }else{
  content.innerHTML='<div class="crm-card">Aucun dossier CRM disponible. Revenez au Workflow et importez les demandes.</div>';
 }
}
function formKey(el,i){
 return el.dataset.crmField||el.name||el.id||el.getAttribute('aria-label')||el.getAttribute('placeholder')||`${el.tagName.toLowerCase()}_${i}`;
}
function serializeForm(){
 const out={};
 const els=[...document.querySelectorAll('main input,main select,main textarea')].filter(el=>!el.closest('#rss-crm-app')&&!['button','submit','password','file'].includes(el.type));
 els.forEach((el,i)=>{
  const key=formKey(el,i);
  if(el.type==='checkbox')out[key]={type:'checkbox',checked:el.checked,value:el.value};
  else if(el.type==='radio'){if(el.checked)out[key]={type:'radio',checked:true,value:el.value};}
  else out[key]={type:el.type||el.tagName.toLowerCase(),value:el.value};
 });
 return out;
}
function restoreForm(){
 if(!active)return;
 const saved=active.stage_data?.[String(Number(stagePage||stage(active)))]?.form||{};
 const els=[...document.querySelectorAll('main input,main select,main textarea')].filter(el=>!el.closest('#rss-crm-app'));
 els.forEach((el,i)=>{
  const v=saved[formKey(el,i)];if(!v)return;
  if(el.type==='checkbox')el.checked=!!v.checked;
  else if(el.type==='radio')el.checked=el.value===v.value;
  else if(v.value!==undefined)el.value=v.value;
 });
}
async function loadCases(){
 const {data,error}=await db.from(TABLE).select('*').order('updated_at',{ascending:false}).limit(1000);
 if(error)throw error;
 cases=data||[];
 const id=queryCaseId();
 active=(id&&cases.find(c=>String(c.id)===id))|| (active&&cases.find(c=>String(c.id)===String(active.id)))||cases[0]||null;
 render();restoreForm();
}
async function syncQuotes(){
 const {data,error}=await db.from('quote_requests').select('*').order('created_at',{ascending:false}).limit(500);
 if(error)throw error;quotes=data||[];
 for(const q of quotes){
  const payload={
   source_quote_id:String(q.id),
   reference:q.services?.quote_reference||`RSS-${String(q.id).slice(0,8).toUpperCase()}`,
   client_name:q.full_name||q.company_name||q.email||'Client',
   client_email:q.email||null,client_phone:q.phone||null,
   event_type:q.event_type||null,event_city:q.event_city||null,event_date:q.event_date||null,
   return_date:q.return_date||null,equipment:q.equipment||null,quantity:q.quantity||null,
   source_status:q.status||'new',status:'open',stage:0,stage_data:{},source_snapshot:q,
   updated_at:new Date().toISOString()
  };
  const {error:upErr}=await db.from(TABLE).upsert(payload,{onConflict:'source_quote_id',ignoreDuplicates:true});
  if(upErr)throw upErr;
 }
 await loadCases();
}
async function save(next=null,extra={}){
 if(busy)return; if(!active)throw new Error('Aucun dossier sélectionné. Ouvrez d’abord le Workflow et choisissez un dossier.');
 busy=true;
 try{
  const n=Number(stagePage||stage(active));
  const stageData={...(active.stage_data||{})};
  const previous=stageData[String(n)]||{};
  stageData[String(n)]={...previous,note:$('#rss-crm-note')?.value?.trim()||previous.note||'',form:serializeForm(),saved_at:new Date().toISOString(),...extra};
  const newStage=next===null?stage(active):Math.max(0,Math.min(11,Number(next)));
  const patch={stage:newStage,stage_data:stageData,updated_at:new Date().toISOString(),status:newStage===11?'closed':'open'};
  if(extra.dispute_status)patch.dispute_status=extra.dispute_status;
  const {data,error}=await db.from(TABLE).update(patch).eq('id',active.id).select('*').single();
  if(error)throw error;
  active=data;cases=cases.map(c=>String(c.id)===String(data.id)?data:c);
  toast('Enregistré dans le dossier CRM.');render();restoreForm();
 }finally{busy=false;}
}
function openMail(subject,body=''){
 const to=active?.client_email||'';
 if(!to){toast('Adresse email du client absente dans ce dossier.',true);return;}
 location.href=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function printPage(){window.print();}
function handleAppClick(e){
 const b=e.target.closest('button');if(!b)return;
 (async()=>{
  try{
   if(b.hasAttribute('data-crm-refresh'))await loadCases();
   else if(b.hasAttribute('data-crm-sync'))await syncQuotes();
   else if(b.hasAttribute('data-crm-select')){active=cases.find(c=>String(c.id)===b.dataset.crmSelect)||null;render();}
   else if(b.hasAttribute('data-crm-open-stage'))gotoStep(active?.id);
   else if(b.hasAttribute('data-crm-save'))await save();
   else if(b.hasAttribute('data-crm-next'))await save(Math.min(11,stage(active)+1));
   else if(b.hasAttribute('data-crm-prev'))await save(Math.max(0,stage(active)-1));
  }catch(err){console.error('[RSS CRM]',err);toast(err.message||'Erreur CRM',true);}
 })();
}
function handleAppChange(e){if(e.target.id==='rss-case-select'){active=cases.find(c=>String(c.id)===e.target.value)||null;render();}}
function setStatus(button,value){
 const group=button.parentElement;
 group?.querySelectorAll('button').forEach(b=>b.classList.remove('active','ring-2','ring-pink-400'));
 button.classList.add('active','ring-2','ring-pink-400');
 button.dataset.crmStatus=value;
}
window.setStatus=setStatus;

function bindMockupButtons(){
 document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b||b.closest('#rss-crm-app'))return;
  const raw=(b.innerText||b.textContent||'').replace(/\s+/g,' ').trim();
  const t=raw.toLowerCase();
  const go=async(next,extra={})=>{e.preventDefault();e.stopImmediatePropagation();await save(next,extra);};
  try{
   // Keep the original page design, but connect its visible action buttons to CRM storage.
   if(page==='admin-crm-etape-1-qualification.html' && /valider.*qualification/.test(t)){await go(2);}
   else if(page==='admin-crm-etape-2-verification.html' && /valider|terminer|continuer/.test(t)){await go(3);}
   else if(page==='admin-crm-etape-3-demande-prix.html'){
    if(/enregistrer brouillon/.test(t)){await go(null);}
    else if(/valider cotation|continuer/.test(t)){await go(4);}
    else if(/envoyer demande groupée|relancer/.test(t)){e.preventDefault();e.stopImmediatePropagation();openMail('Demande de prix partenaire',`Bonjour,\n\nMerci de nous transmettre votre meilleure offre pour le dossier ${active?.reference||''}.\n\nRentSoundSystem`);}
    else if(/retour étape 2/.test(t)){e.preventDefault();e.stopImmediatePropagation();gotoStep(active?.id,2);}
   }
   else if(page==='admin-crm-etape-4-controle-offre.html'){
    if(/approuver/.test(t)){await go(5);}
    else if(/correction/.test(t)){await go(null,{decision:'correction'});}
   }
   else if(page==='admin-crm-etape-5-devis.html'){
    if(/générer et envoyer/.test(t)){await save(6);openMail('Votre devis RentSoundSystem');}
    else if(/télécharger le brouillon/.test(t)){e.preventDefault();e.stopImmediatePropagation();printPage();}
   }
   else if(page==='admin-crm-etape-6-signature.html'){
    if(/confirmer la réservation/.test(t)){await go(7);}
    else if(/relancer le client/.test(t)){e.preventDefault();e.stopImmediatePropagation();openMail('Rappel : signature de votre contrat RentSoundSystem');}
    else if(/télécharger le contrat/.test(t)){e.preventDefault();e.stopImmediatePropagation();printPage();}
   }
   else if(page==='admin-crm-etape-7-paiement-caution.html'){
    if(/libérer la caution/.test(t)){await go(8,{deposit_action:'release_requested'});toast('Demande de libération enregistrée. Aucun mouvement bancaire n’a été effectué.');}
    else if(/débiter partiellement/.test(t)){await save(null,{deposit_action:'partial_debit_requested'});toast('Décision enregistrée. Le débit doit être effectué séparément.');}
    else if(/télécharger la facture/.test(t)){e.preventDefault();e.stopImmediatePropagation();printPage();}
   }
   else if(page==='admin-crm-etape-8-logistique.html'){
    if(/générer le bon de livraison/.test(t)){e.preventDefault();e.stopImmediatePropagation();printPage();}
    else if(/alerte équipe/.test(t)){e.preventDefault();e.stopImmediatePropagation();openMail('Alerte logistique RentSoundSystem',`Dossier ${active?.reference||''} : merci de vérifier la logistique.`);}
    else if(/modifier les notes/.test(t)){await save(null);}
   }
   else if(page==='admin-crm-etape-9-suivi-livraison.html'){
    if(/signaler un retard/.test(t)){await save(null,{delivery_status:'delay_reported'});}
    else if(/\bsms\b/.test(t)){e.preventDefault();e.stopImmediatePropagation();const phone=active?.client_phone;if(phone)location.href=`sms:${encodeURIComponent(phone)}`;else toast('Téléphone client absent.',true);}
    else if(/\bappel\b/.test(t)){e.preventDefault();e.stopImmediatePropagation();const phone=active?.client_phone;if(phone)location.href=`tel:${encodeURIComponent(phone)}`;else toast('Téléphone client absent.',true);}
   }
   else if(page==='admin-crm-etape-10-retour-inspection.html'){
    if(/valider l'étape/.test(t)){await go(11);}
    else if(/suspendre l'inspection/.test(t)){await save(null,{inspection_status:'suspended'});}
   }
   else if(page==='admin-crm-litige.html'){
    if(/valider la déduction/.test(t)){await save(null,{dispute_status:'open',dispute_decision:'deduction_validated'});}
    else if(/signaler au support/.test(t)){await save(null,{dispute_status:'open'});openMail('Signalement litige RentSoundSystem');}
    else if(/générer bon de retour/.test(t)){e.preventDefault();e.stopImmediatePropagation();printPage();}
    else if(/éditer rapport/.test(t)){await save(null);}
   }
   else if(page==='admin-crm-cloture-caution.html' && /libérer le solde|clôturer/.test(t)){
    await go(11,{deposit_action:'balance_release_requested',dispute_status:'resolved'});
    toast('Clôture enregistrée. Vérifiez et effectuez séparément le remboursement réel.');
   }
   else if(page.startsWith('admin-crm-email-')){
    if(/envoyer|ouvrir|prévisualiser|générer/.test(t)){e.preventDefault();e.stopImmediatePropagation();await save(null);openMail(page.includes('litige')?'Information concernant votre litige':page.includes('cloture')?'Clôture de votre dossier':'Votre devis RentSoundSystem');}
   }
  }catch(err){console.error('[RSS CRM button]',err);toast(err.message||'Action impossible',true);}
 },true);
}
async function boot(){
 shell();db=getClient();
 if(!db){$('[data-crm-content]').textContent='Client Supabase introuvable : vérifiez admin-supabase-adapter.js.';return;}
 try{
  const {data,error}=await db.auth.getUser();if(error)throw error;if(!data?.user)throw new Error('Session administrateur absente : reconnectez-vous.');
  await loadCases();
  if(page==='admin-crm-workflow.html'&&!cases.length){const q=await db.from('quote_requests').select('id').limit(1);if(q.error)throw q.error;quotes=q.data||[];render();}
 }catch(err){
  console.error('[RSS CRM boot]',err);
  $('[data-crm-content]').innerHTML=`<div class="crm-card"><strong>CRM non connecté</strong><p style="margin-top:6px">${esc(err.message)}</p><p style="font-size:12px;margin-top:6px">La migration SQL CRM doit être exécutée dans Supabase et les droits administrateur doivent être actifs.</p></div>`;
 }
}
bindMockupButtons();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
(function(){
  const SUPABASE_URL = 'https://crxofkxinsspfgdsxpiy.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj';
  const LOGIN_URL = '/connexion-inscription.html';

  let client = null;
  let currentUser = null;
  let reservationsCache = [];

  function sb(){
    if(client) return client;
    client = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
    return client;
  }
  function esc(value){return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function setText(selector, value){document.querySelectorAll(selector).forEach(el => { el.textContent = value; });}
  function money(value){const n=Number(value||0);return n.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});}
  function formatDate(value){if(!value)return 'Date à confirmer';const d=new Date(String(value).substring(0,10)+'T00:00:00');return Number.isNaN(d.getTime())?value:d.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});}
  function statusLabel(status){return ({pending:'En attente',confirmed:'Confirmée',cancelled:'Annulée',completed:'Terminée',reserved:'Réservée',active:'En cours'}[status] || status || 'En attente');}
  function statusClass(status){if(['confirmed','active','reserved'].includes(status))return 'bg-primary/15 text-primary';if(status==='pending')return 'bg-yellow-500/15 text-yellow-300';if(status==='cancelled')return 'bg-red-500/15 text-red-300';return 'bg-white/10 text-on-surface-variant';}
  function initialsFromName(value){const clean=String(value||'').trim();if(!clean)return 'CL';return clean.split(/\s+/).slice(0,2).map(p=>p.charAt(0).toUpperCase()).join('')||'CL';}
  function toast(message){let t=document.querySelector('.rss-toast');if(!t){t=document.createElement('div');t.className='rss-toast';document.body.appendChild(t)}t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2500);}

  async function getUser(){
    const supabase=sb();
    if(!supabase){toast('Supabase JS non chargé.');return null;}
    const {data,error}=await supabase.auth.getSession();
    if(error){console.warn('Session Supabase:',error);return null;}
    currentUser=data && data.session ? data.session.user : null;
    return currentUser;
  }

  async function loadProfile(user){
    if(!user){setText('#client-name,#sidebar-client-name','Client non connecté');setText('#client-email,#sidebar-client-email','Connexion requise');setText('#client-avatar','CL');return null;}
    const supabase=sb();
    const email=user.email||'';
    const fallbackName=(user.user_metadata&&(user.user_metadata.full_name||user.user_metadata.name))||email||'Client';
    let profile=null;
    try{
      const {data,error}=await supabase.from('profiles').select('full_name,company_name,email').eq('id',user.id).maybeSingle();
      if(error) console.warn('Profil Supabase:',error);
      profile=data||null;
    }catch(e){console.warn('Profil non chargé:',e);}
    const displayName=(profile&&profile.full_name)||fallbackName;
    const subtitle=(profile&&profile.company_name)||email||'Compte connecté';
    setText('#client-name,#sidebar-client-name',displayName);
    setText('#client-email,#sidebar-client-email',subtitle);
    setText('#client-avatar',initialsFromName(displayName));
    const nameInput=document.getElementById('name-input'), emailInput=document.getElementById('email-input'), companyInput=document.getElementById('company-input');
    if(nameInput) nameInput.value=displayName;
    if(emailInput) emailInput.value=email;
    if(companyInput) companyInput.value=(profile&&profile.company_name)||'';
    return profile;
  }

  async function loadReservations(user){
    if(!user){reservationsCache=[];renderReservations([]);return [];}
    const {data,error}=await sb().from('reservations').select('id,equipment_name,renter_name,start_date,end_date,status,total_price,created_at').eq('user_id',user.id).order('start_date',{ascending:true});
    if(error){console.warn('Réservations Supabase:',error);renderReservations([],error.message);return [];}
    reservationsCache=data||[];renderReservations(reservationsCache);return reservationsCache;
  }

  function reservationCard(r){return `<article class="bg-surface-container-lowest rounded-xl p-5 border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4"><div class="flex items-center gap-4"><div class="w-14 h-14 rounded-lg bg-primary/15 border border-primary/30 flex items-center justify-center"><span class="material-symbols-outlined text-primary">event_available</span></div><div><h3 class="font-headline font-bold text-xl">${esc(r.equipment_name||'Réservation')}</h3><p class="text-on-surface-variant text-sm mt-1">${formatDate(r.start_date)} → ${formatDate(r.end_date)}</p><p class="text-on-surface-variant text-xs mt-1">${esc(r.renter_name||'RentSoundSystem')} · ${money(r.total_price)}</p></div></div><span class="${statusClass(r.status)} px-4 py-2 rounded-full font-bold text-sm">${esc(statusLabel(r.status))}</span></article>`;}

  function renderReservations(rows,errorMessage){
    const count=rows.length;
    setText('#count-reservations',String(count));
    setText('#count-orders',String(count));
    setText('#count-messages',document.querySelector('#count-messages')?.textContent && document.querySelector('#count-messages').textContent !== '...' ? document.querySelector('#count-messages').textContent : '0');
    setText('#count-favorites','0');
    const total=rows.reduce((sum,r)=>sum+Number(r.total_price||0),0);
    setText('#total-revenue',money(total));
    const empty=errorMessage?`<div class="bg-surface-container-lowest border border-red-500/20 rounded-xl p-5 text-red-300">Erreur Supabase : ${esc(errorMessage)}</div>`:`<div class="bg-surface-container-lowest border border-white/5 rounded-xl p-5 text-on-surface-variant">Aucune réservation pour ce compte.</div>`;
    const html=rows.length?rows.map(reservationCard).join(''):empty;
    ['dashboard-reservations-list','reservation-list'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=html;});
    const ordersBody=document.getElementById('orders-body');
    if(ordersBody){ordersBody.innerHTML=rows.length?rows.map((r,i)=>`<tr class="hover:bg-surface-container-lowest transition"><td class="py-4 font-mono text-on-surface-variant">#RES-${String(i+1).padStart(4,'0')}</td><td>${formatDate(r.created_at?String(r.created_at).substring(0,10):r.start_date)}</td><td>${esc(r.equipment_name||'Réservation')}</td><td><span class="inline-flex items-center gap-2"><span class="w-2 h-2 rounded-full bg-primary"></span>${esc(statusLabel(r.status))}</span></td><td class="text-right font-bold">${money(r.total_price)}</td></tr>`).join(''):`<tr><td colspan="5" class="py-5 text-on-surface-variant">Aucune commande/réservation.</td></tr>`;}
    const activity=document.getElementById('activity-list');
    if(activity){activity.innerHTML=rows.slice(0,4).map(r=>`<div class="border-l-2 border-primary pl-4"><p class="font-bold">${esc(r.equipment_name||'Réservation')}</p><p class="text-on-surface-variant text-sm">${formatDate(r.start_date)} · ${esc(statusLabel(r.status))}</p></div>`).join('')||`<div class="border-l-2 border-white/20 pl-4"><p class="font-bold">Aucune activité</p><p class="text-on-surface-variant text-sm">Les futures réservations apparaîtront ici.</p></div>`;}
    renderCalendarFromReservations(rows);
  }

  function renderCalendarFromReservations(rows){
    const grid=document.getElementById('calendar-grid'), title=document.getElementById('calendar-title'), upcoming=document.getElementById('upcoming-list');
    if(!grid||!title)return;
    let now=new Date(), currentMonth=now.getMonth(), currentYear=now.getFullYear();
    const months=['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    function evClass(status){if(status==='pending')return 'bg-yellow-400/15 text-yellow-300 border-yellow-400/30';if(status==='cancelled')return 'bg-red-500/15 text-red-300 border-red-500/30';return 'bg-primary/20 text-primary border-primary/40';}
    function render(){
      title.textContent=months[currentMonth]+' '+currentYear;grid.innerHTML='';
      const first=new Date(currentYear,currentMonth,1), total=new Date(currentYear,currentMonth+1,0).getDate(), offset=(first.getDay()+6)%7;
      const monthEvents=rows.filter(r=>{const d=new Date((r.start_date||'')+'T00:00:00');return !Number.isNaN(d.getTime())&&d.getMonth()===currentMonth&&d.getFullYear()===currentYear;});
      for(let i=0;i<offset;i++)grid.insertAdjacentHTML('beforeend','<div class="calendar-day opacity-40 p-3"></div>');
      for(let day=1;day<=total;day++){const ds=monthEvents.filter(r=>new Date(r.start_date+'T00:00:00').getDate()===day);grid.insertAdjacentHTML('beforeend',`<div class="calendar-day p-3 relative"><span class="${ds.length?'text-primary':'text-on-surface-variant'} font-bold">${day}</span><div class="mt-2 space-y-1">${ds.map(r=>`<div class="calendar-event truncate rounded border px-2 py-1 text-xs ${evClass(r.status)}" title="${esc(r.equipment_name)}">${esc(r.equipment_name)}</div>`).join('')}</div></div>`);}
      if(upcoming){upcoming.innerHTML=monthEvents.slice(0,6).map(r=>`<li class="flex items-start gap-3 border-l-2 border-primary pl-3"><div><p class="text-sm font-bold">${esc(r.equipment_name)}</p><p class="text-xs text-primary">${formatDate(r.start_date)} · ${esc(statusLabel(r.status))}</p></div></li>`).join('')||'<li class="text-on-surface-variant text-sm">Aucune réservation ce mois-ci.</li>';}
    }
    const prev=document.getElementById('prev-month'), next=document.getElementById('next-month');
    if(prev&&!prev.dataset.rssBound){prev.dataset.rssBound='1';prev.addEventListener('click',()=>{currentMonth--;if(currentMonth<0){currentMonth=11;currentYear--;}render();});}
    if(next&&!next.dataset.rssBound){next.dataset.rssBound='1';next.addEventListener('click',()=>{currentMonth++;if(currentMonth>11){currentMonth=0;currentYear++;}render();});}
    render();
  }

  async function loadListings(){
    const body=document.getElementById('inventory-body');if(!body)return;
    body.innerHTML='<tr><td colspan="6" class="py-5 text-on-surface-variant">Chargement de l’inventaire...</td></tr>';
    try{const {data,error}=await sb().from('listings').select('*').limit(50);if(error)throw error;const rows=data||[];
      body.innerHTML=rows.length?rows.map(item=>{const name=item.title||item.name||item.equipment_name||item.slug||'Matériel';const brand=item.brand||item.brand_name||item.category||item.type||'Catalogue';const price=item.price||item.daily_price||item.price_per_day||item.amount||0;const status=item.status||(item.is_active===false?'Inactif':'Disponible');return `<tr class="hover:bg-surface-container-lowest transition"><td class="py-4 font-bold">${esc(name)}</td><td class="text-on-surface-variant">${esc(brand)}</td><td><span class="text-primary font-bold">${esc(status)}</span></td><td>Catalogue</td><td class="font-bold">${money(price)}</td><td class="text-right"><a href="/catalog.html" class="text-primary font-bold">Voir</a></td></tr>`;}).join(''):'<tr><td colspan="6" class="py-5 text-on-surface-variant">Aucun matériel trouvé dans listings.</td></tr>';
    }catch(e){body.innerHTML=`<tr><td colspan="6" class="py-5 text-red-300">Erreur listings : ${esc(e.message)}</td></tr>`;}
  }

  async function initSettings(user){
    const form=document.getElementById('settings-form');if(!form||!user||form.dataset.rssBound)return;form.dataset.rssBound='1';
    form.addEventListener('submit',async e=>{e.preventDefault();const full_name=document.getElementById('name-input')?.value.trim()||'';const company_name=document.getElementById('company-input')?.value.trim()||'';const {error}=await sb().from('profiles').upsert({id:user.id,email:user.email,full_name,company_name});if(error){toast('Erreur enregistrement profil.');console.error(error)}else{toast('Profil enregistré.');await loadProfile(user)}});
  }

  async function initMessages(user){
    const chat=document.getElementById('chat-list'), send=document.getElementById('send-btn'), input=document.getElementById('message-input');if(!chat||!user)return;
    async function load(){try{const {data,error}=await sb().from('messages').select('*').eq('user_id',user.id).order('created_at',{ascending:true}).limit(100);if(error)throw error;if(data&&data.length){chat.innerHTML=data.map(m=>`<div class="flex gap-4 ${m.is_client?'flex-row-reverse':''} message-bubble"><div class="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary font-bold shrink-0">${m.is_client?'Moi':'RSS'}</div><div class="message-max max-w-[70%] ${m.is_client?'flex flex-col items-end':''}"><div class="${m.is_client?'bg-primary text-white':'bg-surface-container'} p-4 rounded-lg border border-white/10"><p>${esc(m.body)}</p></div></div></div>`).join('');}}catch(e){console.warn('Table messages non disponible:',e.message);}}
    await load();
    if(send&&input&&!send.dataset.rssBound){send.dataset.rssBound='1';send.addEventListener('click',async()=>{const body=input.value.trim();if(!body)return;try{await sb().from('messages').insert({user_id:user.id,body,is_client:true});input.value='';await load();}catch(e){toast('Message non sauvegardé : vérifiez la table messages.')}});}
  }

  async function init(){
    const user=await getUser();await loadProfile(user);await initSettings(user);await loadReservations(user);await loadListings();await initMessages(user);
    document.querySelectorAll('.go-catalog,#add-equipment-btn,#new-request-btn').forEach(btn=>{if(!btn.dataset.rssCatalogBound){btn.dataset.rssCatalogBound='1';btn.addEventListener('click',()=>{location.href='/catalog.html';});}});
    const logout=document.getElementById('logout-btn');if(logout&&!logout.dataset.rssBound){logout.dataset.rssBound='1';logout.addEventListener('click',async()=>{logout.disabled=true;logout.innerHTML='<span class="material-symbols-outlined">hourglass_top</span> Déconnexion...';try{const supabase=sb();if(supabase)await supabase.auth.signOut();location.href=LOGIN_URL;}catch(e){console.error(e);logout.disabled=false;logout.innerHTML='<span class="material-symbols-outlined">logout</span> Déconnexion';toast('Déconnexion impossible.');}});}
  }
  document.addEventListener('DOMContentLoaded',init);
})();

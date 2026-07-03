
(function(){
  "use strict";
  const SUPABASE_URL="https://crxofkxinsspfgdsxpiy.supabase.co";
  const SUPABASE_KEY="sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj";
  const state={sb:null,user:null,threads:[],activeId:null,messages:[],filter:"open"};

  const $=(s)=>document.querySelector(s);
  const $$=(s)=>Array.from(document.querySelectorAll(s));
  const escapeHtml=(v)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const fmt=(v)=>{const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toLocaleDateString("fr-FR",{day:"2-digit",month:"short"})+" · "+d.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});};
  function note(message,error=false){const n=$("#support-note");if(n){n.textContent=message||"";n.classList.toggle("error",!!error);}}
  function toast(message){note(message,false);}

  async function initClient(){
    if(!window.supabase)throw new Error("Supabase indisponible.");
    state.sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    const {data:{session}}=await state.sb.auth.getSession();
    if(!session?.user){location.href="/connexion-inscription.html?redirect="+encodeURIComponent(location.pathname);return false;}
    state.user=session.user;
    const {data:agent,error}=await state.sb.from("support_agents").select("role,active").eq("user_id",state.user.id).maybeSingle();
    if(error||!agent?.active){
      $("#support-app").innerHTML='<section class="card" style="padding:32px;grid-column:1/-1"><h2 style="font-family:Manrope,sans-serif;margin-top:0">Accès non autorisé</h2><p style="color:var(--muted);line-height:1.6">Cette page est réservée à l’équipe RentSoundSystem. Ajoutez votre compte dans la table <strong>support_agents</strong> depuis Supabase avant de l’utiliser.</p></section>';
      note("Votre compte n’est pas encore déclaré comme agent support.",true);
      return false;
    }
    return true;
  }

  function filtered(){return state.threads.filter(t=>state.filter==="all"||String(t.status||"open")===state.filter);}
  function renderThreads(){
    const box=$("#support-thread-list");if(!box)return;
    const items=filtered();
    $("#inbox-count").textContent=items.length+" demande"+(items.length>1?"s":"");
    if(!items.length){box.innerHTML='<div class="empty">Aucune demande dans cette vue.</div>';return;}
    box.innerHTML=items.map(t=>{
      const active=String(t.id)===String(state.activeId)?" active":"";
      const closed=String(t.status)==="closed";
      const client=t.client_name||t.client_email||"Client RentSoundSystem";
      return `<button type="button" class="thread${active}" data-thread="${escapeHtml(t.id)}"><strong>${escapeHtml(t.subject||"Demande client")}</strong><span>${escapeHtml(client)}</span><small class="${closed?"closed":""}">${closed?"Clôturée":"Ouverte"}</small><span>${escapeHtml(fmt(t.last_message_at||t.created_at))}</span></button>`;
    }).join("");
    $$("[data-thread]").forEach(el=>el.addEventListener("click",()=>selectThread(el.dataset.thread)));
  }

  async function loadThreads(){
    note("Synchronisation de la boîte de réception…");
    const {data,error}=await state.sb.from("support_threads").select("*").order("last_message_at",{ascending:false}).limit(200);
    if(error){console.error(error);note("Impossible de charger la boîte de réception.",true);return;}
    state.threads=data||[];
    if(state.activeId&&!state.threads.some(t=>String(t.id)===String(state.activeId)))state.activeId=null;
    renderThreads();
    if(state.activeId)await selectThread(state.activeId);
    else if(filtered()[0])await selectThread(filtered()[0].id);
    else note("Aucune demande ouverte.");
  }

  async function selectThread(id){
    state.activeId=id;renderThreads();
    const thread=state.threads.find(t=>String(t.id)===String(id));if(!thread)return;
    $("#support-title").textContent=thread.subject||"Demande client";
    $("#support-client").textContent=(thread.client_name||"Client")+" · "+(thread.client_email||"e-mail non renseigné");
    $("#toggle-thread-status").disabled=false;
    $("#toggle-thread-status").textContent=String(thread.status)==="closed"?"Réouvrir":"Clôturer";
    $("#support-reply").disabled=false;$("#support-send").disabled=false;
    $("#support-stream").innerHTML='<div class="empty">Chargement de la conversation…</div>';
    const {data,error}=await state.sb.from("support_messages").select("*").eq("thread_id",id).order("created_at",{ascending:true}).limit(500);
    if(error){console.error(error);$("#support-stream").innerHTML='<div class="empty">Les messages ne sont pas accessibles.</div>';return;}
    state.messages=data||[];renderMessages();
  }

  function renderMessages(){
    const stream=$("#support-stream");if(!stream)return;
    if(!state.messages.length){stream.innerHTML='<div class="empty">Cette demande ne contient pas encore de message.</div>';return;}
    stream.innerHTML=state.messages.map(m=>{
      const self=String(m.sender_id)===String(state.user.id)||m.sender_role==="support";
      const name=self?"RentSoundSystem":(m.sender_role==="partner"?"Partenaire":"Client");
      return `<div class="bubble${self?" self":""}"><div>${escapeHtml(m.body||"")}</div><div class="who">${name} · ${escapeHtml(fmt(m.created_at))}</div></div>`;
    }).join("");
    stream.scrollTop=stream.scrollHeight;
  }

  async function notify(threadId,messageId){
    try{
      const {data:{session}}=await state.sb.auth.getSession();
      if(!session?.access_token)return;
      await fetch("/api/support/notify",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},body:JSON.stringify({thread_id:threadId,message_id:messageId,event:"support_reply"})});
    }catch(e){console.warn("Notification client non bloquante",e);}
  }

  async function reply(event){
    event.preventDefault();
    const body=String($("#support-reply").value||"").trim();
    if(!body||!state.activeId)return;
    const button=$("#support-send");button.disabled=true;button.textContent="Envoi…";
    try{
      const {data,error}=await state.sb.from("support_messages").insert({thread_id:state.activeId,sender_id:state.user.id,sender_role:"support",body}).select("id").single();
      if(error)throw error;
      $("#support-reply").value="";
      await notify(state.activeId,data?.id);
      await selectThread(state.activeId);
      await loadThreads();
      toast("Réponse envoyée au client.");
    }catch(error){console.error(error);note("Impossible d’envoyer la réponse.",true);}
    finally{button.disabled=false;button.textContent="Répondre";}
  }

  async function toggleStatus(){
    const thread=state.threads.find(t=>String(t.id)===String(state.activeId));if(!thread)return;
    const status=String(thread.status)==="closed"?"open":"closed";
    const {error}=await state.sb.from("support_threads").update({status}).eq("id",thread.id);
    if(error){note("Impossible de modifier le statut.",true);return;}
    await loadThreads();
  }

  function bind(){
    $("#support-reply-form")?.addEventListener("submit",reply);
    $("#toggle-thread-status")?.addEventListener("click",toggleStatus);
    $("#refresh-inbox")?.addEventListener("click",loadThreads);
    $$("[data-filter]").forEach(btn=>btn.addEventListener("click",()=>{state.filter=btn.dataset.filter;$$("[data-filter]").forEach(b=>b.classList.toggle("active",b===btn));renderThreads();}));
  }

  async function init(){
    try{
      if(!await initClient())return;
      bind();
      const requestedThread=new URLSearchParams(window.location.search).get("thread");
      if(requestedThread)state.activeId=requestedThread;
      await loadThreads();
      state.sb.channel("rss-support-inbox-"+state.user.id).on("postgres_changes",{event:"*",schema:"public",table:"support_threads"},loadThreads).subscribe();
      state.sb.channel("rss-support-messages-"+state.user.id).on("postgres_changes",{event:"*",schema:"public",table:"support_messages"},()=>{if(state.activeId)selectThread(state.activeId);}).subscribe();
      window.addEventListener("focus",loadThreads,{passive:true});
    }catch(error){console.error(error);note("La boîte de réception support est indisponible.",true);}
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

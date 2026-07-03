
(function(){
  "use strict";

  const SUPABASE_URL = "https://crxofkxinsspfgdsxpiy.supabase.co";
  const SUPABASE_KEY = "sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj";

  const body = document.body;
  const targetKey = String(body.dataset.categoryKey || "").trim();
  const layout = String(body.dataset.categoryLayout || "standard").trim();

  const $ = (selector) => document.querySelector(selector);

  function safe(value){
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[char]));
  }

  function clean(value){
    return String(value || "")
      .replace(/<[^>]*>?/gm, "")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeKey(value){
    return clean(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  const aliases = {
    "casque":"casques",
    "casques":"casques",
    "casques-ecouteurs":"casques",
    "casques-et-ecouteurs":"casques",
    "headphones":"casques",

    "deejay":"dj",
    "dj":"dj",
    "dj-gear":"dj",
    "dj-djing":"dj",
    "dj-and-djing":"dj",
    "djing":"dj",

    "evenement-production":"event",
    "evenementiel-production":"event",
    "evenementiel-et-production":"event",
    "event-production":"event",

    "instruments-a-percussion":"instruments",
    "instruments-music":"instruments",
    "instruments-et-percussion":"instruments",
    "instrument-music":"instruments",

    "multimedia-digital":"multimedia",
    "multimedia-et-digital":"multimedia",
    "multimedia":"multimedia",

    "sonorisation-eclairage":"soundlight",
    "sonorisation-et-eclairage":"soundlight",
    "sound-light":"soundlight",
    "sonorisation":"soundlight",
    "eclairage":"soundlight"
  };

  function canonicalCategory(value){
    const key = normalizeKey(value);
    return aliases[key] || key;
  }

  function money(value){
    return Number(value || 0).toLocaleString("fr-FR", {
      style:"currency", currency:"EUR", maximumFractionDigits:0
    });
  }

  function productUrl(item){
    const original = String(item?.original_id ?? "").trim();
    if(original && /^\d+$/.test(original) && original !== "0"){
      return "/product.html?original_id=" + encodeURIComponent(original);
    }
    const id = String(item?.id ?? "").trim();
    return id ? "/product.html?id=" + encodeURIComponent(id) : "/catalog.html";
  }

  function firstImage(item){
    const images = Array.isArray(item?.listing_images) ? item.listing_images.slice() : [];
    images.sort((a,b) => Number(a?.position || 0) - Number(b?.position || 0));
    return String(images[0]?.image_url || item?.image_url || item?.featured_image || "").replace(/^\/public\//, "/");
  }

  function listingCity(item){
    return clean(item?.city || item?.location || item?.country || "Lieu à confirmer");
  }

  function listingCard(item, index){
    const image = firstImage(item);
    const title = safe(item?.title || "Matériel professionnel");
    const description = safe(clean(item?.description || "Annonce disponible sur RentSoundSystem."));
    const city = safe(listingCity(item));
    const price = money(item?.price || 0);
    const url = safe(productUrl(item));
    const imageMarkup = image
      ? `<img src="${safe(image)}" alt="${title}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove(); this.parentElement.insertAdjacentHTML('beforeend','<div class=&quot;category-placeholder material-symbols-outlined&quot;>inventory_2</div>');">`
      : `<div class="category-placeholder material-symbols-outlined">inventory_2</div>`;

    const eventClass = layout === "event" && index === 0 ? " is-featured" : "";
    return `<article class="category-card${eventClass}" data-product-url="${url}" tabindex="0" role="link">
      <div class="category-card-image">${imageMarkup}</div>
      <div class="category-card-body">
        <div class="category-card-city"><span class="material-symbols-outlined" style="font-size:15px">location_on</span>${city}</div>
        <h3>${title}</h3>
        <p>${description}</p>
        <div class="category-card-footer">
          <div class="category-card-price">${price} <small>/ jour</small></div>
          <span class="category-card-link">Voir l’annonce <span class="material-symbols-outlined" style="font-size:17px">arrow_forward</span></span>
        </div>
      </div>
    </article>`;
  }

  function render(items){
    const grid = $("#category-grid");
    const count = $("#category-listings-count");
    const subtitle = $("#category-live-subtitle");
    if(!grid) return;

    if(count) count.textContent = String(items.length);
    if(subtitle) subtitle.textContent = items.length
      ? `${items.length} annonce${items.length > 1 ? "s" : ""} actuellement disponible${items.length > 1 ? "s" : ""} dans cette catégorie.`
      : "Aucune annonce publiée dans cette catégorie pour le moment.";

    if(!items.length){
      grid.innerHTML = `<div class="category-empty">
        <span class="material-symbols-outlined">inventory_2</span>
        <h3>Les prochaines annonces arrivent bientôt.</h3>
        <p>Cette catégorie est prête : les annonces publiées par les partenaires apparaîtront ici automatiquement.</p>
      </div>`;
      return;
    }

    grid.innerHTML = items.map(listingCard).join("");

    grid.querySelectorAll("[data-product-url]").forEach((card) => {
      const go = () => window.location.href = card.dataset.productUrl;
      card.addEventListener("click", (event) => {
        if(event.target.closest("a,button,input,label")) return;
        go();
      });
      card.addEventListener("keydown", (event) => {
        if(event.key === "Enter" || event.key === " "){
          event.preventDefault();
          go();
        }
      });
    });
  }

  function applySearch(items){
    const input = $("#category-search");
    if(!input) return;
    let timer = null;
    input.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const query = clean(input.value).toLowerCase();
        const next = !query ? items : items.filter((item) => {
          const text = [item.title,item.description,item.brand,item.model,item.city,item.location]
            .map(clean).join(" ").toLowerCase();
          return text.includes(query);
        });
        render(next);
      }, 180);
    });
  }

  async function init(){
    const grid = $("#category-grid");
    if(grid){
      grid.innerHTML = `<div class="category-loading"><span class="material-symbols-outlined">sync</span></div>`;
    }

    if(!window.supabase){
      render([]);
      return;
    }

    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data, error } = await client
      .from("listings")
      .select("id, original_id, title, description, city, location, country, category, brand, model, price, featured, image_url, featured_image, listing_images(image_url, position)")
      .eq("status", "publish")
      .limit(1000);

    if(error){
      console.warn("Chargement catégorie :", error.message || error);
      render([]);
      return;
    }

    const items = (data || [])
      .filter((item) => canonicalCategory(item.category) === targetKey)
      .sort((a,b) => Number(b.featured || 0) - Number(a.featured || 0) || Number(b.original_id || 0) - Number(a.original_id || 0));

    render(items);
    applySearch(items);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

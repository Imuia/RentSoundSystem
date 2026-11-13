const supabaseUrl = 'https://crxofkxinsspfgdsxpiy.supabase.co'
const supabaseKey = 'sb_publishable_oRZBgjE_IWkCWn6glpie2A_ymVzz1Uj'

const supabase = window.supabase.createClient(supabaseUrl, supabaseKey)

// Charger les annonces depuis Supabase
async function loadListings() {

  const { data: listings, error } = await supabase
    .from("listings")
    .select(`
      *,
      listing_images (
        image_url,
        position
      )
    `)
    .eq("status", "publish")
    .order("featured", { ascending: false });

  if (error) {
    console.error("Erreur Supabase :", error);
    return;
  }

  console.log("Listings :", listings);

  // Exemple affichage HTML
  const container = document.getElementById("products-container");

  if (!container) return;

  container.innerHTML = "";

  listings.forEach(item => {

    const image =
      item.listing_images?.[0]?.image_url ||
      "https://via.placeholder.com/600x400";

    container.innerHTML += `
      <div class="product-card">
        <img src="${image}" alt="${item.title}">
        <h3>${item.title}</h3>
        <p>${item.price || ""} €</p>
      </div>
    `;
  });

}

// lancer automatiquement
loadListings();
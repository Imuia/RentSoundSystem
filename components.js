async function loadComponent(id, file) {
  const el = document.getElementById(id);
  if (!el) return;

  el.style.minHeight = id === "header-container" ? "75px" : "300px";

  try {
    const response = await fetch(file, { cache: "force-cache" });
    const html = await response.text();
    el.innerHTML = html;
    el.style.minHeight = "";
  } catch (err) {
    console.error("Erreur chargement composant :", file);
  }
}

loadComponent("header-container", "/header.html");
loadComponent("footer-container", "/footer.html");
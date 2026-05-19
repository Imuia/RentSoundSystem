async function loadComponent(id, file) {
  const el = document.getElementById(id);
  if (!el) return;

  try {
    const response = await fetch(file);
    const html = await response.text();
    el.innerHTML = html;
  } catch (err) {
    console.error("Erreur chargement composant :", file);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadComponent("header-container", "/header.html");
  loadComponent("footer-container", "/footer.html");
});
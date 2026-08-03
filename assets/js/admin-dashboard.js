(() => {
  'use strict';
  const A = window.RSSAdmin;
  if (!A) return;

  let revenueValues = Array(12).fill(0);

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function numeric(row, keys) {
    const raw = A.pick(row, keys, 0);
    const number = Number(raw);
    return Number.isFinite(number) ? number : 0;
  }

  function paidStatus(value) {
    return /paid|succeed|completed|confirm|payé/i.test(String(value || ''));
  }

  function activeListing(value) {
    return /publish|active|actif|approved/i.test(String(value || ''));
  }

  function drawRevenueChart(values) {
    const canvas = document.querySelector('#revenue-chart');
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth || 700;
    const height = canvas.clientHeight || 260;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.clearRect(0, 0, width, height);
    const pad = { left: 34, right: 16, top: 22, bottom: 28 };
    const graphW = width - pad.left - pad.right;
    const graphH = height - pad.top - pad.bottom;
    const max = Math.max(...values, 1);

    ctx.strokeStyle = '#e8ebef';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = pad.top + (graphH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    }

    const points = values.map((value, index) => ({
      x: pad.left + graphW * (index / Math.max(values.length - 1, 1)),
      y: pad.top + graphH - (value / max) * graphH
    }));
    const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
    gradient.addColorStop(0, 'rgba(252,3,109,.25)');
    gradient.addColorStop(1, 'rgba(252,3,109,0)');
    ctx.beginPath();
    ctx.moveTo(points[0].x, height - pad.bottom);
    points.forEach(point => ctx.lineTo(point.x, point.y));
    ctx.lineTo(points.at(-1).x, height - pad.bottom);
    ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
    ctx.beginPath();
    points.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
    ctx.strokeStyle = '#fc036d'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
    points.forEach(point => {
      ctx.beginPath(); ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fc036d'; ctx.stroke();
    });
    const labels = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
    ctx.fillStyle = '#9ca3af'; ctx.font = '11px Inter'; ctx.textAlign = 'center';
    labels.forEach((label, index) => ctx.fillText(label, pad.left + graphW * (index / 11), height - 8));
  }

  function renderActivities(rows) {
    const box = document.querySelector('[data-dashboard-activities]');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<div class="admin-empty"><div><span class="material-symbols-outlined">history</span><h3>Aucune activité récente</h3><p>Les prochaines actions administratives apparaîtront ici.</p></div></div>';
      return;
    }
    box.innerHTML = rows.slice(0, 8).map(row => {
      const title = row.action || row.event_type || row.message || row.status || 'Mise à jour';
      const subtitle = [row.resource, row.resource_id, row.admin_email].filter(Boolean).join(' · ');
      return `<div class="admin-activity"><span class="admin-activity-dot"></span><div><strong>${A.escapeHtml(title)}</strong><span>${A.escapeHtml(subtitle || 'Administration')}</span></div><time>${A.formatDate(row.created_at || row.date, true)}</time></div>`;
    }).join('');
  }

  async function loadDashboard() {
    const integration = document.querySelector('[data-dashboard-integration]');
    try {
      const names = ['reservations', 'orders', 'listings', 'payments', 'partners', 'logs'];
      const entries = await Promise.all(names.map(async name => {
        try { return [name, await A.listResource(name, { limit: A.config.maxRows || 2000 })]; }
        catch (error) { console.warn(`[RSS Admin] ${name}`, error); return [name, []]; }
      }));
      const results = Object.fromEntries(entries);

      const reservations = results.reservations || [];
      const orders = results.orders || [];
      const listings = results.listings || [];
      const payments = results.payments || [];
      const partners = results.partners || [];

      const reservationCount = reservations.filter(row => !/cancel/i.test(String(row.status || ''))).length;
      const pendingOrders = orders.filter(row => /pending|nouveau|processing/i.test(String(row.status || ''))).length;
      const listingCount = listings.filter(row => activeListing(row.status)).length;
      const pendingPartners = partners.filter(row => /pending|attente/i.test(String(row.status || ''))).length;
      const successfulPayments = payments.filter(row => paidStatus(row.status || row.payment_status));
      const revenue = successfulPayments.reduce((sum, row) => sum + numeric(row, ['amount', 'total_price', 'total', 'total_amount']), 0);

      setText('[data-kpi-reservations]', reservationCount);
      setText('[data-kpi-orders]', pendingOrders);
      setText('[data-kpi-listings]', listingCount);
      setText('[data-kpi-partners]', pendingPartners);
      setText('[data-kpi-revenue]', A.formatMoney(revenue));

      revenueValues = Array(12).fill(0);
      const currentYear = new Date().getFullYear();
      successfulPayments.forEach(row => {
        const date = new Date(row.date || row.paid_at || row.created_at || '');
        if (Number.isNaN(date.getTime()) || date.getFullYear() !== currentYear) return;
        revenueValues[date.getMonth()] += numeric(row, ['amount', 'total_price', 'total', 'total_amount']);
      });
      drawRevenueChart(revenueValues);
      renderActivities(results.logs || []);
      if (integration) integration.textContent = 'Données réelles synchronisées via les fonctions Supabase administrateur.';
    } catch (error) {
      console.error('[RSS Admin] dashboard', error);
      if (integration) integration.textContent = `Erreur de synchronisation : ${error.message || 'inconnue'}`;
      A.toast('Dashboard indisponible. Vérifiez le SQL administrateur.', 'error');
    }
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => drawRevenueChart(revenueValues), 120);
  });

  document.addEventListener('DOMContentLoaded', async () => {
    if (!await A.requireAdmin()) return;
    await loadDashboard();
  });
})();

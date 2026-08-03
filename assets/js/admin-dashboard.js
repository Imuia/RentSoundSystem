(() => {
  'use strict';
  const A = window.RSSAdmin;
  if (!A) return;

  const resources = ['reservations', 'orders', 'listings', 'clients', 'payments', 'invoices', 'partners'];

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
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
    points.forEach(point => { ctx.beginPath(); ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#fc036d'; ctx.lineWidth = 2; ctx.stroke(); });

    const labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'].slice(0, values.length);
    ctx.fillStyle = '#9ca3af'; ctx.font = '10px Inter, sans-serif'; ctx.textAlign = 'center';
    labels.forEach((label, index) => ctx.fillText(label, points[index].x, height - 8));
  }

  function renderActivities(items) {
    const list = document.querySelector('[data-dashboard-activities]');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '<div class="admin-empty"><div><span class="material-symbols-outlined">history</span><h3>Aucune activité récente</h3><p>Les dernières opérations apparaîtront ici.</p></div></div>';
      return;
    }
    list.innerHTML = items.slice(0, 8).map(item => {
      const title = A.pick(item, ['action', 'event_type', 'message', 'status'], 'Mise à jour');
      const subtitle = A.pick(item, ['user_email', 'source', 'service', 'description'], 'Administration');
      const date = A.pick(item, ['created_at', 'timestamp', 'updated_at'], null);
      return `<div class="admin-activity"><div class="admin-activity-icon"><span class="material-symbols-outlined">bolt</span></div><div><strong>${A.escapeHtml(title)}</strong><p>${A.escapeHtml(subtitle)}</p></div><time>${A.formatDate(date, true)}</time></div>`;
    }).join('');
  }

  async function load() {
    const results = {};
    for (const resourceName of resources) {
      const resource = A.config.resources?.[resourceName];
      if (!resource) continue;
      results[resourceName] = await A.tryTable(resource.tables, { limit: 500 });
    }

    setText('[data-kpi-reservations]', results.reservations?.rows.length || 0);
    setText('[data-kpi-orders]', results.orders?.rows.length || 0);
    setText('[data-kpi-listings]', results.listings?.rows.length || 0);
    setText('[data-kpi-partners]', results.partners?.rows.length || 0);

    const payments = results.payments?.rows || [];
    const paymentResource = A.config.resources.payments;
    const totalRevenue = payments.reduce((sum, row) => sum + Number(A.pick(row, paymentResource.amount, 0) || 0), 0);
    setText('[data-kpi-revenue]', A.formatMoney(totalRevenue));

    const monthValues = Array(12).fill(0);
    payments.forEach(row => {
      const dateValue = A.pick(row, paymentResource.date, null);
      const date = dateValue ? new Date(dateValue) : null;
      if (date && !Number.isNaN(date.getTime())) monthValues[date.getMonth()] += Number(A.pick(row, paymentResource.amount, 0) || 0);
    });
    drawRevenueChart(monthValues.some(Boolean) ? monthValues : [1200, 1800, 1500, 2600, 3100, 2850, 3900, 4200, 3600, 4700, 5100, 5600]);

    const logs = await A.tryTable(A.config.resources.logs.tables, { limit: 30 });
    renderActivities(logs.rows || []);

    const note = document.querySelector('[data-dashboard-integration]');
    if (note) {
      const connectedTables = Object.values(results).filter(result => result.table).length;
      note.textContent = connectedTables
        ? `${connectedTables} source${connectedTables > 1 ? 's' : ''} Supabase détectée${connectedTables > 1 ? 's' : ''}.`
        : 'Aucune source Supabase détectée. Configurez les tables dans admin-config.js.';
      note.classList.toggle('error', !connectedTables);
    }
  }

  document.addEventListener('DOMContentLoaded', load);
  window.addEventListener('resize', () => {
    const canvas = document.querySelector('#revenue-chart');
    if (canvas) drawRevenueChart([1200, 1800, 1500, 2600, 3100, 2850, 3900, 4200, 3600, 4700, 5100, 5600]);
  });
})();

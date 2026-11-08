/* gfinanzas — interfaz */
(function () {
  'use strict';

  const C = window.GCalc;
  const STORE_KEY = 'gfinanzas.v1';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // ---------- Estado ----------
  let state = load();
  let charts = {};
  let editingId = null;

  function emptyState() {
    return { version: 1, ops: [], prices: {}, settings: { currency: 'EUR' }, seq: 0 };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return emptyState();
      const s = JSON.parse(raw);
      return { ...emptyState(), ...s, settings: { ...emptyState().settings, ...(s.settings || {}) } };
    } catch (e) {
      console.warn('No se pudieron leer los datos guardados', e);
      return emptyState();
    }
  }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('No se pudo guardar: el navegador no permite almacenamiento local.');
    }
  }

  // ---------- Utilidades ----------
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const today = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function money(v, opts = {}) {
    if (v == null || !Number.isFinite(v)) return '—';
    const f = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: state.settings.currency || 'EUR',
      useGrouping: 'always',
      minimumFractionDigits: opts.decimals ?? 2,
      maximumFractionDigits: opts.decimals ?? (Math.abs(v) < 10 && opts.precise ? 4 : 2),
    });
    const s = f.format(v);
    return opts.sign && v > 0 ? '+' + s : s;
  }
  const numFmt = (v, d = 4) =>
    v == null ? '—' : new Intl.NumberFormat('es-ES', { maximumFractionDigits: d, useGrouping: 'always' }).format(v);
  function pct(v, sign = true) {
    if (v == null || !Number.isFinite(v)) return '—';
    const s = new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    return sign && v > 0 ? '+' + s : s;
  }
  const cls = (v) => (v == null ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const fmtDate = (d) => (d ? d.split('-').reverse().join('/') : '—');
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 100);
  }

  // ---------- Render principal ----------
  let pf, val;
  function render() {
    pf = C.computePortfolio(state.ops);
    val = C.valuePositions(pf.positions, state.prices);
    const empty = state.ops.length === 0;
    $('#emptyState').classList.toggle('hidden', !empty);
    $('#dashboard').classList.toggle('hidden', empty);
    renderWarnings();
    renderKpis();
    renderPositions();
    renderSimTickers();
    renderOps();
    renderFiscal();
    renderDatalist();
    if (!empty) renderCharts();
    $('#currencySel').value = state.settings.currency;
  }

  function renderWarnings() {
    const box = $('#warnings');
    const list = pf.warnings.filter((w) => w.type === 'sobreventa');
    box.innerHTML = list
      .map((w) => `<div class="alert"><span>⚠</span><span>${esc(w.msg)} Revisa tus operaciones.</span></div>`)
      .join('');
  }

  function kpi(label, value, sub, extra = '', valueCls = '') {
    return `<div class="kpi ${extra}"><div class="label">${label}</div><div class="value ${valueCls}">${value}</div>${
      sub ? `<div class="sub">${sub}</div>` : ''
    }</div>`;
  }

  function renderKpis() {
    const t = pf.totals;
    const unpriced = val.rows.filter((r) => r.price == null);
    const portfolioValue = val.value + unpriced.reduce((s, r) => s + r.cost, 0);
    const totalResult = val.unrealized + t.realized + t.dividends;
    const heroSub =
      val.rows.length === 0
        ? 'No tienes posiciones abiertas'
        : unpriced.length
        ? `${unpriced.length} valor${unpriced.length > 1 ? 'es' : ''} sin precio actual (se usa su coste). Añádelo en «Cartera».`
        : `${val.rows.length} posiciones abiertas`;
    $('#kpis').innerHTML = [
      kpi('Valor de la cartera', money(portfolioValue), heroSub, 'hero'),
      kpi('Capital invertido', money(t.invested), 'Coste de lo que tienes ahora (con comisiones)'),
      kpi(
        'Ganancia latente',
        money(val.unrealized, { sign: true }),
        val.costPriced > 0 ? pct(val.unrealizedPct) + ' sobre el coste' : 'Introduce precios actuales',
        '',
        cls(val.unrealized)
      ),
      kpi('Ganancia realizada', money(t.realized, { sign: true }), `${pf.realized.length} venta${pf.realized.length === 1 ? '' : 's'}`, '', cls(t.realized)),
      kpi('Dividendos netos', money(t.dividends), `${pf.dividends.length} cobro${pf.dividends.length === 1 ? '' : 's'}`),
      kpi('Comisiones pagadas', money(t.commissions), 'Compras + ventas'),
      kpi('Resultado total', money(totalResult, { sign: true }), 'Latente + realizada + dividendos', '', cls(totalResult)),
    ].join('');
  }

  // ---------- Cartera ----------
  function renderPositions() {
    const tbl = $('#positionsTable');
    if (!val.rows.length) {
      tbl.innerHTML = `<tbody><tr class="empty-row"><td>No tienes posiciones abiertas.</td></tr></tbody>`;
      return;
    }
    const maxW = Math.max(...val.rows.map((r) => r.weight));
    const rows = val.rows
      .map(
        (r) => `<tr>
        <td><span class="ticker">${esc(r.ticker)}</span><span class="sub">${esc(r.name) || 'desde ' + fmtDate(r.firstDate)}</span></td>
        <td class="num">${numFmt(r.qty)}</td>
        <td class="num">${money(r.avg, { precise: true })}</td>
        <td class="num">${money(r.cost)}</td>
        <td class="num"><input class="price-input" type="number" step="any" min="0" data-price="${esc(r.ticker)}" value="${
          r.price ?? ''
        }" placeholder="Precio" title="${r.priceDate ? 'Actualizado el ' + fmtDate(r.priceDate) : 'Sin precio'}" /></td>
        <td class="num">${money(r.value)}</td>
        <td class="num ${cls(r.pnl)}">${money(r.pnl, { sign: true })}</td>
        <td class="num ${cls(r.pnl)}">${pct(r.pnlPct)}</td>
        <td class="num"><span class="weight-bar" style="width:${Math.max(2, (r.weight / maxW) * 50)}px"></span>${pct(r.weight, false)}</td>
      </tr>`
      )
      .join('');
    tbl.innerHTML = `<thead><tr>
        <th>Valor</th><th class="num">Acciones</th><th class="num">Precio medio</th><th class="num">Invertido</th>
        <th class="num">Precio actual</th><th class="num">Valor actual</th><th class="num">G/P €</th><th class="num">G/P %</th><th class="num">Peso</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td>Total</td><td></td><td></td><td class="num">${money(pf.totals.invested)}</td><td></td>
        <td class="num">${val.value ? money(val.value) : '—'}</td>
        <td class="num ${cls(val.unrealized)}">${val.costPriced ? money(val.unrealized, { sign: true }) : '—'}</td>
        <td class="num ${cls(val.unrealized)}">${val.costPriced ? pct(val.unrealizedPct) : '—'}</td><td></td>
      </tr></tfoot>`;
  }

  function renderSimTickers() {
    const sel = $('#simTicker');
    const cur = sel.value;
    sel.innerHTML =
      '<option value="">— Elige —</option>' +
      pf.positions.map((p) => `<option value="${esc(p.ticker)}">${esc(p.ticker)} (${numFmt(p.qty)} acc.)</option>`).join('');
    if (pf.positions.some((p) => p.ticker === cur)) sel.value = cur;
    runSim();
  }

  function runSim() {
    const f = $('#simForm');
    const t = f.ticker.value;
    const out = $('#simResult');
    if (!t) {
      out.innerHTML = 'Elige un valor y escribe cantidad y precio.';
      out.className = 'sim-result muted';
      return;
    }
    const q = C.num(f.quantity.value);
    const p = C.num(f.price.value);
    const pos = pf.positions.find((x) => x.ticker === t);
    if (!q || !p) {
      out.className = 'sim-result muted';
      out.innerHTML = `Tienes <strong>${numFmt(pos.qty)}</strong> acciones de ${esc(t)} a un precio medio de <strong>${money(
        pos.avg,
        { precise: true }
      )}</strong>. Para no perder dinero tendrías que vender por encima de ese precio (más la comisión de venta).`;
      return;
    }
    const sim = C.simulateSale(state.ops, { ticker: t, quantity: q, price: p, commission: f.commission.value, date: today() });
    sim.requested = q;
    out.className = 'sim-result';
    out.innerHTML = saleSummaryHtml(sim);
  }

  function saleSummaryHtml(sim) {
    const r = sim.result;
    if (!r) return '';
    const over = (sim.requested ?? 0) > sim.available + 1e-9;
    const tax = r.gain > 0 ? C.estimateSavingsTax(r.gain) : 0;
    return `
      ${over ? `<p class="warn">Solo tienes ${numFmt(sim.available)} acciones en esa fecha.</p>` : ''}
      <div class="summary-grid">
        <div><span>Ganancia / pérdida</span><strong class="big ${cls(r.gain)}">${money(r.gain, { sign: true })}</strong></div>
        <div><span>Rentabilidad</span><strong class="${cls(r.gain)}">${pct(r.pct)}</strong></div>
        <div><span>Ingreso neto (tras comisión)</span><strong>${money(r.proceeds)}</strong></div>
        <div><span>Coste de compra (FIFO)</span><strong>${money(r.cost)}</strong></div>
        <div><span>Acciones disponibles</span><strong>${numFmt(sim.available)}</strong></div>
        ${r.gain > 0 ? `<div><span>IRPF aprox. (si fuera tu única ganancia)</span><strong>${money(tax)}</strong></div>` : ''}
      </div>`;
  }

  // ---------- Operaciones ----------
  function renderOps() {
    const q = $('#opSearch').value.trim().toLowerCase();
    const type = $('#opTypeFilter').value;
    const year = $('#opYearFilter').value;

    const years = [...new Set(state.ops.map((o) => o.date.slice(0, 4)))].sort().reverse();
    const ysel = $('#opYearFilter');
    const curY = ysel.value;
    ysel.innerHTML = '<option value="">Todos los años</option>' + years.map((y) => `<option>${y}</option>`).join('');
    ysel.value = years.includes(curY) ? curY : '';

    const list = C.sortOps(state.ops)
      .reverse()
      .filter((o) => (!type || o.type === type) && (!year || o.date.startsWith(year)))
      .filter((o) => !q || [o.ticker, o.name, o.notes].some((x) => String(x || '').toLowerCase().includes(q)));

    $('#opCount').textContent = `${list.length} de ${state.ops.length} operaciones`;
    const tbl = $('#opsTable');
    if (!list.length) {
      tbl.innerHTML = `<tbody><tr class="empty-row"><td>${
        state.ops.length ? 'Ninguna operación coincide con el filtro.' : 'Aún no has registrado operaciones.'
      }</td></tr></tbody>`;
      return;
    }
    const warnIds = new Set(pf.warnings.map((w) => w.opId));
    const rows = list
      .map((o) => {
        const r = pf.perOp[o.id] || {};
        const isDiv = o.type === 'dividendo';
        let total = '—';
        let result = '';
        if (o.type === 'compra') total = money(r.total);
        if (o.type === 'venta') {
          total = money(r.proceeds);
          result = `<span class="${cls(r.gain)}">${money(r.gain, { sign: true })}<span class="sub">${pct(r.pct)}</span></span>`;
        }
        if (isDiv) {
          total = money(r.net);
          result = `<span class="pos">${money(r.net, { sign: true })}</span>`;
        }
        return `<tr>
          <td>${fmtDate(o.date)}</td>
          <td><span class="badge ${o.type}">${o.type[0].toUpperCase() + o.type.slice(1)}</span>${
          warnIds.has(o.id) ? ' <span title="Tiene un aviso">⚠</span>' : ''
        }</td>
          <td><span class="ticker">${esc(C.normTicker(o.ticker))}</span>${
          o.name || o.notes ? `<span class="sub">${esc([o.name, o.notes].filter(Boolean).join(' · '))}</span>` : ''
        }</td>
          <td class="num">${isDiv ? '—' : numFmt(C.num(o.quantity))}</td>
          <td class="num">${isDiv ? money(C.num(o.price)) + '<span class="sub">bruto</span>' : money(C.num(o.price), { precise: true })}</td>
          <td class="num">${money(C.num(o.commission))}${isDiv ? '<span class="sub">retención</span>' : ''}</td>
          <td class="num">${total}</td>
          <td class="num">${result}</td>
          <td class="num">
            <button class="btn sm" data-edit="${o.id}">Editar</button>
            <button class="btn sm danger" data-del="${o.id}" aria-label="Borrar">✕</button>
          </td>
        </tr>`;
      })
      .join('');
    tbl.innerHTML = `<thead><tr><th>Fecha</th><th>Tipo</th><th>Valor</th><th class="num">Acciones</th><th class="num">Precio</th>
      <th class="num">Comisión</th><th class="num">Total</th><th class="num">Resultado</th><th></th></tr></thead><tbody>${rows}</tbody>`;
  }

  // ---------- Fiscalidad ----------
  function renderFiscal() {
    const years = C.yearSummary(pf.realized, pf.dividends);
    const sel = $('#fiscalYear');
    const cur = sel.value;
    const ys = years.map((y) => y.year).reverse();
    if (!ys.length) ys.push(today().slice(0, 4));
    sel.innerHTML = ys.map((y) => `<option>${y}</option>`).join('');
    sel.value = ys.includes(cur) ? cur : ys[0];
    const y = sel.value;
    const s = years.find((x) => x.year === y) || {
      gains: 0, losses: 0, net: 0, sales: 0, divGross: 0, divWithholding: 0, divNet: 0, proceeds: 0, cost: 0,
    };

    // Base del ahorro con compensación del 25 % entre ganancias patrimoniales y dividendos
    let base;
    if (s.net >= 0) base = s.net + s.divGross;
    else base = s.divGross - Math.min(-s.net, 0.25 * s.divGross);
    const tax = C.estimateSavingsTax(base);
    const toPay = tax - s.divWithholding;

    $('#fiscalKpis').innerHTML = [
      kpi('Resultado neto de ventas', money(s.net, { sign: true }), `${s.sales} venta${s.sales === 1 ? '' : 's'} en ${y}`, '', cls(s.net)),
      kpi('Ganancias', money(s.gains), 'Ventas con beneficio', '', 'pos'),
      kpi('Pérdidas', money(s.losses), 'Ventas con pérdida', '', s.losses < 0 ? 'neg' : ''),
      kpi('Dividendos brutos', money(s.divGross), `Retenido: ${money(s.divWithholding)}`),
      kpi('Base del ahorro (aprox.)', money(Math.max(0, base)), 'Ventas + dividendos'),
      kpi('IRPF estimado', money(tax), toPay >= 0 ? `≈ ${money(toPay)} a pagar tras retenciones` : `≈ ${money(-toPay)} a devolver`),
    ].join('');

    const sales = pf.realized.filter((r) => r.date.startsWith(y)).reverse();
    $('#salesTable').innerHTML = sales.length
      ? `<thead><tr><th>Venta</th><th>Valor</th><th class="num">Acciones</th><th>Compra</th><th class="num">Valor de adquisición</th>
        <th class="num">Valor de transmisión</th><th class="num">G/P €</th><th class="num">G/P %</th><th class="num">Días</th></tr></thead><tbody>${sales
          .map(
            (r) => `<tr>
          <td>${fmtDate(r.date)}</td>
          <td><span class="ticker">${esc(r.ticker)}</span>${r.washSale ? ' <span title="Posible regla de los dos meses">⚠</span>' : ''}</td>
          <td class="num">${numFmt(r.qty)}</td>
          <td>${r.lots.length > 1 ? `${r.lots.length} lotes<span class="sub">desde ${fmtDate(r.lots[0].date)}</span>` : fmtDate(r.lots[0]?.date)}</td>
          <td class="num">${money(r.cost)}</td>
          <td class="num">${money(r.proceeds)}</td>
          <td class="num ${cls(r.gain)}">${money(r.gain, { sign: true })}</td>
          <td class="num ${cls(r.gain)}">${pct(r.pct)}</td>
          <td class="num">${r.days}</td>
        </tr>`
          )
          .join('')}</tbody>
        <tfoot><tr><td>Total</td><td></td><td></td><td></td><td class="num">${money(s.cost)}</td><td class="num">${money(
          s.proceeds
        )}</td><td class="num ${cls(s.net)}">${money(s.net, { sign: true })}</td><td></td><td></td></tr></tfoot>`
      : `<tbody><tr class="empty-row"><td>No hay ventas en ${y}.</td></tr></tbody>`;

    const divs = pf.dividends.filter((d) => d.date.startsWith(y)).reverse();
    $('#divTable').innerHTML = divs.length
      ? `<thead><tr><th>Fecha</th><th>Valor</th><th class="num">Bruto</th><th class="num">Retención</th><th class="num">Neto</th></tr></thead>
        <tbody>${divs
          .map(
            (d) => `<tr><td>${fmtDate(d.date)}</td><td class="ticker">${esc(d.ticker)}</td><td class="num">${money(d.gross)}</td>
            <td class="num">${money(d.withholding)}</td><td class="num">${money(d.net)}</td></tr>`
          )
          .join('')}</tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num">${money(s.divGross)}</td><td class="num">${money(
          s.divWithholding
        )}</td><td class="num">${money(s.divNet)}</td></tr></tfoot>`
      : `<tbody><tr class="empty-row"><td>No hay dividendos en ${y}.</td></tr></tbody>`;
  }

  function renderDatalist() {
    const tickers = [...new Set(state.ops.map((o) => C.normTicker(o.ticker)))].sort();
    $('#tickerList').innerHTML = tickers
      .map((t) => `<option value="${esc(t)}">${esc(pf.names[t] || '')}</option>`)
      .join('');
  }

  // ---------- Gráficos ----------
  function chartMsg(canvas, msg) {
    const box = canvas.parentElement;
    let m = box.querySelector('.chart-empty');
    if (msg) {
      if (!m) {
        m = document.createElement('div');
        m.className = 'chart-empty';
        box.appendChild(m);
      }
      m.textContent = msg;
      canvas.style.visibility = 'hidden';
    } else {
      if (m) m.remove();
      canvas.style.visibility = '';
    }
  }

  function renderCharts() {
    Object.values(charts).forEach((c) => c.destroy());
    charts = {};
    if (!window.Chart) {
      $$('canvas').forEach((c) => chartMsg(c, 'No se pudo cargar la librería de gráficos (¿sin conexión?).'));
      return;
    }
    const ink = css('--text-secondary');
    const muted = css('--text-muted');
    const grid = css('--grid');
    const surface = css('--surface-1');
    const s1 = css('--series-1');
    const s2 = css('--series-2');
    const good = css('--good');
    const bad = css('--bad');

    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 12;
    Chart.defaults.color = muted;
    Chart.defaults.plugins.tooltip.backgroundColor = css('--text-primary');
    Chart.defaults.plugins.tooltip.titleColor = surface;
    Chart.defaults.plugins.tooltip.bodyColor = surface;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.boxPadding = 4;
    Chart.defaults.maintainAspectRatio = false;

    const moneyTick = (v) => money(v, { decimals: 0 });
    const yMoney = { grid: { color: grid }, border: { display: false }, ticks: { callback: moneyTick, maxTicksLimit: 6 } };
    const dateTick = (v) => new Date(v).toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });

    // 1. Capital invertido (escalonado)
    const tl = dedupeByDate(pf.timeline);
    const cvInv = $('#chartInvested');
    if (tl.length) {
      chartMsg(cvInv, null);
      const pts = tl.map((p) => ({ x: Date.parse(p.date), y: p.invested }));
      const now = Date.parse(today());
      if (pts[pts.length - 1].x < now) pts.push({ x: now, y: pts[pts.length - 1].y });
      charts.inv = new Chart(cvInv, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Capital invertido',
              data: pts,
              stepped: 'before',
              borderColor: s1,
              backgroundColor: hexA(s1, 0.12),
              fill: true,
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 5,
              pointHoverBackgroundColor: s1,
              pointHoverBorderColor: surface,
              pointHoverBorderWidth: 2,
            },
          ],
        },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (it) => new Date(it[0].parsed.x).toLocaleDateString('es-ES'),
                label: (it) => ' ' + money(it.parsed.y),
              },
            },
          },
          scales: {
            x: { type: 'linear', grid: { display: false }, ticks: { callback: dateTick, maxTicksLimit: 7 } },
            y: { ...yMoney, beginAtZero: true },
          },
        },
      });
    } else chartMsg(cvInv, 'Sin datos');

    // 2. Distribución (barras horizontales, mejor que un donut para comparar pesos)
    const cvDist = $('#chartDist');
    const distRows = val.rows.slice().sort((a, b) => b.weight - a.weight);
    let dist = distRows.slice(0, 10).map((r) => ({ label: r.ticker, w: r.weight, v: r.value ?? r.cost }));
    if (distRows.length > 10) {
      const rest = distRows.slice(10);
      dist.push({ label: 'Otros', w: rest.reduce((s, r) => s + r.weight, 0), v: rest.reduce((s, r) => s + (r.value ?? r.cost), 0) });
    }
    $('#distNote').textContent = val.allPriced ? 'Peso de cada valor a precio actual' : 'Peso de cada valor (a coste si no hay precio actual)';
    if (dist.length) {
      chartMsg(cvDist, null);
      charts.dist = new Chart(cvDist, {
        type: 'bar',
        data: {
          labels: dist.map((d) => d.label),
          datasets: [{ data: dist.map((d) => d.w * 100), backgroundColor: s1, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 }],
        },
        options: {
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (it) => ` ${pct(dist[it.dataIndex].w, false)} · ${money(dist[it.dataIndex].v)}` } },
          },
          scales: {
            x: { grid: { color: grid }, border: { display: false }, ticks: { callback: (v) => v + ' %' }, beginAtZero: true },
            y: { grid: { display: false }, ticks: { color: ink } },
          },
        },
      });
    } else chartMsg(cvDist, 'No tienes posiciones abiertas');

    // 3. G/P latente por valor
    const cvPnl = $('#chartPnl');
    const pnlRows = val.rows.filter((r) => r.pnl != null).sort((a, b) => b.pnl - a.pnl);
    if (pnlRows.length) {
      chartMsg(cvPnl, null);
      charts.pnl = new Chart(cvPnl, {
        type: 'bar',
        data: {
          labels: pnlRows.map((r) => (r.pnl >= 0 ? '▲ ' : '▼ ') + r.ticker),
          datasets: [
            {
              data: pnlRows.map((r) => r.pnl),
              backgroundColor: pnlRows.map((r) => (r.pnl >= 0 ? good : bad)),
              borderRadius: 4,
              borderSkipped: 'start',
              maxBarThickness: 22,
            },
          ],
        },
        options: {
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (it) => ` ${money(pnlRows[it.dataIndex].pnl, { sign: true })} (${pct(pnlRows[it.dataIndex].pnlPct)})`,
              },
            },
          },
          scales: {
            x: { ...yMoney },
            y: { grid: { display: false }, ticks: { color: ink } },
          },
        },
      });
    } else chartMsg(cvPnl, val.rows.length ? 'Introduce el precio actual de tus valores en la pestaña «Cartera»' : 'No tienes posiciones abiertas');

    // 4. Resultados por año
    const cvY = $('#chartYears');
    const years = C.yearSummary(pf.realized, pf.dividends);
    if (years.length) {
      chartMsg(cvY, null);
      charts.years = new Chart(cvY, {
        type: 'bar',
        data: {
          labels: years.map((y) => y.year),
          datasets: [
            { label: 'Ventas (neto)', data: years.map((y) => y.net), backgroundColor: s1, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 36 },
            { label: 'Dividendos netos', data: years.map((y) => y.divNet), backgroundColor: s2, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 36 },
          ],
        },
        options: {
          plugins: {
            legend: { position: 'top', align: 'end', labels: { boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2, color: ink } },
            tooltip: { callbacks: { label: (it) => ` ${it.dataset.label}: ${money(it.parsed.y, { sign: true })}` } },
          },
          scales: { x: { grid: { display: false } }, y: yMoney },
        },
      });
    } else chartMsg(cvY, 'Aún no has vendido ni cobrado dividendos');

    // 5. Realizado acumulado
    const cvR = $('#chartRealizedCum');
    const rl = tl.filter((p, i) => i === 0 || p.realizedCum + p.dividendsCum !== tl[i - 1].realizedCum + tl[i - 1].dividendsCum);
    if (pf.realized.length || pf.dividends.length) {
      chartMsg(cvR, null);
      const pts = rl.map((p) => ({ x: Date.parse(p.date), y: p.realizedCum + p.dividendsCum }));
      const now = Date.parse(today());
      if (pts.length && pts[pts.length - 1].x < now) pts.push({ x: now, y: pts[pts.length - 1].y });
      charts.rcum = new Chart(cvR, {
        type: 'line',
        data: {
          datasets: [
            {
              label: 'Realizado acumulado',
              data: pts,
              stepped: 'before',
              borderColor: s1,
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 5,
              pointHoverBackgroundColor: s1,
              pointHoverBorderColor: surface,
              pointHoverBorderWidth: 2,
              fill: { target: 'origin', above: hexA(good, 0.1), below: hexA(bad, 0.1) },
            },
          ],
        },
        options: {
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (it) => new Date(it[0].parsed.x).toLocaleDateString('es-ES'),
                label: (it) => ' ' + money(it.parsed.y, { sign: true }),
              },
            },
          },
          scales: {
            x: { type: 'linear', grid: { display: false }, ticks: { callback: dateTick, maxTicksLimit: 8 } },
            y: yMoney,
          },
        },
      });
    } else chartMsg(cvR, 'Aún no has vendido ni cobrado dividendos');
  }

  function dedupeByDate(tl) {
    const out = [];
    for (const p of tl) {
      if (out.length && out[out.length - 1].date === p.date) out[out.length - 1] = p;
      else out.push(p);
    }
    return out;
  }
  function hexA(hex, a) {
    const h = hex.replace('#', '');
    if (h.length !== 6) return hex;
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }

  // ---------- Diálogo de operación ----------
  const dlg = $('#opDialog');
  const form = $('#opForm');

  function openOp(op) {
    editingId = op ? op.id : null;
    form.reset();
    $('#opDialogTitle').textContent = op ? 'Editar operación' : 'Nueva operación';
    $('#opSubmit').textContent = op ? 'Guardar cambios' : 'Guardar';
    const d = op || { type: 'compra', date: today(), commission: state.settings.lastCommission ?? 0 };
    form.querySelector(`input[name="type"][value="${d.type}"]`).checked = true;
    form.date.value = d.date || today();
    form.ticker.value = d.ticker || '';
    form.name.value = d.name || '';
    form.quantity.value = d.quantity ?? '';
    form.price.value = d.price ?? '';
    form.commission.value = d.commission ?? 0;
    form.notes.value = d.notes || '';
    syncType();
    dlg.showModal();
    setTimeout(() => (op ? form.price : form.ticker).focus(), 30);
  }

  function currentType() {
    return form.querySelector('input[name="type"]:checked').value;
  }

  function syncType() {
    const t = currentType();
    const isDiv = t === 'dividendo';
    $('[data-for="trade"]', form).classList.toggle('hidden', isDiv);
    form.quantity.required = !isDiv;
    $('[data-label="price"]', form).textContent = isDiv ? 'Importe bruto cobrado' : 'Precio por acción';
    $('[data-label="commission"]', form).textContent = isDiv ? 'Retención (Hacienda)' : 'Comisión';
    updatePreview();
  }

  function updatePreview() {
    const t = currentType();
    const ticker = C.normTicker(form.ticker.value);
    const q = C.num(form.quantity.value);
    const p = C.num(form.price.value);
    const c = C.num(form.commission.value);
    const box = $('#opPreview');
    const others = state.ops.filter((o) => o.id !== editingId);
    const pfo = C.computePortfolio(others.filter((o) => o.date <= (form.date.value || today())));
    const pos = pfo.positions.find((x) => x.ticker === ticker);
    const posLine = pos
      ? `<p class="muted small" style="margin:0 0 8px">Tienes ${numFmt(pos.qty)} acciones de ${esc(ticker)} · precio medio ${money(pos.avg, { precise: true })}${
          t === 'venta' ? ` · <a href="#" id="sellAll">vender todas</a>` : ''
        }</p>`
      : '';

    if (t === 'compra') {
      if (!q || !p) return void (box.innerHTML = posLine);
      const total = q * p + c;
      const unit = total / q;
      let extra = '';
      if (pos) {
        const newAvg = (pos.cost + total) / (pos.qty + q);
        extra = `<div><span>Nuevo precio medio</span><strong>${money(newAvg, { precise: true })}</strong></div>`;
      }
      box.innerHTML = `${posLine}<div class="summary-grid">
        <div><span>Total a pagar</span><strong class="big">${money(total)}</strong></div>
        <div><span>Coste por acción (con comisión)</span><strong>${money(unit, { precise: true })}</strong></div>
        ${extra}
      </div>`;
    } else if (t === 'venta') {
      if (!ticker) return void (box.innerHTML = '');
      if (!pos) return void (box.innerHTML = `<p class="warn">No tienes acciones de ${esc(ticker)} en esa fecha.</p>`);
      if (!q || !p) return void (box.innerHTML = posLine);
      const sim = C.simulateSale(state.ops, { ticker, quantity: q, price: p, commission: c, date: form.date.value, excludeId: editingId });
      sim.requested = q;
      box.innerHTML = posLine + saleSummaryHtml(sim);
    } else {
      if (!p) return void (box.innerHTML = '');
      box.innerHTML = `<div class="summary-grid">
        <div><span>Neto cobrado</span><strong class="big pos">${money(p - c)}</strong></div>
        <div><span>Retención aplicada</span><strong>${pct(c / p, false)}</strong></div>
        ${pos ? `<div><span>Rentabilidad sobre tu coste</span><strong>${pct(p / pos.cost, false)}</strong></div>` : ''}
      </div>`;
    }
  }

  form.addEventListener('input', (e) => {
    if (e.target.name === 'type') syncType();
    else updatePreview();
  });
  $('#opPreview').addEventListener('click', (e) => {
    if (e.target.id === 'sellAll') {
      e.preventDefault();
      const pfo = C.computePortfolio(state.ops.filter((o) => o.id !== editingId && o.date <= form.date.value));
      const pos = pfo.positions.find((x) => x.ticker === C.normTicker(form.ticker.value));
      if (pos) form.quantity.value = +pos.qty.toFixed(6);
      updatePreview();
    }
  });
  $$('[data-close]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const t = currentType();
    const op = {
      id: editingId || uid(),
      type: t,
      date: form.date.value,
      ticker: C.normTicker(form.ticker.value),
      name: form.name.value.trim(),
      quantity: t === 'dividendo' ? 0 : C.num(form.quantity.value),
      price: C.num(form.price.value),
      commission: C.num(form.commission.value),
      notes: form.notes.value.trim(),
    };
    if (!op.date || !op.ticker) return toast('Faltan la fecha o el valor.');
    if (t !== 'dividendo' && op.quantity <= 0) return toast('El número de acciones debe ser mayor que 0.');
    if (op.price <= 0) return toast(t === 'dividendo' ? 'Indica el importe cobrado.' : 'Indica el precio por acción.');
    if (t === 'venta') {
      const sim = C.simulateSale(state.ops, { ticker: op.ticker, quantity: op.quantity, price: op.price, commission: op.commission, date: op.date, excludeId: editingId });
      if (sim.available + 1e-9 < op.quantity && !confirm(`Solo tienes ${numFmt(sim.available)} acciones de ${op.ticker} en esa fecha. ¿Guardar igualmente?`)) return;
    }
    if (editingId) {
      const i = state.ops.findIndex((o) => o.id === editingId);
      op.seq = state.ops[i].seq;
      state.ops[i] = op;
    } else {
      op.seq = ++state.seq;
      state.ops.push(op);
    }
    if (t !== 'dividendo') state.settings.lastCommission = op.commission;
    // Si el nombre es nuevo, aplicarlo a las demás operaciones del mismo valor
    if (op.name) state.ops.forEach((o) => C.normTicker(o.ticker) === op.ticker && !o.name && (o.name = op.name));
    // Una compra/venta da un precio reciente de referencia si no hay otro más nuevo
    if (t !== 'dividendo') {
      const prev = state.prices[op.ticker];
      if (!prev || !prev.date || prev.date <= op.date) state.prices[op.ticker] = { price: op.price, date: op.date };
    }
    save();
    dlg.close();
    render();
    toast(editingId ? 'Operación actualizada' : 'Operación guardada');
    editingId = null;
  });

  // ---------- Eventos generales ----------
  function showTab(name) {
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + name));
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    if (name === 'resumen' && state.ops.length) renderCharts();
  }
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  $('#newOpBtn').addEventListener('click', () => openOp());
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (!a) return;
    if (a.dataset.action === 'new-op') openOp();
    if (a.dataset.action === 'demo') loadDemo();
  });

  $('#opsTable').addEventListener('click', (e) => {
    const ed = e.target.closest('[data-edit]');
    const del = e.target.closest('[data-del]');
    if (ed) openOp(state.ops.find((o) => o.id === ed.dataset.edit));
    if (del) {
      const op = state.ops.find((o) => o.id === del.dataset.del);
      if (op && confirm(`¿Borrar la ${op.type} de ${op.ticker} del ${fmtDate(op.date)}?`)) {
        state.ops = state.ops.filter((o) => o.id !== op.id);
        save();
        render();
        toast('Operación borrada');
      }
    }
  });
  ['#opSearch', '#opTypeFilter', '#opYearFilter'].forEach((s) => $(s).addEventListener('input', renderOps));
  $('#fiscalYear').addEventListener('change', renderFiscal);

  $('#positionsTable').addEventListener('change', (e) => {
    const t = e.target.dataset.price;
    if (!t) return;
    const v = C.num(e.target.value);
    if (v > 0) state.prices[t] = { price: v, date: today() };
    else delete state.prices[t];
    save();
    render();
  });
  $('#positionsTable').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.price) e.target.blur();
  });

  $('#simForm').addEventListener('input', runSim);
  $('#simTicker').addEventListener('change', () => {
    const f = $('#simForm');
    const pos = pf.positions.find((p) => p.ticker === f.ticker.value);
    if (pos) {
      f.quantity.value = +pos.qty.toFixed(6);
      const pr = state.prices[pos.ticker];
      if (pr) f.price.value = pr.price;
      if (state.settings.lastCommission != null) f.commission.value = state.settings.lastCommission;
    }
    runSim();
  });

  $('#themeBtn').addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('gfinanzas.theme', root.dataset.theme); } catch (e) {}
    if (state.ops.length) renderCharts();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => state.ops.length && renderCharts());

  $('#currencySel').addEventListener('change', (e) => {
    state.settings.currency = e.target.value;
    save();
    render();
  });

  // ---------- Importar / exportar ----------
  $('#exportJson').addEventListener('click', () => {
    download(`gfinanzas-copia-${today()}.json`, JSON.stringify(state, null, 2), 'application/json');
  });
  $('#importJson').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.ops)) throw new Error('Formato no válido');
      if (!confirm(`Esto sustituirá tus datos actuales por los de la copia (${data.ops.length} operaciones). ¿Continuar?`)) return;
      state = { ...emptyState(), ...data, settings: { ...emptyState().settings, ...(data.settings || {}) } };
      save();
      render();
      toast('Copia restaurada');
    } catch (err) {
      alert('No se pudo leer el archivo: ' + err.message);
    }
  });

  const csvNum = (v) => String(+(+v || 0).toFixed(6)).replace('.', ',');
  const csvCell = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  $('#exportCsv').addEventListener('click', () => {
    const head = 'fecha;tipo;valor;nombre;cantidad;precio;comision;notas';
    const lines = C.sortOps(state.ops).map((o) =>
      [o.date, o.type, o.ticker, o.name, csvNum(o.quantity), csvNum(o.price), csvNum(o.commission), o.notes].map(csvCell).join(';')
    );
    download(`gfinanzas-operaciones-${today()}.csv`, '﻿' + [head, ...lines].join('\n'), 'text/csv;charset=utf-8');
  });

  $('#exportYearCsv').addEventListener('click', () => {
    const y = $('#fiscalYear').value;
    const head = 'fecha_transmision;valor;cantidad;fecha_adquisicion;valor_adquisicion;valor_transmision;ganancia_perdida;regla_2_meses';
    const lines = [];
    for (const r of pf.realized.filter((r) => r.date.startsWith(y))) {
      // Una línea por lote, repartiendo el ingreso de la venta proporcionalmente
      for (const l of r.lots) {
        const share = r.qty > 0 ? l.qty / r.qty : 0;
        const acq = l.qty * l.unit;
        const trans = r.proceeds * share;
        lines.push(
          [r.date, r.ticker, csvNum(l.qty), l.date, csvNum(acq.toFixed(2)), csvNum(trans.toFixed(2)), csvNum((trans - acq).toFixed(2)), r.washSale ? 'posible' : '']
            .map(csvCell)
            .join(';')
        );
      }
    }
    if (!lines.length) return toast(`No hay ventas en ${y}`);
    download(`gfinanzas-ventas-${y}.csv`, '﻿' + [head, ...lines].join('\n'), 'text/csv;charset=utf-8');
  });

  $('#importCsv').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = (await file.text()).replace(/^﻿/, '');
      const ops = parseCsv(text);
      if (!ops.length) throw new Error('No se encontraron operaciones válidas.');
      if (!confirm(`Se añadirán ${ops.length} operaciones a las que ya tienes. ¿Continuar?`)) return;
      ops.forEach((o) => {
        o.seq = ++state.seq;
        state.ops.push(o);
      });
      save();
      render();
      toast(`${ops.length} operaciones importadas`);
    } catch (err) {
      alert('No se pudo importar: ' + err.message);
    }
  });

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const sep = [';', '\t', ','].sort((a, b) => lines[0].split(b).length - lines[0].split(a).length)[0];
    const split = (line) => {
      const out = [];
      let cur = '';
      let q = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') q = false;
          else cur += ch;
        } else if (ch === '"') q = true;
        else if (ch === sep) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const head = split(lines[0]).map(norm);
    const idx = (names) => head.findIndex((h) => names.includes(h));
    const col = {
      date: idx(['fecha', 'date']),
      type: idx(['tipo', 'type', 'operacion']),
      ticker: idx(['valor', 'ticker', 'simbolo', 'symbol', 'accion']),
      name: idx(['nombre', 'name', 'empresa']),
      quantity: idx(['cantidad', 'acciones', 'quantity', 'titulos']),
      price: idx(['precio', 'price', 'importe']),
      commission: idx(['comision', 'commission', 'comisiones', 'retencion']),
      notes: idx(['notas', 'notes', 'nota']),
    };
    if (col.date < 0 || col.type < 0 || col.ticker < 0 || col.price < 0) throw new Error('Faltan columnas: se necesitan fecha, tipo, valor y precio.');
    const parseNum = (s) => {
      s = String(s || '').replace(/[^\d,.\-]/g, '');
      if (sep !== ',' || /,\d{1,6}$/.test(s)) {
        if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
      }
      return parseFloat(s) || 0;
    };
    const parseDate = (s) => {
      s = String(s || '').trim();
      let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
      m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
      if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      return '';
    };
    const typeMap = { compra: 'compra', buy: 'compra', c: 'compra', venta: 'venta', sell: 'venta', v: 'venta', dividendo: 'dividendo', dividend: 'dividendo', d: 'dividendo' };
    const out = [];
    for (const line of lines.slice(1)) {
      const r = split(line);
      const type = typeMap[norm(r[col.type] || '')];
      const date = parseDate(r[col.date]);
      const ticker = C.normTicker(r[col.ticker]);
      if (!type || !date || !ticker) continue;
      out.push({
        id: uid(),
        type,
        date,
        ticker,
        name: col.name >= 0 ? r[col.name] : '',
        quantity: type === 'dividendo' ? 0 : Math.abs(parseNum(r[col.quantity])),
        price: Math.abs(parseNum(r[col.price])),
        commission: col.commission >= 0 ? Math.abs(parseNum(r[col.commission])) : 0,
        notes: col.notes >= 0 ? r[col.notes] : '',
      });
    }
    return out;
  }

  $('#wipeBtn').addEventListener('click', () => {
    if (!state.ops.length) return toast('No hay datos que borrar');
    if (!confirm('¿Seguro que quieres borrar TODAS tus operaciones? Descarga antes una copia si la necesitas.')) return;
    if (!confirm('Última confirmación: esto no se puede deshacer.')) return;
    state = { ...emptyState(), settings: state.settings };
    save();
    render();
    toast('Datos borrados');
  });

  function loadDemo() {
    if (state.ops.length && !confirm('Se sustituirán tus datos actuales por datos de ejemplo. ¿Continuar?')) return;
    const D = (date, type, ticker, name, quantity, price, commission, notes = '') => ({ date, type, ticker, name, quantity, price, commission, notes });
    const ops = [
      D('2023-02-14', 'compra', 'SAN', 'Banco Santander', 500, 3.42, 5),
      D('2023-04-03', 'compra', 'ITX', 'Inditex', 40, 29.8, 5),
      D('2023-06-20', 'compra', 'AAPL', 'Apple', 15, 168.5, 8),
      D('2023-09-11', 'compra', 'IBE', 'Iberdrola', 120, 10.6, 5),
      D('2023-11-02', 'dividendo', 'SAN', '', 0, 41.5, 7.89),
      D('2024-01-15', 'compra', 'SAN', 'Banco Santander', 300, 3.75, 5),
      D('2024-02-01', 'dividendo', 'IBE', '', 0, 27.6, 5.24),
      D('2024-03-18', 'compra', 'MSFT', 'Microsoft', 6, 382.0, 8),
      D('2024-05-06', 'dividendo', 'SAN', '', 0, 76.0, 14.44),
      D('2024-07-22', 'venta', 'ITX', 'Inditex', 20, 46.1, 5, 'Recojo beneficios'),
      D('2024-10-09', 'compra', 'NKE', 'Nike', 20, 82.0, 8),
      D('2024-11-04', 'dividendo', 'ITX', '', 0, 15.4, 2.93),
      D('2025-02-03', 'venta', 'NKE', 'Nike', 20, 71.5, 8, 'Stop loss'),
      D('2025-03-10', 'venta', 'SAN', 'Banco Santander', 600, 6.1, 6),
      D('2025-05-05', 'dividendo', 'SAN', '', 0, 34.0, 6.46),
      D('2025-06-16', 'compra', 'ITX', 'Inditex', 15, 44.2, 5),
      D('2025-09-08', 'compra', 'AAPL', 'Apple', 10, 232.0, 8),
      D('2026-01-20', 'dividendo', 'IBE', '', 0, 38.4, 7.3),
      D('2026-04-14', 'venta', 'IBE', 'Iberdrola', 40, 17.9, 5),
      D('2026-06-02', 'compra', 'MSFT', 'Microsoft', 3, 455.0, 8),
    ];
    state = { ...emptyState(), settings: state.settings };
    ops.forEach((o) => {
      o.id = uid();
      o.seq = ++state.seq;
      state.ops.push(o);
    });
    // Precios "actuales" de ejemplo: cámbialos por los reales
    const d = today();
    state.prices = {
      SAN: { price: 8.9, date: d },
      ITX: { price: 51.3, date: d },
      AAPL: { price: 245.0, date: d },
      IBE: { price: 18.2, date: d },
      MSFT: { price: 470.0, date: d },
    };
    state.settings.lastCommission = 5;
    save();
    render();
    showTab('resumen');
    toast('Datos de ejemplo cargados');
  }

  // ---------- Inicio ----------
  render();
  const initial = location.hash.replace('#', '');
  if (initial && $('#tab-' + initial)) showTab(initial);
})();

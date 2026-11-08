/*
 * gfinanzas — motor de cálculo
 * Funciones puras (sin DOM) para poder probarlas en Node y en el navegador.
 *
 * Criterio de coste: FIFO (las primeras acciones compradas son las primeras
 * vendidas), que es el que aplica la Agencia Tributaria en España.
 * Las comisiones de compra se suman al coste; las de venta se restan del ingreso.
 */
(function (root) {
  'use strict';

  const EPS = 1e-9;
  const DAY = 86400000;

  function num(v) {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function normTicker(t) {
    return String(t || '').trim().toUpperCase();
  }

  function sortOps(ops) {
    return ops
      .map((op, i) => ({ op, i }))
      .sort((a, b) => {
        if (a.op.date !== b.op.date) return a.op.date < b.op.date ? -1 : 1;
        // Mismo día: compras antes que ventas, y luego orden de alta
        const rank = (o) => (o.type === 'compra' ? 0 : o.type === 'venta' ? 1 : 2);
        const r = rank(a.op) - rank(b.op);
        if (r !== 0) return r;
        return (a.op.seq ?? a.i) - (b.op.seq ?? b.i);
      })
      .map((x) => x.op);
  }

  function daysBetween(a, b) {
    return Math.round((Date.parse(b) - Date.parse(a)) / DAY);
  }

  function addMonths(dateStr, m) {
    const d = new Date(dateStr + 'T00:00:00Z');
    d.setUTCMonth(d.getUTCMonth() + m);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Recorre todas las operaciones y devuelve posiciones abiertas, ventas
   * realizadas, dividendos, evolución temporal y avisos.
   */
  function computePortfolio(ops) {
    const sorted = sortOps(ops || []);
    const lots = {}; // ticker -> [{qty, unit, date}]
    const names = {};
    const realized = [];
    const dividends = [];
    const warnings = [];
    const timeline = [];
    const perOp = {}; // opId -> resultado calculado

    let invested = 0;
    let realizedCum = 0;
    let dividendsCum = 0;
    let commissions = 0;

    for (const op of sorted) {
      const t = normTicker(op.ticker);
      if (!t) continue;
      if (op.name) names[t] = op.name;
      const q = num(op.quantity);
      const p = num(op.price);
      const c = num(op.commission);

      if (op.type === 'compra') {
        if (q <= 0) continue;
        const cost = q * p + c;
        commissions += c;
        (lots[t] = lots[t] || []).push({ qty: q, unit: cost / q, date: op.date, opId: op.id });
        invested += cost;
        perOp[op.id] = { total: cost, unitCost: cost / q };
      } else if (op.type === 'venta') {
        if (q <= 0) continue;
        commissions += c;
        const queue = lots[t] || [];
        let remaining = q;
        let costBasis = 0;
        const used = [];
        while (remaining > EPS && queue.length) {
          const lot = queue[0];
          const take = Math.min(lot.qty, remaining);
          costBasis += take * lot.unit;
          used.push({ date: lot.date, qty: take, unit: lot.unit, opId: lot.opId });
          lot.qty -= take;
          remaining -= take;
          if (lot.qty <= EPS) queue.shift();
        }
        const soldQty = q - remaining;
        if (remaining > EPS) {
          warnings.push({
            opId: op.id,
            type: 'sobreventa',
            msg: `Venta de ${t} el ${op.date}: vendes ${q} acciones pero solo tenías ${+soldQty.toFixed(6)}.`,
          });
        }
        const gross = soldQty * p;
        const proceeds = gross - c;
        const gain = proceeds - costBasis;
        const firstBuy = used.length ? used[0].date : op.date;
        const rec = {
          opId: op.id,
          date: op.date,
          ticker: t,
          qty: soldQty,
          price: p,
          commission: c,
          gross,
          proceeds,
          cost: costBasis,
          gain,
          pct: costBasis > 0 ? gain / costBasis : 0,
          days: daysBetween(firstBuy, op.date),
          lots: used,
          washSale: false,
        };
        realized.push(rec);
        perOp[op.id] = rec;
        invested -= costBasis;
        realizedCum += gain;
      } else if (op.type === 'dividendo') {
        const grossDiv = p; // en dividendos, "price" guarda el importe bruto
        const ret = c; // y "commission" la retención
        const net = grossDiv - ret;
        const rec = { opId: op.id, date: op.date, ticker: t, gross: grossDiv, withholding: ret, net };
        dividends.push(rec);
        perOp[op.id] = rec;
        dividendsCum += net;
      } else {
        continue;
      }

      timeline.push({
        date: op.date,
        invested: Math.max(0, invested),
        realizedCum,
        dividendsCum,
      });
    }

    // Regla de los dos meses (art. 33.5 LIRPF): pérdidas con recompra de
    // valores homogéneos dentro de los 2 meses anteriores o posteriores.
    const buys = sorted.filter((o) => o.type === 'compra');
    for (const r of realized) {
      if (r.gain >= 0) continue;
      const from = addMonths(r.date, -2);
      const to = addMonths(r.date, 2);
      const consumed = new Set(r.lots.map((l) => l.opId));
      const hit = buys.find(
        (b) => normTicker(b.ticker) === r.ticker && !consumed.has(b.id) && b.date >= from && b.date <= to
      );
      if (hit) {
        r.washSale = true;
        warnings.push({
          opId: r.opId,
          type: 'dosmeses',
          msg: `Pérdida en ${r.ticker} el ${r.date} con recompra el ${hit.date}: puede que Hacienda no te deje compensarla todavía (regla de los 2 meses).`,
        });
      }
    }

    // Posiciones abiertas
    const positions = [];
    for (const t of Object.keys(lots)) {
      const open = lots[t].filter((l) => l.qty > EPS);
      const qty = open.reduce((s, l) => s + l.qty, 0);
      if (qty <= EPS) continue;
      const cost = open.reduce((s, l) => s + l.qty * l.unit, 0);
      positions.push({
        ticker: t,
        name: names[t] || '',
        qty,
        cost,
        avg: cost / qty,
        firstDate: open[0].date,
        lots: open.map((l) => ({ ...l })),
      });
    }
    positions.sort((a, b) => b.cost - a.cost);

    return {
      positions,
      realized,
      dividends,
      timeline,
      warnings,
      perOp,
      names,
      totals: {
        invested: positions.reduce((s, p) => s + p.cost, 0),
        realized: realizedCum,
        dividends: dividendsCum,
        commissions,
      },
    };
  }

  /** Simula una venta (sin guardarla) y devuelve el resultado FIFO. */
  function simulateSale(ops, { ticker, quantity, price, commission, date, excludeId }) {
    const base = (ops || []).filter((o) => o.id !== excludeId);
    const t = normTicker(ticker);
    // Acciones disponibles en la fecha de la venta (o en total si no hay fecha)
    const before = date ? base.filter((o) => o.date <= date) : base;
    const pf = computePortfolio(before);
    const pos = pf.positions.find((p) => p.ticker === t);
    const available = pos ? pos.qty : 0;
    const fake = {
      id: '__sim__',
      type: 'venta',
      ticker: t,
      quantity,
      price,
      commission,
      date: date || '9999-12-31',
      seq: Number.MAX_SAFE_INTEGER,
    };
    const res = computePortfolio([...before, fake]);
    return { available, result: res.perOp['__sim__'] || null, position: pos || null };
  }

  /** Combina posiciones con precios actuales. */
  function valuePositions(positions, prices) {
    let value = 0;
    let costPriced = 0;
    const rows = positions.map((p) => {
      const cur = prices && prices[p.ticker] ? num(prices[p.ticker].price) : 0;
      const hasPrice = cur > 0;
      const mv = hasPrice ? cur * p.qty : null;
      const pnl = hasPrice ? mv - p.cost : null;
      if (hasPrice) {
        value += mv;
        costPriced += p.cost;
      }
      return {
        ...p,
        price: hasPrice ? cur : null,
        priceDate: prices && prices[p.ticker] ? prices[p.ticker].date : null,
        value: mv,
        pnl,
        pnlPct: hasPrice && p.cost > 0 ? pnl / p.cost : null,
      };
    });
    // Para pesos: valor de mercado si lo hay, coste si no
    const totalForWeight = rows.reduce((s, r) => s + (r.value ?? r.cost), 0);
    rows.forEach((r) => (r.weight = totalForWeight > 0 ? (r.value ?? r.cost) / totalForWeight : 0));
    const unrealized = value - costPriced;
    return {
      rows,
      value,
      costPriced,
      unrealized,
      unrealizedPct: costPriced > 0 ? unrealized / costPriced : 0,
      allPriced: rows.every((r) => r.price != null),
      marketValueOrCost: totalForWeight,
    };
  }

  /** Resumen fiscal por año. */
  function yearSummary(realized, dividends) {
    const years = {};
    const get = (y) =>
      (years[y] = years[y] || {
        year: y,
        sales: 0,
        gains: 0,
        losses: 0,
        net: 0,
        proceeds: 0,
        cost: 0,
        divGross: 0,
        divWithholding: 0,
        divNet: 0,
      });
    for (const r of realized) {
      const y = get(r.date.slice(0, 4));
      y.sales++;
      y.proceeds += r.proceeds;
      y.cost += r.cost;
      if (r.gain >= 0) y.gains += r.gain;
      else y.losses += r.gain;
      y.net += r.gain;
    }
    for (const d of dividends) {
      const y = get(d.date.slice(0, 4));
      y.divGross += d.gross;
      y.divWithholding += d.withholding;
      y.divNet += d.net;
    }
    return Object.values(years).sort((a, b) => (a.year < b.year ? -1 : 1));
  }

  /**
   * Estimación del IRPF del ahorro (escala estatal + autonómica general, 2025+).
   * Solo orientativa: no compensa con otros rendimientos ni años anteriores.
   */
  function estimateSavingsTax(base) {
    if (base <= 0) return 0;
    const brackets = [
      [6000, 0.19],
      [50000, 0.21],
      [200000, 0.23],
      [300000, 0.27],
      [Infinity, 0.30],
    ];
    let tax = 0;
    let prev = 0;
    for (const [limit, rate] of brackets) {
      if (base <= prev) break;
      tax += (Math.min(base, limit) - prev) * rate;
      prev = limit;
    }
    return tax;
  }

  const api = { computePortfolio, simulateSale, valuePositions, yearSummary, estimateSavingsTax, normTicker, num, sortOps };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);

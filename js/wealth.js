/*
 * gfinanzas — patrimonio: cuentas, gastos, ingresos y transferencias
 * Funciones puras (sin DOM), igual que calc.js.
 *
 * Cuenta:      { id, name, type, currency, initial, initialDate, archived }
 * Movimiento:  { id, date, type: 'gasto'|'ingreso'|'transferencia', amount,
 *                accountId, toAccountId?, toAmount?, category, note }
 * Los importes son siempre positivos; el tipo decide el signo.
 * En transferencias entre monedas distintas, toAmount es lo que llega.
 */
(function (root) {
  'use strict';

  const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const ACCOUNT_TYPES = {
    banco: { label: 'Cuenta bancaria', icon: '🏦' },
    efectivo: { label: 'Efectivo', icon: '💶' },
    ahorro: { label: 'Ahorro', icon: '🐷' },
    broker: { label: 'Efectivo en bróker', icon: '📈' },
    tarjeta: { label: 'Tarjeta / monedero', icon: '💳' },
    otro: { label: 'Otro', icon: '👛' },
  };

  const DEFAULT_CATEGORIES = {
    gasto: [
      { id: 'comida', name: 'Comida y bebida', icon: '🍔' },
      { id: 'super', name: 'Supermercado', icon: '🛒' },
      { id: 'transporte', name: 'Transporte', icon: '🚌' },
      { id: 'ocio', name: 'Ocio y salidas', icon: '🎉' },
      { id: 'ropa', name: 'Ropa', icon: '👕' },
      { id: 'suscripciones', name: 'Suscripciones', icon: '📺' },
      { id: 'estudios', name: 'Estudios', icon: '📚' },
      { id: 'tecnologia', name: 'Tecnología', icon: '💻' },
      { id: 'salud', name: 'Salud y deporte', icon: '💪' },
      { id: 'regalos', name: 'Regalos', icon: '🎁' },
      { id: 'casa', name: 'Casa y facturas', icon: '🏠' },
      { id: 'viajes', name: 'Viajes', icon: '✈️' },
      { id: 'otros_g', name: 'Otros gastos', icon: '📦' },
    ],
    ingreso: [
      { id: 'paga', name: 'Paga / ayuda familiar', icon: '👪' },
      { id: 'trabajo', name: 'Trabajo', icon: '💼' },
      { id: 'beca', name: 'Beca', icon: '🎓' },
      { id: 'regalo_i', name: 'Regalo', icon: '🎁' },
      { id: 'ventas', name: 'Ventas', icon: '🏷️' },
      { id: 'otros_i', name: 'Otros ingresos', icon: '💰' },
    ],
  };

  function makeFx(opts) {
    const base = (opts && opts.base) || 'EUR';
    const rates = (opts && opts.rates) || {};
    const rate = (ccy) => {
      if (!ccy || ccy === base) return 1;
      const r = num(rates[ccy]);
      return r > 0 ? r : 1;
    };
    return { base, toBase: (v, ccy) => v / rate(ccy) };
  }

  /** Efecto de un movimiento sobre una cuenta (en la moneda de la cuenta). */
  function effectOn(t, accountId) {
    const a = num(t.amount);
    if (t.type === 'gasto') return t.accountId === accountId ? -a : 0;
    if (t.type === 'ingreso') return t.accountId === accountId ? a : 0;
    if (t.type === 'transferencia') {
      let e = 0;
      if (t.accountId === accountId) e -= a;
      if (t.toAccountId === accountId) e += t.toAmount != null && t.toAmount !== '' ? num(t.toAmount) : a;
      return e;
    }
    return 0;
  }

  /** Saldo de cada cuenta en una fecha (incluida) o hoy si no se indica. */
  function balances(accounts, txs, upTo) {
    const out = {};
    for (const acc of accounts) {
      let b = !upTo || !acc.initialDate || acc.initialDate <= upTo ? num(acc.initial) : 0;
      for (const t of txs) if (!upTo || t.date <= upTo) b += effectOn(t, acc.id);
      out[acc.id] = b;
    }
    return out;
  }

  function cashTotal(accounts, txs, opts, upTo) {
    const fx = makeFx(opts);
    const b = balances(accounts, txs, upTo);
    return accounts.reduce((s, a) => s + fx.toBase(b[a.id] || 0, a.currency), 0);
  }

  const monthOf = (d) => d.slice(0, 7);

  /** Resumen de un mes (YYYY-MM) en la moneda principal. */
  function monthSummary(accounts, txs, month, opts) {
    const fx = makeFx(opts);
    const ccyOf = Object.fromEntries(accounts.map((a) => [a.id, a.currency]));
    const res = { month, income: 0, expense: 0, byCategory: {}, incomeByCategory: {}, count: 0 };
    for (const t of txs) {
      // Las transferencias y los ajustes de saldo no son gastos ni ingresos reales
      if (monthOf(t.date) !== month || t.type === 'transferencia' || t.category === 'ajuste') continue;
      const v = fx.toBase(num(t.amount), ccyOf[t.accountId]);
      res.count++;
      if (t.type === 'gasto') {
        res.expenseCount = (res.expenseCount || 0) + 1;
        res.expense += v;
        res.byCategory[t.category] = (res.byCategory[t.category] || 0) + v;
      } else {
        res.income += v;
        res.incomeByCategory[t.category] = (res.incomeByCategory[t.category] || 0) + v;
      }
    }
    res.net = res.income - res.expense;
    res.savingsRate = res.income > 0 ? res.net / res.income : null;
    return res;
  }

  /** Lista de meses YYYY-MM desde `from` hasta `to` (incluidos). */
  function monthRange(from, to) {
    const out = [];
    let [y, m] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      out.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return out;
  }

  function lastDayOf(month) {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  }

  /**
   * Evolución mensual del patrimonio. `investedAt(date)` devuelve el valor de
   * las inversiones en esa fecha (a precio de coste en el histórico).
   */
  function netWorthSeries(accounts, txs, opts, investedAt, today) {
    const dates = [
      ...txs.map((t) => t.date),
      ...accounts.map((a) => a.initialDate).filter(Boolean),
      ...(investedAt.firstDate ? [investedAt.firstDate] : []),
    ].sort();
    if (!dates.length) return [];
    const months = monthRange(monthOf(dates[0]), monthOf(today));
    return months.map((m) => {
      const end = m === monthOf(today) ? today : lastDayOf(m);
      const cash = cashTotal(accounts, txs, opts, end);
      const inv = investedAt(end);
      return { month: m, date: end, cash, investments: inv, total: cash + inv };
    });
  }

  const api = { ACCOUNT_TYPES, DEFAULT_CATEGORIES, balances, cashTotal, monthSummary, monthRange, netWorthSeries, effectOn, num };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GWealth = api;
})(typeof window !== 'undefined' ? window : globalThis);

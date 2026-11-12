/*
 * gfinanzas — horario de los mercados
 * Calcula si Wall Street y las bolsas europeas están abiertas, en premercado,
 * postmercado, subasta o cerradas, con su propia zona horaria (cambios de
 * hora incluidos) y sus festivos.
 *
 * Fuentes de festivos: calendario oficial NYSE 2026-2028 y calendario BME 2026.
 * BME 2027-2028 se deduce de sus festivos fijos (Año Nuevo, Viernes Santo,
 * Lunes de Pascua, 1 de mayo, 25 y 26 de diciembre) hasta que se publique.
 */
(function (root) {
  'use strict';

  const MARKETS = {
    us: {
      name: 'Wall Street',
      flag: '🇺🇸',
      tz: 'America/New_York',
      holidays: new Set([
        // 2026
        '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03',
        '2026-09-07', '2026-11-26', '2026-12-25',
        // 2027
        '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05',
        '2027-09-06', '2027-11-25', '2027-12-24',
        // 2028
        '2028-01-17', '2028-02-21', '2028-04-14', '2028-05-29', '2028-06-19', '2028-07-04', '2028-09-04',
        '2028-11-23', '2028-12-25',
      ]),
      early: new Set(['2026-11-27', '2026-12-24', '2027-11-26', '2028-07-03', '2028-11-24']),
      // minutos desde medianoche (hora local del mercado)
      sessions(early) {
        return early
          ? [[240, 570, 'pre'], [570, 780, 'open'], [780, 1020, 'post']]
          : [[240, 570, 'pre'], [570, 960, 'open'], [960, 1200, 'post']];
      },
      note: 'NYSE y Nasdaq · premercado 4:00–9:30, sesión 9:30–16:00, postmercado 16:00–20:00 (hora de Nueva York)',
    },
    eu: {
      name: 'Europa',
      flag: '🇪🇺',
      tz: 'Europe/Madrid',
      holidays: new Set([
        '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-12-25',
        '2027-01-01', '2027-03-26', '2027-03-29',
        '2028-04-14', '2028-04-17', '2028-05-01', '2028-12-25', '2028-12-26',
      ]),
      early: new Set(['2026-12-24', '2026-12-31', '2027-12-24', '2027-12-31']),
      sessions(early) {
        return early
          ? [[510, 540, 'pre'], [540, 840, 'open'], [840, 845, 'auction']]
          : [[510, 540, 'pre'], [540, 1050, 'open'], [1050, 1055, 'auction']];
      },
      note: 'Madrid, Fráncfort, París, Ámsterdam y Milán · subasta de apertura 8:30–9:00, sesión 9:00–17:30, subasta de cierre 17:30–17:35',
    },
  };

  const LABELS = {
    open: 'Abierto',
    pre: { us: 'Premercado', eu: 'Preapertura' },
    post: 'Postmercado',
    auction: 'Subasta de cierre',
    closed: 'Cerrado',
    holiday: 'Festivo',
    weekend: 'Fin de semana',
  };

  const fmtCache = {};
  function localParts(tz, date) {
    const f = (fmtCache[tz] =
      fmtCache[tz] ||
      new Intl.DateTimeFormat('en-CA', {
        timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
      }));
    const p = {};
    for (const x of f.formatToParts(date)) p[x.type] = x.value;
    return { day: `${p.year}-${p.month}-${p.day}`, mins: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10), weekday: p.weekday };
  }

  /** Estado del mercado en un instante: open | pre | post | auction | closed. */
  function stateAt(key, date) {
    const m = MARKETS[key];
    const { day, mins, weekday } = localParts(m.tz, date);
    if (weekday === 'Sat' || weekday === 'Sun') return { state: 'closed', why: 'weekend' };
    if (m.holidays.has(day)) return { state: 'closed', why: 'holiday' };
    const early = m.early.has(day);
    for (const [a, b, s] of m.sessions(early)) if (mins >= a && mins < b) return { state: s, early };
    return { state: 'closed', early };
  }

  /** Primer instante (en pasos de 5 min) a partir de `from` en que se cumple `pred`. */
  function nextWhere(key, from, pred) {
    const step = 5 * 60000;
    let t = Math.ceil((from.getTime() + 1000) / step) * step;
    for (let i = 0; i < 12 * 24 * 6; i++, t += step) if (pred(stateAt(key, new Date(t)).state)) return new Date(t);
    return null;
  }

  /** Estado completo con la etiqueta y el próximo cambio relevante. */
  function status(key, now = new Date()) {
    const s = stateAt(key, now);
    let label = s.state === 'pre' ? LABELS.pre[key] : LABELS[s.state];
    if (s.state === 'closed' && s.why) label = LABELS[s.why];
    let next = null;
    let nextLabel = '';
    if (s.state === 'open') {
      next = nextWhere(key, now, (x) => x !== 'open');
      nextLabel = 'cierra';
    } else if (s.state === 'post' || s.state === 'auction') {
      next = nextWhere(key, now, (x) => x === 'closed');
      nextLabel = 'termina';
    } else {
      next = nextWhere(key, now, (x) => x === 'open');
      nextLabel = 'abre';
    }
    return { key, ...MARKETS[key], ...s, label, next, nextLabel };
  }

  const api = { MARKETS, status, stateAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GMarkets = api;
})(typeof window !== 'undefined' ? window : globalThis);

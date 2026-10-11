/* Motor de cálculo de Bote. Cero DOM, cero localStorage: solo aritmética.
 *
 * Todo el dinero viaja en CÉNTIMOS ENTEROS. Nunca euros en coma flotante: en
 * cuanto entran los 0,10 € de las fichas bajas, un reparto en float acaba
 * pidiendo "12,999999999 €" y el cuadre no cierra jamás.
 *
 * Una partida es una lista de movimientos de tres tipos:
 *
 *   buyin              el jugador recibe fichas nuevas de la caja, a fiar.
 *   compra_a_jugador   el vendedor le pasa fichas suyas al comprador y el
 *                      comprador le paga en dinero. NO es un buy-in: no entran
 *                      fichas nuevas en la mesa, solo cambian de dueño. Si se
 *                      apuntara como buy-in, las fichas en juego saldrían
 *                      infladas y el cuadre final fallaría siempre.
 *   pago               dinero suelto entre dos (un Bizum a media noche).
 *
 * De ahí salen, por jugador:
 *
 *   base       lo que tiene invertido en fichas
 *   final      lo que valen las fichas que le quedan al contar
 *   resultado  final - base ......... el P&L de la noche. Suma 0 en la mesa.
 *   pendiente  lo que le queda por cobrar (+) o por pagar (-). Suma 0.
 */

export const TIPOS = ['buyin', 'compra_a_jugador', 'pago'];

/* ── dinero ─────────────────────────────────────────────────────────────── */

/** 1234 -> "12,34 €". Con signo explícito si se pide (para los resultados). */
export function euros(centimos, { signo = false } = {}) {
  const n = Math.round(centimos);
  const s = (Math.abs(n) / 100).toFixed(2).replace('.', ',');
  const pre = n < 0 ? '−' : signo && n > 0 ? '+' : '';
  return `${pre}${s} €`;
}

/** "12,34", "12.34", "12" -> 1234. null si no se entiende. */
export function aCentimos(texto) {
  if (typeof texto === 'number') return Math.round(texto * 100);
  const limpio = String(texto).trim().replace(/[€\s]/g, '').replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(limpio)) return null;
  return Math.round(parseFloat(limpio) * 100);
}

/* ── cálculo ────────────────────────────────────────────────────────────── */

/** Valor en céntimos de un conteo {fichaId: unidades} según el set de fichas. */
export function valorConteo(conteo, fichas) {
  if (!conteo) return 0;
  return fichas.reduce((t, f) => t + (conteo[f.id] || 0) * f.valor, 0);
}

/**
 * Calcula el estado completo de una partida.
 *
 * @param {object} partida  { ajustes:{buyIn,fichas}, jugadores, movimientos, conteo }
 * @returns {object} resumen con jugadores, cuadre, pagos y avisos.
 */
export function calcular(partida) {
  const fichas = partida.ajustes?.fichas || [];
  const conteo = partida.conteo || {};
  const movimientos = partida.movimientos || [];

  const filas = new Map();
  for (const j of partida.jugadores || []) {
    filas.set(j.id, {
      id: j.id,
      nombre: j.nombre,
      base: 0,        // € en fichas que ha puesto sobre la mesa
      buyins: 0,      // nº de entradas + recompras (solo para enseñarlo)
      cobrado: 0,     // dinero que ya ha recibido durante la partida
      pagado: 0,      // dinero que ya ha soltado durante la partida
      final: 0,
      resultado: 0,
      pendiente: 0,
      contado: false,
    });
  }
  const fila = (id) => filas.get(id);

  const avisos = [];

  for (const m of movimientos) {
    const importe = m.importe | 0;
    if (m.tipo === 'buyin') {
      const j = fila(m.jugador);
      if (!j) { avisos.push(`Movimiento con un jugador que ya no existe.`); continue; }
      j.base += importe;
      j.buyins += 1;
    } else if (m.tipo === 'compra_a_jugador') {
      // El comprador suelta dinero y recibe fichas; el vendedor al revés.
      const c = fila(m.comprador), v = fila(m.vendedor);
      if (!c || !v) { avisos.push(`Movimiento con un jugador que ya no existe.`); continue; }
      c.base += importe;
      v.base -= importe;
      c.pagado += importe;
      v.cobrado += importe;
    } else if (m.tipo === 'pago') {
      const d = fila(m.de), a = fila(m.a);
      if (!d || !a) { avisos.push(`Movimiento con un jugador que ya no existe.`); continue; }
      d.pagado += importe;
      a.cobrado += importe;
    }
  }

  for (const j of filas.values()) {
    const c = conteo[j.id];
    j.contado = !!c && Object.keys(c).length > 0;
    j.final = valorConteo(c, fichas);
    j.resultado = j.final - j.base;
    // Lo ya movido en efectivo se descuenta: si un jugador ya cobró 20 € por
    // venderle fichas a otro, esos 20 € no se los deben otra vez al final.
    j.pendiente = j.resultado - (j.cobrado - j.pagado);
  }

  const jugadores = [...filas.values()];
  const baseTotal = jugadores.reduce((t, j) => t + j.base, 0);
  const finalTotal = jugadores.reduce((t, j) => t + j.final, 0);
  const todosContados = jugadores.length > 0 && jugadores.every((j) => j.contado);

  const cuadre = {
    baseTotal,
    finalTotal,
    diferencia: finalTotal - baseTotal,   // + sobran fichas, − faltan
    todosContados,
    pista: null,
  };
  if (todosContados && cuadre.diferencia !== 0) {
    cuadre.pista = pistaDelDescuadre(cuadre.diferencia, fichas);
  }

  avisos.push(...avisosDeStock(conteo, fichas));

  // El reparto solo tiene sentido con la cuenta cerrada y cuadrada.
  const pagos = todosContados && cuadre.diferencia === 0 ? repartir(jugadores) : [];

  const sumaPendiente = jugadores.reduce((t, j) => t + j.pendiente, 0);
  if (todosContados && cuadre.diferencia === 0 && sumaPendiente !== 0) {
    // Invariante roto: si esto salta es un fallo del motor, no del usuario.
    avisos.push(`Error interno: los saldos no suman cero (${euros(sumaPendiente)}).`);
  }

  return {
    jugadores,
    numJugadores: jugadores.length,
    boteTotal: baseTotal,
    recompras: Math.max(0, movimientos.filter((m) => m.tipo === 'buyin').length - jugadores.length),
    cuadre,
    pagos,
    avisos,
  };
}

/**
 * Traduce un descuadre a fichas: si la diferencia es múltiplo exacto del valor
 * de un color, lo más probable es que falten (o sobren) fichas de ese color.
 * Se queda con la explicación de menos fichas, que es casi siempre la buena.
 */
export function pistaDelDescuadre(diferencia, fichas) {
  const abs = Math.abs(diferencia);
  let mejor = null;
  for (const f of fichas) {
    if (f.valor > 0 && abs % f.valor === 0) {
      const n = abs / f.valor;
      if (!mejor || n < mejor.unidades) mejor = { ficha: f, unidades: n };
    }
  }
  if (!mejor) return null;
  const { ficha, unidades } = mejor;
  const una = unidades === 1;
  const verbo = diferencia < 0 ? (una ? 'falta' : 'faltan') : (una ? 'sobra' : 'sobran');
  return `${verbo} ${unidades} ${una ? 'ficha' : 'fichas'} de las ${ficha.nombre.toLowerCase()}`;
}

/** Avisa si se han contado más fichas de un color de las que hay en la caja. */
function avisosDeStock(conteo, fichas) {
  const out = [];
  for (const f of fichas) {
    if (!f.unidades) continue;   // sin stock declarado no hay nada que comprobar
    let usadas = 0;
    for (const c of Object.values(conteo)) usadas += (c?.[f.id] || 0);
    if (usadas > f.unidades) {
      out.push(`Has contado ${usadas} fichas ${f.nombre.toLowerCase()} y solo hay ${f.unidades}.`);
    }
  }
  return out;
}

/**
 * Lista mínima de pagos a partir de los saldos pendientes.
 *
 * Voraz clásico: el que más debe le paga al que más tiene que cobrar, y se
 * repite. Genera como mucho N−1 transferencias, que es lo que hace Tricount.
 *
 * @param {Array} jugadores  filas con {id, nombre, pendiente}
 * @returns {Array} [{de, deNombre, a, aNombre, importe}]
 */
export function repartir(jugadores) {
  const cmp = (a, b) => Math.abs(b.saldo) - Math.abs(a.saldo) || String(a.id).localeCompare(String(b.id));
  const acreedores = jugadores.filter((j) => j.pendiente > 0)
    .map((j) => ({ id: j.id, nombre: j.nombre, saldo: j.pendiente })).sort(cmp);
  const deudores = jugadores.filter((j) => j.pendiente < 0)
    .map((j) => ({ id: j.id, nombre: j.nombre, saldo: -j.pendiente })).sort(cmp);

  const pagos = [];
  let i = 0, k = 0;
  // Cada vuelta deja a cero al menos a uno de los dos, así que el bucle
  // termina en como mucho (acreedores + deudores − 1) pasos.
  while (i < deudores.length && k < acreedores.length) {
    const d = deudores[i], a = acreedores[k];
    const importe = Math.min(d.saldo, a.saldo);
    if (importe > 0) {
      pagos.push({ de: d.id, deNombre: d.nombre, a: a.id, aNombre: a.nombre, importe });
    }
    d.saldo -= importe;
    a.saldo -= importe;
    if (d.saldo === 0) i++;
    if (a.saldo === 0) k++;
  }
  return pagos;
}

/* ── compartir ──────────────────────────────────────────────────────────── */

/** Texto plano del reparto, listo para pegar en WhatsApp. */
export function textoCompartir(resumen, { titulo = 'Partida de póker' } = {}) {
  const l = [titulo, ''];
  for (const j of [...resumen.jugadores].sort((a, b) => b.resultado - a.resultado)) {
    l.push(`${j.nombre}: ${euros(j.resultado, { signo: true })}`);
  }
  l.push('', 'Pagos:');
  if (resumen.pagos.length === 0) l.push('nadie debe nada');
  for (const p of resumen.pagos) l.push(`· ${p.deNombre} → ${p.aNombre}: ${euros(p.importe)}`);
  return l.join('\n');
}

/* Estado de la app y persistencia en el propio móvil.
 *
 * Todo vive bajo una sola clave de localStorage con un número de versión, para
 * poder migrar el día que cambie el formato sin perder el histórico. Cualquier
 * cambio pasa por commit(), que persiste y avisa a la interfaz: no hay ninguna
 * otra puerta de escritura. */

import { FICHAS_POR_DEFECTO } from './fichas.js';

const CLAVE = 'bote.v1';
const VERSION = 1;

export const BUYIN_POR_DEFECTO = 2000;   // 20 €

export function nuevoId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID().slice(0, 8);
  return Math.random().toString(36).slice(2, 10);
}

function estadoInicial() {
  return {
    v: VERSION,
    ajustes: { buyIn: BUYIN_POR_DEFECTO, fichas: structuredClone(FICHAS_POR_DEFECTO) },
    partidas: [],
    activaId: null,
  };
}

function leer() {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return estadoInicial();
    const datos = JSON.parse(crudo);
    if (datos?.v !== VERSION) return estadoInicial();
    // Los defectos rellenan lo que falte: una versión vieja a la que le falte
    // un campo entra igual en vez de dejar la app en blanco.
    return { ...estadoInicial(), ...datos };
  } catch {
    return estadoInicial();
  }
}

let estado = leer();
const oyentes = new Set();

export const get = () => estado;
export function suscribir(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

/** Única forma de cambiar el estado: muta, guarda y repinta. */
export function commit(mutacion) {
  mutacion(estado);
  try {
    localStorage.setItem(CLAVE, JSON.stringify(estado));
  } catch (e) {
    console.error('No se ha podido guardar', e);
  }
  for (const fn of oyentes) fn(estado);
}

/* ── partidas ───────────────────────────────────────────────────────────── */

export const partidaActiva = () => estado.partidas.find((p) => p.id === estado.activaId) || null;
export const partidaPorId = (id) => estado.partidas.find((p) => p.id === id) || null;

/**
 * Crea una partida congelando los ajustes actuales: cambiar el set de fichas
 * mañana no puede reescribir lo que ya pasó anoche.
 */
export function crearPartida(nombres = []) {
  const id = nuevoId();
  commit((e) => {
    e.partidas.unshift({
      id,
      fecha: new Date().toISOString(),
      nombre: '',
      cerrada: false,
      ajustes: structuredClone(e.ajustes),
      jugadores: nombres.filter((n) => n.trim()).map((n) => ({ id: nuevoId(), nombre: n.trim() })),
      movimientos: [],
      conteo: {},
    });
    e.activaId = id;
  });
  // El buy-in de entrada de cada jugador se apunta solo: nadie se sienta sin pagar.
  const p = partidaPorId(id);
  for (const j of p.jugadores) añadirMovimiento(id, { tipo: 'buyin', jugador: j.id, importe: p.ajustes.buyIn });
  return id;
}

export function abrirPartida(id) { commit((e) => { e.activaId = id; }); }
// Cerrar una partida la manda al histórico: deja de ser la que está en marcha.
export function cerrarPartida(id) {
  commit((e) => {
    const p = e.partidas.find((x) => x.id === id);
    if (p) p.cerrada = true;
    if (e.activaId === id) e.activaId = null;
  });
}
export function reabrirPartida(id) { commit((e) => { const p = e.partidas.find((x) => x.id === id); if (p) p.cerrada = false; e.activaId = id; }); }
export function renombrarPartida(id, nombre) { commit((e) => { const p = e.partidas.find((x) => x.id === id); if (p) p.nombre = nombre; }); }

export function borrarPartida(id) {
  commit((e) => {
    e.partidas = e.partidas.filter((p) => p.id !== id);
    if (e.activaId === id) e.activaId = null;
  });
}

/* ── jugadores ──────────────────────────────────────────────────────────── */

/** Añade un jugador y le apunta su buy-in de entrada. Se puede llegar tarde. */
export function añadirJugador(partidaId, nombre) {
  const jid = nuevoId();
  commit((e) => {
    const p = e.partidas.find((x) => x.id === partidaId);
    if (!p || p.cerrada) return;
    p.jugadores.push({ id: jid, nombre: nombre.trim() });
  });
  const p = partidaPorId(partidaId);
  if (p) añadirMovimiento(partidaId, { tipo: 'buyin', jugador: jid, importe: p.ajustes.buyIn });
  return jid;
}

export function renombrarJugador(partidaId, jugadorId, nombre) {
  commit((e) => {
    const j = e.partidas.find((x) => x.id === partidaId)?.jugadores.find((x) => x.id === jugadorId);
    if (j) j.nombre = nombre.trim();
  });
}

/** Quita un jugador y todo su rastro: si no, quedan movimientos huérfanos. */
export function quitarJugador(partidaId, jugadorId) {
  commit((e) => {
    const p = e.partidas.find((x) => x.id === partidaId);
    if (!p || p.cerrada) return;
    p.jugadores = p.jugadores.filter((j) => j.id !== jugadorId);
    p.movimientos = p.movimientos.filter((m) =>
      m.jugador !== jugadorId && m.comprador !== jugadorId && m.vendedor !== jugadorId && m.de !== jugadorId && m.a !== jugadorId);
    delete p.conteo[jugadorId];
  });
}

/* ── movimientos y conteo ───────────────────────────────────────────────── */

export function añadirMovimiento(partidaId, mov) {
  const id = nuevoId();
  commit((e) => {
    const p = e.partidas.find((x) => x.id === partidaId);
    if (!p || p.cerrada) return;
    p.movimientos.push({ id, ts: new Date().toISOString(), ...mov });
  });
  return id;
}

export function borrarMovimiento(partidaId, movId) {
  commit((e) => {
    const p = e.partidas.find((x) => x.id === partidaId);
    if (!p || p.cerrada) return;
    p.movimientos = p.movimientos.filter((m) => m.id !== movId);
  });
}

/** Fija las fichas contadas de un jugador. `null` deshace el conteo. */
export function fijarConteo(partidaId, jugadorId, conteo) {
  commit((e) => {
    const p = e.partidas.find((x) => x.id === partidaId);
    if (!p) return;
    if (conteo === null) delete p.conteo[jugadorId];
    else p.conteo[jugadorId] = conteo;
  });
}

/* ── ajustes ────────────────────────────────────────────────────────────── */

export function guardarAjustes({ buyIn, fichas }) {
  commit((e) => {
    if (buyIn > 0) e.ajustes.buyIn = buyIn;
    if (fichas) e.ajustes.fichas = structuredClone(fichas);
    // Una partida abierta en la que aún no se ha contado nada se reajusta al
    // set nuevo: es lo que espera quien configura las fichas justo antes de
    // empezar. En cuanto hay conteo se deja como está, porque las fichas
    // contadas apuntan a los colores viejos.
    const p = e.partidas.find((x) => x.id === e.activaId);
    if (p && !p.cerrada && Object.keys(p.conteo).length === 0) p.ajustes = structuredClone(e.ajustes);
  });
}

export function restablecerTodo() {
  commit((e) => Object.assign(e, estadoInicial()));
}

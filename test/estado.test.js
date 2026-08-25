/* estado.js habla con localStorage, que en node no existe: se le pone uno de
 * mentira antes de importarlo (por eso el import es dinámico). */
import test from 'node:test';
import assert from 'node:assert/strict';

function memoria(inicial = {}) {
  const datos = new Map(Object.entries(inicial));
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
    _datos: datos,
  };
}

/** Carga estado.js con un localStorage limpio. Cache-busting por query. */
let n = 0;
async function cargarModulo(inicial) {
  globalThis.localStorage = memoria(inicial);
  return import(`../js/estado.js?${n++}`);
}

test('arranca vacío y con el set de fichas por defecto', async () => {
  const E = await cargarModulo();
  const e = E.get();
  assert.equal(e.ajustes.buyIn, 2000);
  assert.equal(e.ajustes.fichas.length, 3);
  assert.deepEqual(e.partidas, []);
  assert.equal(E.partidaActiva(), null);
});

test('crear una partida apunta el buy-in de entrada de cada jugador', async () => {
  const E = await cargarModulo();
  E.crearPartida(['Nacho', 'Pablo', '  ']);      // el vacío se descarta
  const p = E.partidaActiva();
  assert.equal(p.jugadores.length, 2);
  assert.equal(p.movimientos.length, 2);
  assert.ok(p.movimientos.every((m) => m.tipo === 'buyin' && m.importe === 2000));
  assert.ok(p.movimientos.every((m) => m.id && m.ts));
});

test('todo cambio se persiste en localStorage', async () => {
  const E = await cargarModulo();
  E.crearPartida(['Nacho']);
  const guardado = JSON.parse(localStorage.getItem('bote.v1'));
  assert.equal(guardado.v, 1);
  assert.equal(guardado.partidas.length, 1);
  assert.equal(guardado.activaId, guardado.partidas[0].id);

  // Y al volver a abrir la app sigue ahí.
  const E2 = await (async () => {
    globalThis.localStorage = memoria({ 'bote.v1': JSON.stringify(guardado) });
    return import(`../js/estado.js?recarga${n++}`);
  })();
  assert.equal(E2.get().partidas.length, 1);
  assert.equal(E2.partidaActiva().jugadores[0].nombre, 'Nacho');
});

test('un localStorage corrupto o de otra versión no deja la app en blanco', async () => {
  const roto = await cargarModulo({ 'bote.v1': '{no es json' });
  assert.deepEqual(roto.get().partidas, []);

  const viejo = await cargarModulo({ 'bote.v1': JSON.stringify({ v: 0, partidas: [{ id: 'x' }] }) });
  assert.deepEqual(viejo.get().partidas, []);
  assert.equal(viejo.get().ajustes.buyIn, 2000);
});

test('quien llega tarde entra con su buy-in', async () => {
  const E = await cargarModulo();
  const id = E.crearPartida(['Nacho']);
  E.añadirJugador(id, 'Marta');
  const p = E.partidaActiva();
  assert.equal(p.jugadores.length, 2);
  assert.equal(p.movimientos.filter((m) => m.tipo === 'buyin').length, 2);
});

test('quitar un jugador se lleva sus movimientos y su conteo', async () => {
  const E = await cargarModulo();
  const id = E.crearPartida(['Nacho', 'Pablo']);
  const [nacho, pablo] = E.partidaActiva().jugadores;
  E.añadirMovimiento(id, { tipo: 'compra_a_jugador', comprador: nacho.id, vendedor: pablo.id, importe: 1000 });
  E.fijarConteo(id, pablo.id, { negra: 5 });
  assert.equal(E.partidaActiva().movimientos.length, 3);

  E.quitarJugador(id, pablo.id);
  const p = E.partidaActiva();
  assert.equal(p.jugadores.length, 1);
  assert.equal(p.movimientos.length, 1);            // solo queda el buy-in de Nacho
  assert.equal(p.conteo[pablo.id], undefined);
  assert.ok(p.movimientos.every((m) => m.jugador !== pablo.id));
});

test('borrar un movimiento deshace la última acción', async () => {
  const E = await cargarModulo();
  const id = E.crearPartida(['Nacho']);
  const j = E.partidaActiva().jugadores[0].id;
  const mid = E.añadirMovimiento(id, { tipo: 'buyin', jugador: j, importe: 2000 });
  assert.equal(E.partidaActiva().movimientos.length, 2);
  E.borrarMovimiento(id, mid);
  assert.equal(E.partidaActiva().movimientos.length, 1);
});

test('una partida cerrada no admite más cambios hasta reabrirla', async () => {
  const E = await cargarModulo();
  const id = E.crearPartida(['Nacho']);
  const j = E.partidaActiva().jugadores[0].id;
  E.cerrarPartida(id);
  assert.equal(E.get().activaId, null, 'al cerrarla deja de ser la partida en marcha');
  assert.equal(E.partidaPorId(id).cerrada, true);

  E.añadirMovimiento(id, { tipo: 'buyin', jugador: j, importe: 2000 });
  E.añadirJugador(id, 'Intruso');
  assert.equal(E.partidaPorId(id).movimientos.length, 1);
  assert.equal(E.partidaPorId(id).jugadores.length, 1);

  E.reabrirPartida(id);
  assert.equal(E.get().activaId, id, 'reabrirla la vuelve a poner en marcha');
  E.añadirMovimiento(id, { tipo: 'buyin', jugador: j, importe: 2000 });
  assert.equal(E.partidaPorId(id).movimientos.length, 2);
});

test('la partida congela sus ajustes: cambiar las fichas no reescribe el pasado', async () => {
  const E = await cargarModulo();
  const id = E.crearPartida(['Nacho']);
  const j = E.partidaActiva().jugadores[0].id;
  E.fijarConteo(id, j, { negra: 20 });

  E.guardarAjustes({ buyIn: 5000, fichas: [{ id: 'x', nombre: 'Verdes', color: '#0f0', valor: 500, unidades: 50 }] });
  const p = E.partidaPorId(id);
  assert.equal(p.ajustes.buyIn, 2000, 'la partida en marcha mantiene su buy-in');
  assert.equal(p.ajustes.fichas.length, 3, 'y su set de fichas');
  assert.equal(E.get().ajustes.buyIn, 5000, 'pero los ajustes nuevos quedan para la siguiente');

  // La siguiente partida sí nace con lo nuevo.
  const id2 = E.crearPartida(['Pablo']);
  assert.equal(E.partidaPorId(id2).ajustes.buyIn, 5000);
  assert.equal(E.partidaPorId(id2).movimientos[0].importe, 5000);
});

test('configurar las fichas antes de contar sí reajusta la partida abierta', async () => {
  const E = await cargarModulo();
  const id = E.crearPartida(['Nacho']);
  E.guardarAjustes({ buyIn: 1000, fichas: [{ id: 'x', nombre: 'Verdes', color: '#0f0', valor: 500, unidades: 50 }] });
  const p = E.partidaPorId(id);
  assert.equal(p.ajustes.buyIn, 1000);
  assert.equal(p.ajustes.fichas.length, 1);
});

test('el histórico va del más reciente al más viejo y se puede borrar', async () => {
  const E = await cargarModulo();
  const a = E.crearPartida(['Nacho']);
  const b = E.crearPartida(['Pablo']);
  assert.deepEqual(E.get().partidas.map((p) => p.id), [b, a]);

  E.borrarPartida(b);
  assert.deepEqual(E.get().partidas.map((p) => p.id), [a]);
  assert.equal(E.get().activaId, null, 'borrar la activa deja la app sin partida abierta');

  E.abrirPartida(a);
  assert.equal(E.partidaActiva().id, a);
});

test('suscribir avisa de cada cambio', async () => {
  const E = await cargarModulo();
  let avisos = 0;
  const baja = E.suscribir(() => avisos++);
  E.crearPartida(['Nacho']);        // 1 commit de la partida + 1 del buy-in
  assert.ok(avisos >= 2);
  baja();
  const antes = avisos;
  E.crearPartida(['Pablo']);
  assert.equal(avisos, antes, 'tras darse de baja ya no recibe avisos');
});

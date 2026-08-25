import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcular, repartir, euros, aCentimos, valorConteo,
  pistaDelDescuadre, textoCompartir,
} from '../js/motor.js';

/* Set de fichas de referencia: un buy-in de 20 € son 20 blancas (2 €),
 * 16 rojas (8 €) y 10 negras (10 €). */
const FICHAS = [
  { id: 'b', nombre: 'Blancas', color: '#f4f4f5', valor: 10, unidades: 300 },
  { id: 'r', nombre: 'Rojas', color: '#dc2626', valor: 50, unidades: 200 },
  { id: 'n', nombre: 'Negras', color: '#18181b', valor: 100, unidades: 200 },
];
const BUYIN = 2000;

function partida({ jugadores, movimientos = [], conteo = {} }) {
  return {
    ajustes: { buyIn: BUYIN, fichas: FICHAS },
    jugadores: jugadores.map((n) => ({ id: n.toLowerCase(), nombre: n })),
    movimientos,
    conteo,
  };
}
const buyin = (j, importe = BUYIN) => ({ tipo: 'buyin', jugador: j, importe });
/** `comprador` suelta dinero, `vendedor` suelta fichas. */
const compra = (comprador, vendedor, importe) => ({ tipo: 'compra_a_jugador', comprador, vendedor, importe });
const pago = (de, a, importe) => ({ tipo: 'pago', de, a, importe });

/** Conteo en euros exactos, repartido en negras + resto en blancas. */
function stack(totalCentimos) {
  const n = Math.floor(totalCentimos / 100);
  const b = (totalCentimos - n * 100) / 10;
  return { n, b };
}

/* ── dinero ─────────────────────────────────────────────────────────────── */

test('euros formatea con coma y signo', () => {
  assert.equal(euros(1234), '12,34 €');
  assert.equal(euros(0), '0,00 €');
  assert.equal(euros(-500), '−5,00 €');
  assert.equal(euros(500, { signo: true }), '+5,00 €');
  assert.equal(euros(-500, { signo: true }), '−5,00 €');
});

test('aCentimos entiende lo que se teclea en un móvil', () => {
  assert.equal(aCentimos('12,34'), 1234);
  assert.equal(aCentimos('12.34'), 1234);
  assert.equal(aCentimos(' 20 € '), 2000);
  assert.equal(aCentimos('0,1'), 10);
  assert.equal(aCentimos(''), null);
  assert.equal(aCentimos('abc'), null);
});

test('aCentimos y valorConteo no arrastran error de coma flotante', () => {
  // 0,1 + 0,2 en euros da 0,30000000000000004; en céntimos da 30.
  assert.equal(valorConteo({ b: 3 }, FICHAS), 30);
  let total = 0;
  for (let i = 0; i < 100; i++) total += aCentimos('0,10');
  assert.equal(total, 1000);
});

/* ── partida simple ─────────────────────────────────────────────────────── */

test('tres jugadores, un buy-in cada uno: el que gana cobra de los que pierden', () => {
  const p = partida({
    jugadores: ['Nacho', 'Pablo', 'Marta'],
    movimientos: [buyin('nacho'), buyin('pablo'), buyin('marta')],
    conteo: { nacho: stack(4000), pablo: stack(1500), marta: stack(500) },
  });
  const r = calcular(p);

  assert.equal(r.numJugadores, 3);
  assert.equal(r.boteTotal, 6000);
  assert.equal(r.recompras, 0);
  assert.equal(r.cuadre.diferencia, 0);

  const por = Object.fromEntries(r.jugadores.map((j) => [j.id, j]));
  assert.equal(por.nacho.resultado, 2000);
  assert.equal(por.pablo.resultado, -500);
  assert.equal(por.marta.resultado, -1500);

  // Sin dinero movido durante la partida, pendiente == resultado.
  assert.equal(por.nacho.pendiente, 2000);
  assert.deepEqual(
    r.pagos.map((x) => [x.deNombre, x.aNombre, x.importe]),
    [['Marta', 'Nacho', 1500], ['Pablo', 'Nacho', 500]],
  );
});

test('las recompras se cuentan y engordan el bote', () => {
  const p = partida({
    jugadores: ['Nacho', 'Pablo'],
    movimientos: [buyin('nacho'), buyin('pablo'), buyin('pablo'), buyin('pablo')],
    conteo: { nacho: stack(6000), pablo: stack(2000) },
  });
  const r = calcular(p);
  assert.equal(r.boteTotal, 8000);
  assert.equal(r.recompras, 2);          // 4 buy-ins − 2 jugadores
  const por = Object.fromEntries(r.jugadores.map((j) => [j.id, j]));
  assert.equal(por.pablo.buyins, 3);
  assert.equal(por.nacho.resultado, 4000);
  assert.equal(por.pablo.resultado, -4000);
  assert.deepEqual(r.pagos.map((x) => [x.deNombre, x.aNombre, x.importe]), [['Pablo', 'Nacho', 4000]]);
});

/* ── comprarle fichas a otro jugador ────────────────────────────────────── */

test('comprarle fichas a otro traspasa la base, no crea fichas nuevas', () => {
  // Nacho y Pablo entran con 20 € a fiar. Nacho se queda sin fichas y en vez
  // de recomprar de la caja le da 10 € a Pablo, que le pasa 10 € en fichas.
  const p = partida({
    jugadores: ['Nacho', 'Pablo'],
    movimientos: [buyin('nacho'), buyin('pablo'), compra('nacho', 'pablo', 1000)],
    conteo: { nacho: stack(4000), pablo: stack(0) },
  });
  const r = calcular(p);
  const por = Object.fromEntries(r.jugadores.map((j) => [j.id, j]));

  // Solo hay 40 € en fichas sobre la mesa: dos buy-ins, ni uno más.
  assert.equal(r.boteTotal, 4000);
  assert.equal(r.recompras, 0);
  assert.equal(por.nacho.base, 3000);
  assert.equal(por.pablo.base, 1000);
  assert.equal(r.cuadre.diferencia, 0);

  assert.equal(por.nacho.resultado, 1000);    // ganó 10 € en la noche
  assert.equal(por.pablo.resultado, -1000);

  // Pablo ya cobró 10 € en efectivo, así que le quedan 20 € por pagar y no 10.
  assert.equal(por.nacho.pendiente, 2000);
  assert.equal(por.pablo.pendiente, -2000);
  assert.deepEqual(r.pagos.map((x) => [x.deNombre, x.aNombre, x.importe]), [['Pablo', 'Nacho', 2000]]);
});

test('un pago a media partida reduce lo que queda por saldar', () => {
  const base = {
    jugadores: ['Nacho', 'Pablo'],
    movimientos: [buyin('nacho'), buyin('pablo')],
    conteo: { nacho: stack(3000), pablo: stack(1000) },
  };
  const sinPago = calcular(partida(base));
  assert.deepEqual(sinPago.pagos.map((x) => x.importe), [1000]);

  // Pablo le adelanta 6 € a Nacho a mitad de la noche.
  const conPago = calcular(partida({ ...base, movimientos: [...base.movimientos, pago('pablo', 'nacho', 600)] }));
  assert.deepEqual(
    conPago.pagos.map((x) => [x.deNombre, x.aNombre, x.importe]),
    [['Pablo', 'Nacho', 400]],
  );
  // El resultado de la noche no cambia: lo que cambia es lo que queda por pagar.
  const por = Object.fromEntries(conPago.jugadores.map((j) => [j.id, j]));
  assert.equal(por.nacho.resultado, 1000);
  assert.equal(por.pablo.resultado, -1000);
});

test('si alguien lo salda todo durante la partida, al final no debe nada', () => {
  const p = partida({
    jugadores: ['Nacho', 'Pablo'],
    movimientos: [buyin('nacho'), buyin('pablo'), pago('pablo', 'nacho', 1000)],
    conteo: { nacho: stack(3000), pablo: stack(1000) },
  });
  const r = calcular(p);
  assert.deepEqual(r.pagos, []);
  assert.equal(textoCompartir(r).includes('nadie debe nada'), true);
});

/* ── jugador que se retira antes ────────────────────────────────────────── */

test('el que se levanta a media noche queda contado y cuadra igual', () => {
  const p = partida({
    jugadores: ['Nacho', 'Pablo', 'Marta'],
    movimientos: [buyin('nacho'), buyin('pablo'), buyin('marta')],
    // Marta se retira con 25 €; el resto sigue con los 35 € que quedan en mesa.
    conteo: { marta: stack(2500), nacho: stack(2500), pablo: stack(1000) },
  });
  const r = calcular(p);
  assert.equal(r.cuadre.diferencia, 0);
  const por = Object.fromEntries(r.jugadores.map((j) => [j.id, j]));
  assert.equal(por.marta.resultado, 500);
  assert.equal(r.pagos.length, 2);
});

/* ── cuadre ─────────────────────────────────────────────────────────────── */

test('sin contar a todo el mundo no se propone ningún reparto', () => {
  const p = partida({
    jugadores: ['Nacho', 'Pablo'],
    movimientos: [buyin('nacho'), buyin('pablo')],
    conteo: { nacho: stack(4000) },
  });
  const r = calcular(p);
  assert.equal(r.cuadre.todosContados, false);
  assert.deepEqual(r.pagos, []);
});

test('un descuadre señala el color que falta por contar', () => {
  const p = partida({
    jugadores: ['Nacho', 'Pablo'],
    movimientos: [buyin('nacho'), buyin('pablo')],
    conteo: { nacho: { n: 25, r: 3 }, pablo: { n: 13 } },   // 26,50 + 13 = 39,50
  });
  const r = calcular(p);
  assert.equal(r.cuadre.diferencia, -50);
  assert.equal(r.cuadre.pista, 'falta 1 ficha de las rojas');
  assert.deepEqual(r.pagos, []);            // no se reparte una cuenta que no cuadra
});

test('la pista elige la explicación de menos fichas', () => {
  // 3 € se explican con 3 negras, 6 rojas o 30 blancas: gana la negra.
  assert.equal(pistaDelDescuadre(-300, FICHAS), 'faltan 3 fichas de las negras');
  assert.equal(pistaDelDescuadre(300, FICHAS), 'sobran 3 fichas de las negras');
  // 0,70 € no es múltiplo de 0,50 ni de 1 €: solo cuadra con blancas.
  assert.equal(pistaDelDescuadre(-70, FICHAS), 'faltan 7 fichas de las blancas');
  // Sin un múltiplo exacto no se inventa nada.
  assert.equal(pistaDelDescuadre(-7, FICHAS), null);
});

test('avisa si se cuentan más fichas de un color de las que hay en la caja', () => {
  const pocas = [{ id: 'n', nombre: 'Negras', color: '#000', valor: 100, unidades: 10 }];
  const r = calcular({
    ajustes: { buyIn: BUYIN, fichas: pocas },
    jugadores: [{ id: 'nacho', nombre: 'Nacho' }],
    movimientos: [{ tipo: 'buyin', jugador: 'nacho', importe: 1200 }],
    conteo: { nacho: { n: 12 } },
  });
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /12 fichas negras y solo hay 10/);
});

/* ── invariantes ────────────────────────────────────────────────────────── */

test('los saldos suman cero y nunca hacen falta más de N−1 pagos', () => {
  // Partida enredada a propósito: recompras, dos compras entre jugadores y un
  // pago suelto. Generada con una secuencia fija para que el test sea estable.
  const nombres = ['Nacho', 'Pablo', 'Marta', 'Luis', 'Sara'];
  const ids = nombres.map((n) => n.toLowerCase());
  const movimientos = [
    ...ids.map((id) => buyin(id)),
    buyin('pablo'), buyin('luis'), buyin('pablo'),
    compra('marta', 'nacho', 1000),
    compra('sara', 'luis', 500),
    pago('luis', 'sara', 250),
  ];
  // Base total = 8 buy-ins de 20 €; se reparte a mano en un conteo que cuadra.
  const finales = [5000, 2500, 3000, 4500, 1000];
  assert.equal(finales.reduce((a, b) => a + b), 8 * BUYIN);

  const r = calcular(partida({
    jugadores: nombres,
    movimientos,
    conteo: Object.fromEntries(ids.map((id, i) => [id, stack(finales[i])])),
  }));

  assert.equal(r.cuadre.diferencia, 0);
  assert.equal(r.avisos.length, 0);
  assert.equal(r.jugadores.reduce((t, j) => t + j.pendiente, 0), 0);
  assert.equal(r.jugadores.reduce((t, j) => t + j.resultado, 0), 0);
  assert.ok(r.pagos.length <= nombres.length - 1, `${r.pagos.length} pagos para 5 jugadores`);

  // Y aplicar los pagos deja a todo el mundo a cero.
  const saldo = Object.fromEntries(r.jugadores.map((j) => [j.id, j.pendiente]));
  for (const p of r.pagos) { saldo[p.de] += p.importe; saldo[p.a] -= p.importe; }
  assert.ok(Object.values(saldo).every((s) => s === 0), JSON.stringify(saldo));
});

test('repartir deja a cero cualquier reparto de saldos', () => {
  // Barrido determinista de saldos que suman cero.
  for (let semilla = 1; semilla <= 200; semilla++) {
    const n = 2 + (semilla % 6);
    const jugadores = [];
    let acumulado = 0;
    for (let i = 0; i < n - 1; i++) {
      const v = ((semilla * (i + 7)) % 4001) - 2000;   // −20,00 € .. +20,00 €
      acumulado += v;
      jugadores.push({ id: `j${i}`, nombre: `J${i}`, pendiente: v });
    }
    jugadores.push({ id: `j${n - 1}`, nombre: `J${n - 1}`, pendiente: -acumulado });

    const pagos = repartir(jugadores);
    assert.ok(pagos.length <= n - 1, `semilla ${semilla}: ${pagos.length} pagos con ${n} jugadores`);
    assert.ok(pagos.every((p) => p.importe > 0), `semilla ${semilla}: pago de importe cero`);

    const saldo = Object.fromEntries(jugadores.map((j) => [j.id, j.pendiente]));
    for (const p of pagos) { saldo[p.de] += p.importe; saldo[p.a] -= p.importe; }
    assert.ok(Object.values(saldo).every((s) => s === 0), `semilla ${semilla}: ${JSON.stringify(saldo)}`);
  }
});

test('una partida sin jugadores no revienta', () => {
  const r = calcular({ ajustes: { buyIn: BUYIN, fichas: FICHAS }, jugadores: [], movimientos: [], conteo: {} });
  assert.equal(r.numJugadores, 0);
  assert.equal(r.boteTotal, 0);
  assert.equal(r.cuadre.todosContados, false);
  assert.deepEqual(r.pagos, []);
});

test('un movimiento de un jugador borrado avisa en vez de romper', () => {
  const r = calcular({
    ajustes: { buyIn: BUYIN, fichas: FICHAS },
    jugadores: [{ id: 'nacho', nombre: 'Nacho' }],
    movimientos: [buyin('nacho'), buyin('fantasma')],
    conteo: { nacho: stack(2000) },
  });
  assert.equal(r.boteTotal, 2000);
  assert.match(r.avisos[0], /ya no existe/);
});

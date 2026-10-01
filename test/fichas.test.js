import test from 'node:test';
import assert from 'node:assert/strict';

import { sugerirReparto, buyInSugerido, jugadoresQueCaben, validarFichas, FICHAS_POR_DEFECTO } from '../js/fichas.js';
import { valorConteo } from '../js/motor.js';

const valor = (reparto, fichas) => valorConteo(reparto, fichas);

test('el set por defecto es válido', () => {
  assert.deepEqual(validarFichas(FICHAS_POR_DEFECTO), []);
});

test('validarFichas caza los sets rotos', () => {
  assert.match(validarFichas([])[0], /al menos un color/);
  assert.match(validarFichas([{ id: 'a', nombre: 'A', valor: 0 }])[0], /mayor que cero/);
  assert.match(validarFichas([{ id: 'a', nombre: '', valor: 10 }])[0], /sin nombre/);
  const repes = validarFichas([{ id: 'a', nombre: 'A', valor: 10 }, { id: 'a', nombre: 'B', valor: 50 }]);
  assert.ok(repes.some((e) => /mismo identificador/.test(e)));
});

test('el reparto de 20 € cuadra exacto y deja más fichas bajas que altas', () => {
  const { reparto, total, ok, avisos } = sugerirReparto(2000, FICHAS_POR_DEFECTO, 5);
  assert.equal(ok, true);
  assert.equal(total, 2000);
  assert.deepEqual(avisos, []);
  assert.equal(valor(reparto, FICHAS_POR_DEFECTO), 2000);
  // Más fichas de las bajas que de las altas, que es de lo que se trata.
  assert.ok(reparto.blanca > reparto.roja, JSON.stringify(reparto));
  assert.ok(reparto.roja > reparto.negra, JSON.stringify(reparto));
  // Y las altas se llevan la mayor parte del valor.
  assert.ok(reparto.negra * 100 > reparto.blanca * 10);
});

test('el reparto cuadra exacto para muchos buy-ins y números de jugadores', () => {
  for (const buyIn of [500, 1000, 1500, 2000, 2500, 3000, 5000]) {
    for (const n of [1, 2, 4, 6, 8]) {
      const { reparto, total, ok } = sugerirReparto(buyIn, FICHAS_POR_DEFECTO, n);
      if (!ok) continue;                    // sin fichas suficientes ya avisa por su cuenta
      assert.equal(total, buyIn, `buyIn ${buyIn}, ${n} jugadores`);
      assert.equal(valor(reparto, FICHAS_POR_DEFECTO), buyIn);
      for (const f of FICHAS_POR_DEFECTO) {
        assert.ok((reparto[f.id] || 0) * n <= f.unidades, `${f.id} se pasa de stock`);
      }
    }
  }
});

test('avisa cuando la caja no da para tantos jugadores', () => {
  const pocas = [{ id: 'n', nombre: 'Negras', color: '#000', valor: 100, unidades: 10 }];
  const r = sugerirReparto(2000, pocas, 4);
  assert.equal(r.ok, false);
  assert.match(r.avisos[0], /No hay fichas suficientes/);
});

test('no inventa un reparto imposible con los valores dados', () => {
  // Solo fichas de 0,50: un buy-in de 20,25 € no se puede formar.
  const soloRojas = [{ id: 'r', nombre: 'Rojas', color: '#dc2626', valor: 50, unidades: 100 }];
  const r = sugerirReparto(2025, soloRojas, 1);
  assert.equal(r.ok, false);
  assert.match(r.avisos[0], /no se puede formar un buy-in exacto/);

  // Con un importe múltiplo sí, y todo en el único color que hay.
  const bien = sugerirReparto(2000, soloRojas, 1);
  assert.equal(bien.ok, true);
  assert.equal(bien.reparto.r, 40);
});

test('un solo color de 1 € reparte el buy-in redondo', () => {
  const soloNegras = [{ id: 'n', nombre: 'Negras', color: '#000', valor: 100, unidades: 500 }];
  const r = sugerirReparto(2000, soloNegras, 5);
  assert.equal(r.ok, true);
  assert.equal(r.reparto.n, 20);
});

test('sin unidades declaradas no hay tope de stock', () => {
  const sinStock = FICHAS_POR_DEFECTO.map((f) => ({ ...f, unidades: 0 }));
  const r = sugerirReparto(2000, sinStock, 50);
  assert.equal(r.ok, true);
  assert.equal(r.total, 2000);
  assert.deepEqual(r.avisos, []);
});

test('jugadoresQueCaben dice para cuántos da la caja', () => {
  const { reparto } = sugerirReparto(2000, FICHAS_POR_DEFECTO, 1);
  const caben = jugadoresQueCaben(reparto, FICHAS_POR_DEFECTO);
  assert.ok(caben >= 1 && Number.isFinite(caben));
  // El color que más aprieta manda.
  const esperado = Math.min(...FICHAS_POR_DEFECTO
    .filter((f) => reparto[f.id] > 0)
    .map((f) => Math.floor(f.unidades / reparto[f.id])));
  assert.equal(caben, esperado);
  assert.equal(jugadoresQueCaben(reparto, FICHAS_POR_DEFECTO.map((f) => ({ ...f, unidades: 0 }))), Infinity);
});

test('sin buy-in o sin fichas devuelve un aviso, no un reparto raro', () => {
  assert.equal(sugerirReparto(0, FICHAS_POR_DEFECTO, 4).ok, false);
  assert.equal(sugerirReparto(2000, [], 4).ok, false);
});

test('encuentra el reparto exacto aunque el ajuste a ojo no llegue', () => {
  // 0,60 € con fichas de 0,20 y 0,50: solo vale 3 × 0,20. Ir metiendo la más
  // alta que cabe (0,50) deja 0,10 imposible de cerrar.
  const raras = [
    { id: 'a', nombre: 'A', color: '#fff', valor: 20, unidades: 0 },
    { id: 'b', nombre: 'B', color: '#000', valor: 50, unidades: 0 },
  ];
  const r = sugerirReparto(60, raras, 1);
  assert.equal(r.ok, true);
  assert.deepEqual(r.reparto, { a: 3, b: 0 });
});

test('buyInSugerido saca de la caja un buy-in redondo que cuadra', () => {
  // 4 jugadores: 37 blancas + 25 rojas + 25 negras por cabeza = 41,20 € → 40 €.
  assert.equal(buyInSugerido(FICHAS_POR_DEFECTO, 4), 4000);
  for (const n of [2, 3, 5, 6, 8, 10]) {
    const b = buyInSugerido(FICHAS_POR_DEFECTO, n);
    assert.ok(b > 0 && b % 100 === 0, `${n} jugadores: ${b}`);
    const { ok, reparto } = sugerirReparto(b, FICHAS_POR_DEFECTO, n);
    assert.ok(ok, `${n} jugadores`);
    assert.ok(jugadoresQueCaben(reparto, FICHAS_POR_DEFECTO) >= n);
  }
  // Sin unidades declaradas no se puede saber cuánto da la caja.
  assert.equal(buyInSugerido(FICHAS_POR_DEFECTO.map((f) => ({ ...f, unidades: 0 })), 4), 0);
});

test('buyInSugerido no tira un cuarto de la caja por redondear a 5 €', () => {
  // 8 jugadores: la caja da 19,80 € por cabeza. 15 € dejaría fichas de sobra.
  assert.equal(buyInSugerido(FICHAS_POR_DEFECTO, 8), 1900);
});

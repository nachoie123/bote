/* Set de fichas: validación y reparto inicial sugerido.
 * Como motor.js, aritmética pura en céntimos y sin tocar el DOM. */

/** Set por defecto: 20 € de buy-in con blancas de 0,10, rojas de 0,50 y negras de 1 €. */
export const FICHAS_POR_DEFECTO = [
  { id: 'blanca', nombre: 'Blancas', color: '#e8e8ea', valor: 10, unidades: 150 },
  { id: 'roja', nombre: 'Rojas', color: '#dc2626', valor: 50, unidades: 100 },
  { id: 'negra', nombre: 'Negras', color: '#27272a', valor: 100, unidades: 100 },
];

const mcd = (a, b) => (b === 0 ? a : mcd(b, a % b));

/** Comprueba que el set es usable antes de dejar empezar una partida. */
export function validarFichas(fichas) {
  const errores = [];
  if (!fichas.length) errores.push('Añade al menos un color de ficha.');
  for (const f of fichas) {
    if (!f.nombre?.trim()) errores.push('Hay un color sin nombre.');
    if (!(f.valor > 0)) errores.push(`El valor de ${f.nombre || 'un color'} tiene que ser mayor que cero.`);
  }
  const ids = fichas.map((f) => f.id);
  if (new Set(ids).size !== ids.length) errores.push('Hay dos colores con el mismo identificador.');
  return errores;
}

/**
 * Propone cuántas fichas de cada color dar a cada jugador para que sumen
 * exactamente el buy-in.
 *
 * El reparto sigue la proporción de una mesa de verdad: muchas fichas bajas
 * (hacen falta para las ciegas) y pocas altas, aunque las altas se lleven la
 * mayor parte del valor. Se consigue repartiendo el valor en proporción a la
 * raíz del valor de cada ficha, que para 0,10 / 0,50 / 1 € da un 10 / 40 / 50
 * muy parecido a como se reparte a mano.
 *
 * @returns {{reparto: object, total: number, ok: boolean, avisos: string[]}}
 */
export function sugerirReparto(buyIn, fichas, numJugadores = 1) {
  const avisos = [];
  const orden = [...fichas].filter((f) => f.valor > 0).sort((a, b) => a.valor - b.valor);
  if (!orden.length || !(buyIn > 0)) return { reparto: {}, total: 0, ok: false, avisos: ['Faltan fichas o buy-in.'] };

  // Sin un múltiplo común no hay forma de formar el buy-in exacto.
  const paso = orden.reduce((g, f) => mcd(g, f.valor), orden[0].valor);
  if (buyIn % paso !== 0) {
    return {
      reparto: {}, total: 0, ok: false,
      avisos: [`Con estos valores no se puede formar un buy-in exacto de ${(buyIn / 100).toFixed(2)} €.`],
    };
  }

  // Cuántas fichas de cada color puede llevarse un jugador sin dejar sin fichas
  // a los demás. Sin unidades declaradas, sin tope.
  const tope = (f) => (f.unidades > 0 ? Math.floor(f.unidades / Math.max(1, numJugadores)) : Infinity);

  const pesos = orden.map((f) => Math.sqrt(f.valor));
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);

  const reparto = {};
  orden.forEach((f, i) => {
    const objetivo = (buyIn * pesos[i]) / sumaPesos;      // valor que le toca a este color
    reparto[f.id] = Math.min(tope(f), Math.max(0, Math.round(objetivo / f.valor)));
  });

  const suma = () => orden.reduce((t, f) => t + reparto[f.id] * f.valor, 0);

  // Ajuste fino: se cierra la diferencia moviendo fichas, empezando por las de
  // mayor valor que quepan, que es como se corrige a ojo sobre la mesa.
  const desc = [...orden].reverse();
  for (let vuelta = 0; vuelta < 1000; vuelta++) {
    const dif = buyIn - suma();
    if (dif === 0) break;
    let movida = false;
    if (dif > 0) {
      for (const f of desc) {
        if (f.valor <= dif && reparto[f.id] + 1 <= tope(f)) { reparto[f.id]++; movida = true; break; }
      }
    } else {
      for (const f of desc) {
        if (f.valor <= -dif && reparto[f.id] > 0) { reparto[f.id]--; movida = true; break; }
      }
    }
    if (!movida) break;       // no hay ficha que quepa: se sale con el aviso de abajo
  }

  const total = suma();
  const ok = total === buyIn;
  if (!ok) {
    avisos.push(numJugadores > 1
      ? `No hay fichas suficientes para dar ${(buyIn / 100).toFixed(2)} € a ${numJugadores} jugadores.`
      : 'No hay fichas suficientes para formar el buy-in.');
  }
  for (const f of orden) {
    if (f.unidades > 0 && reparto[f.id] * numJugadores > f.unidades) {
      avisos.push(`Faltan fichas ${f.nombre.toLowerCase()}.`);
    }
  }
  return { reparto, total, ok, avisos };
}

/** Cuántos jugadores aguanta la caja con este reparto. Infinity si no hay stock declarado. */
export function jugadoresQueCaben(reparto, fichas) {
  let max = Infinity;
  for (const f of fichas) {
    const n = reparto[f.id] || 0;
    if (n > 0 && f.unidades > 0) max = Math.min(max, Math.floor(f.unidades / n));
  }
  return max;
}

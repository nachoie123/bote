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

/** Lo que le toca a cada uno si la caja se reparte a partes iguales, color a color. */
const tope = (f, numJugadores) => (f.unidades > 0 ? Math.floor(f.unidades / Math.max(1, numJugadores)) : Infinity);

/**
 * Propone cuántas fichas de cada color dar a cada jugador para que sumen
 * exactamente el buy-in, sin pasarse de lo que hay en la caja.
 *
 * Dos pasos:
 *  1. Un reparto ideal, en decimales: el valor se reparte en proporción a la
 *     raíz del valor de cada ficha. Para 0,10 / 0,50 / 1 € da un 10 / 40 / 50,
 *     muchas fichas bajas (hacen falta para las ciegas) y pocas altas.
 *  2. Las fichas enteras más parecidas a ese ideal que sumen el buy-in EXACTO.
 *     Es una mochila acotada (bounded knapsack) y se resuelve con programación
 *     dinámica: prueba todas las combinaciones posibles, así que si existe un
 *     reparto exacto lo encuentra. El ajuste a ojo de antes podía decir «no
 *     cuadra» teniendo solución (p. ej. fichas de 0,20 y 0,50 para 0,60 €).
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

  // 1. Ideal en decimales.
  const pesos = orden.map((f) => Math.sqrt(f.valor));
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  const ideal = orden.map((f, i) => Math.min(tope(f, numJugadores), (buyIn * pesos[i]) / sumaPesos / f.valor));

  // 2. Programación dinámica sobre el importe, en «pasos» (el mcd de los valores).
  // coste[s] = lo mínimo que hay que alejarse del ideal para sumar s pasos con
  // los colores vistos hasta ahora. El alejamiento es relativo, (n - ideal)² / ideal,
  // para que sobrar 2 negras pese más que sobrar 2 blancas.
  const B = buyIn / paso;
  let coste = new Float64Array(B + 1).fill(Infinity);
  coste[0] = 0;
  const elegido = [];                                  // por color: nº de fichas que lleva a cada s
  orden.forEach((f, i) => {
    const u = f.valor / paso;
    const max = Math.min(tope(f, numJugadores), Math.floor(B / u));
    const nuevo = new Float64Array(B + 1).fill(Infinity);
    const cuantas = new Int32Array(B + 1);
    for (let s = 0; s <= B; s++) {
      if (coste[s] === Infinity) continue;
      for (let n = 0, t = s; n <= max && t <= B; n++, t += u) {
        const c = coste[s] + (n - ideal[i]) ** 2 / Math.max(1, ideal[i]);
        if (c < nuevo[t]) { nuevo[t] = c; cuantas[t] = n; }
      }
    }
    elegido.push(cuantas);
    coste = nuevo;
  });

  const reparto = Object.fromEntries(orden.map((f) => [f.id, 0]));
  let total = 0;
  if (coste[B] < Infinity) {
    for (let i = orden.length - 1, s = B; i >= 0; i--) {
      const n = elegido[i][s];
      reparto[orden[i].id] = n;
      s -= n * (orden[i].valor / paso);
    }
    total = buyIn;
  }

  const ok = total === buyIn;
  if (!ok) {
    avisos.push(numJugadores > 1
      ? `No hay fichas suficientes para dar ${(buyIn / 100).toFixed(2)} € a ${numJugadores} jugadores.`
      : 'No hay fichas suficientes para formar el buy-in.');
  }
  return { reparto, total, ok, avisos };
}

/**
 * El buy-in más alto y redondo que da la caja para estos jugadores: lo que
 * vale la parte de cada uno, redondeado hacia abajo a 5 € si así se pierde
 * poco (19,80 € no baja a 15, baja a 19), y bajando hasta que el reparto
 * exacto exista. 0 si no se puede saber
 * (algún color sin unidades declaradas) o no llega ni para un paso.
 */
export function buyInSugerido(fichas, numJugadores) {
  const validas = fichas.filter((f) => f.valor > 0);
  if (!validas.length || validas.some((f) => !(f.unidades > 0))) return 0;
  const maximo = validas.reduce((t, f) => t + tope(f, numJugadores) * f.valor, 0);
  const paso = validas.reduce((g, f) => mcd(g, f.valor), validas[0].valor);
  for (const redondeo of [500, 100, paso]) {
    const r = Math.max(redondeo, paso * Math.ceil(redondeo / paso));
    if (maximo < r) continue;
    const suelo = redondeo === 500 ? maximo * 0.85 : r;
    for (let b = maximo - (maximo % r); b >= suelo; b -= r) {
      if (sugerirReparto(b, validas, numJugadores).ok) return b;
    }
  }
  return 0;
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

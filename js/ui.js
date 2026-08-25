/* Interfaz de Bote. Todo el cálculo vive en motor.js y fichas.js; aquí solo se
 * pinta y se recogen toques. */

import * as E from './estado.js';
import { calcular, euros, aCentimos, valorConteo, textoCompartir } from './motor.js';
import { sugerirReparto, validarFichas, jugadoresQueCaben } from './fichas.js';

/* ── utilidades de DOM ───────────────────────────────────────────────────── */

const $ = (sel) => document.querySelector(sel);

/** Mini hyperscript: h('div', {class:'x', onclick:fn}, 'texto', otroNodo). */
function h(tag, props = {}, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k in el && k !== 'list') el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    el.append(hijo.nodeType ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

const vaciar = (el) => { el.textContent = ''; return el; };
const fecha = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const signoClase = (n) => (n > 0 ? 'gana' : n < 0 ? 'pierde' : '');

/* ── panel inferior ──────────────────────────────────────────────────────── */

const panel = $('#panel');
const panelCuerpo = $('#panel-cuerpo');

function abrirPanel(titulo, ...contenido) {
  $('#panel-titulo').textContent = titulo;
  vaciar(panelCuerpo).append(...contenido.flat().filter(Boolean));
  panel.hidden = false;
}
function cerrarPanel() { panel.hidden = true; vaciar(panelCuerpo); }
panel.addEventListener('click', (ev) => { if (ev.target.dataset.cerrarPanel !== undefined) cerrarPanel(); });

/** Confirmación propia: la nativa enseña el dominio y rompe la ilusión de app. */
function confirmar(titulo, textoBoton = 'Borrar') {
  return new Promise((resolver) => {
    abrirPanel(titulo,
      h('button', { class: 'btn btn--peligro', onclick: () => { cerrarPanel(); resolver(true); } }, textoBoton),
      h('button', { class: 'btn btn--fantasma', onclick: () => { cerrarPanel(); resolver(false); } }, 'Cancelar'));
  });
}

/** Campo de importe con teclado numérico y el buy-in como valor de partida. */
function campoImporte(valorInicial, etiqueta = 'Importe') {
  const input = h('input', {
    type: 'text', inputmode: 'decimal', value: (valorInicial / 100).toFixed(2).replace('.', ','),
    onfocus: (ev) => ev.target.select(),
  });
  const campo = h('label', { class: 'campo' }, h('span', { class: 'campo__etiqueta' }, `${etiqueta} (€)`), input);
  campo.leer = () => aCentimos(input.value);
  campo.input = input;
  return campo;
}

function selectorJugadores(jugadores, etiqueta) {
  const sel = h('select', {}, ...jugadores.map((j) => h('option', { value: j.id }, j.nombre)));
  const campo = h('label', { class: 'campo' }, h('span', { class: 'campo__etiqueta' }, etiqueta), sel);
  campo.leer = () => sel.value;
  return campo;
}

/* ── navegación ──────────────────────────────────────────────────────────── */

let vista = 'inicio';
let verId = null;          // partida que se está mirando (activa o del histórico)

const ATRAS = { ajustes: 'inicio', partida: 'inicio', contar: 'partida', reparto: 'contar' };

function ir(destino, id = verId) {
  vista = destino;
  verId = id;
  cerrarPanel();
  pintar();
  $('#principal').scrollTop = 0;
}

const partidaVista = () => (verId ? E.partidaPorId(verId) : null);

/* ── pintado ─────────────────────────────────────────────────────────────── */

function pintar() {
  const p = partidaVista();
  // Si la partida que se estaba mirando ya no existe, de vuelta al inicio.
  if (vista !== 'inicio' && vista !== 'ajustes' && !p) { vista = 'inicio'; verId = null; }

  document.body.dataset.vista = vista;
  const titulos = {
    inicio: 'Bote',
    ajustes: 'Fichas y buy-in',
    partida: p?.nombre || (p ? `Partida del ${fecha(p.fecha)}` : 'Partida'),
    contar: 'Contar fichas',
    reparto: 'Reparto',
  };
  $('#titulo').textContent = titulos[vista];

  const atras = $('#atras');
  atras.hidden = !ATRAS[vista];
  if (ATRAS[vista]) {
    $('#atras-texto').textContent = { ajustes: 'Bote', partida: 'Bote', contar: 'Partida', reparto: 'Contar' }[vista];
    atras.onclick = () => ir(ATRAS[vista]);
  }

  const accion = $('#accion-barra');
  accion.hidden = true;
  accion.onclick = null;

  ({ inicio: pintarInicio, ajustes: pintarAjustes, partida: pintarPartida, contar: pintarContar, reparto: pintarReparto })[vista]();
}

/* ── vista: inicio ───────────────────────────────────────────────────────── */

function pintarInicio() {
  const cont = vaciar($('#v-inicio'));
  const estado = E.get();
  const activa = E.partidaActiva();
  $('#pie').hidden = false;
  vaciar($('#pie')).append(
    h('button', { class: 'btn btn--principal', onclick: panelNuevaPartida }, 'Nueva partida'));

  if (activa) {
    const r = calcular(activa);
    cont.append(
      h('p', { class: 'rotulo' }, 'En marcha'),
      h('div', { class: 'tarjeta' },
        h('button', {
          class: 'fila',
          onclick: () => ir(activa.cerrada ? 'reparto' : 'partida', activa.id),
        },
          h('div', { class: 'fila__princ' },
            h('div', { class: 'fila__nombre' }, activa.nombre || `Partida del ${fecha(activa.fecha)}`),
            h('div', { class: 'fila__sub' },
              `${r.numJugadores} jugadores · bote ${euros(r.boteTotal)}${r.recompras ? ` · ${r.recompras} ${r.recompras === 1 ? 'recompra' : 'recompras'}` : ''}`)),
          h('span', { class: 'fila__chevron' }, '›'))));
  }

  const historico = estado.partidas.filter((p) => p.id !== estado.activaId);
  cont.append(
    h('p', { class: 'rotulo', style: 'margin-top:20px' }, 'Ajustes'),
    h('div', { class: 'tarjeta' },
      h('button', { class: 'fila', onclick: () => ir('ajustes') },
        h('div', { class: 'fila__princ' },
          h('div', { class: 'fila__nombre' }, 'Fichas y buy-in'),
          h('div', { class: 'fila__sub' },
            `${euros(estado.ajustes.buyIn)} · ${estado.ajustes.fichas.map((f) => f.nombre.toLowerCase()).join(', ')}`)),
        h('span', { class: 'fila__chevron' }, '›'))),
    h('p', { class: 'rotulo', style: 'margin-top:20px' }, 'Histórico'),
    historico.length
      ? h('div', { class: 'tarjeta' }, ...historico.map((p) => {
        const r = calcular(p);
        return h('button', { class: 'fila', onclick: () => ir(p.cerrada ? 'reparto' : 'partida', p.id) },
          h('div', { class: 'fila__princ' },
            h('div', { class: 'fila__nombre' }, p.nombre || fecha(p.fecha)),
            h('div', { class: 'fila__sub' },
              `${p.jugadores.map((j) => j.nombre).join(', ') || 'sin jugadores'}${p.cerrada ? '' : ' · sin cerrar'}`)),
          h('div', { class: 'fila__cifra' }, euros(r.boteTotal)),
          h('span', { class: 'fila__chevron' }, '›'));
      }))
      : h('div', { class: 'tarjeta' }, h('p', { class: 'vacio' }, 'Aquí quedarán guardadas las partidas.')));

  const aviso = avisoInstalar();
  if (aviso) cont.append(aviso);
}

/** Panel de nueva partida, con los nombres de la última ya puestos. */
function panelNuevaPartida() {
  const ultima = E.get().partidas[0];
  const nombres = ultima?.jugadores.map((j) => j.nombre) || [];
  const lista = h('div', { class: 'panel__cuerpo' });

  const añadirCampo = (valor = '') => {
    const input = h('input', { type: 'text', value: valor, placeholder: 'Nombre', autocapitalize: 'words' });
    const fila = h('div', { style: 'display:flex;gap:8px;align-items:center' },
      input,
      h('button', {
        class: 'btn btn--peligro btn--pequeño', 'aria-label': 'Quitar', onclick: () => fila.remove(),
      }, '✕'));
    fila.input = input;
    lista.append(fila);
    return input;
  };

  (nombres.length ? nombres : ['', '']).forEach((n) => añadirCampo(n));

  abrirPanel('¿Quién juega?',
    lista,
    h('button', { class: 'btn btn--fantasma', onclick: () => añadirCampo().focus() }, '+ Añadir jugador'),
    h('button', {
      class: 'btn btn--principal',
      onclick: () => {
        const valores = [...lista.children].map((f) => f.input.value.trim()).filter(Boolean);
        if (!valores.length) return;
        ir('partida', E.crearPartida(valores));
      },
    }, `Empezar con ${euros(E.get().ajustes.buyIn)}`));
}

/* ── vista: ajustes (fichas y buy-in) ────────────────────────────────────── */

function pintarAjustes() {
  const cont = vaciar($('#v-ajustes'));
  const ajustes = E.get().ajustes;
  // Copia de trabajo: no se toca el estado hasta darle a Guardar.
  const fichas = structuredClone(ajustes.fichas);
  let buyIn = ajustes.buyIn;
  let numJugadores = Math.max(2, E.partidaActiva()?.jugadores.length || 4);

  const campoBuyIn = campoImporte(buyIn, 'Buy-in por jugador');
  campoBuyIn.input.addEventListener('input', () => { buyIn = campoBuyIn.leer() ?? buyIn; repintarReparto(); });

  const listaFichas = h('div', { class: 'tarjeta' });
  const cajaReparto = h('div', { class: 'tarjeta' });

  function repintarFichas() {
    vaciar(listaFichas);
    fichas.forEach((f, i) => {
      const punto = h('input', {
        type: 'color', value: f.color, 'aria-label': `Color de ${f.nombre}`,
        style: 'width:34px;height:34px;padding:0;border-radius:50%;border:1px solid var(--borde);background:none;flex:none',
        oninput: (ev) => { f.color = ev.target.value; repintarReparto(); },
      });
      // Dos líneas por color: en 375 px, cuatro campos en fila dejan el nombre
      // recortado a «Bl».
      listaFichas.append(h('div', { class: 'ficha' },
        punto,
        h('input', {
          type: 'text', value: f.nombre, 'aria-label': 'Nombre del color',
          oninput: (ev) => { f.nombre = ev.target.value; repintarReparto(); },
        }),
        h('button', {
          class: 'btn btn--peligro btn--pequeño', 'aria-label': `Quitar ${f.nombre}`,
          onclick: () => { fichas.splice(i, 1); repintarFichas(); repintarReparto(); },
        }, '✕'),
        h('div', { class: 'ficha__abajo' },
          h('label', { class: 'campo' },
            h('span', { class: 'campo__etiqueta' }, 'Valor (€)'),
            h('input', {
              type: 'text', inputmode: 'decimal', value: (f.valor / 100).toFixed(2).replace('.', ','),
              oninput: (ev) => { f.valor = aCentimos(ev.target.value) ?? 0; repintarReparto(); },
            })),
          h('label', { class: 'campo' },
            h('span', { class: 'campo__etiqueta' }, 'En la caja'),
            h('input', {
              type: 'text', inputmode: 'numeric', value: f.unidades || 0,
              oninput: (ev) => { f.unidades = parseInt(ev.target.value, 10) || 0; repintarReparto(); },
            })))));
    });
  }

  function repintarReparto() {
    vaciar(cajaReparto);
    const errores = validarFichas(fichas);
    if (errores.length) {
      cajaReparto.append(h('p', { class: 'vacio' }, errores[0]));
      return;
    }
    const { reparto, total, ok, avisos } = sugerirReparto(buyIn, fichas, numJugadores);
    for (const f of [...fichas].sort((a, b) => a.valor - b.valor)) {
      cajaReparto.append(h('div', { class: 'fila' },
        h('span', { class: 'punto', style: `background:${f.color}` }),
        h('div', { class: 'fila__princ' },
          h('div', { class: 'fila__nombre' }, f.nombre),
          h('div', { class: 'fila__sub' }, `${euros(f.valor)} cada una`)),
        h('div', { class: 'fila__cifra' }, `× ${reparto[f.id] || 0}`)));
    }
    cajaReparto.append(h('div', { class: 'fila' },
      h('div', { class: 'fila__princ fila__nombre' }, ok ? 'Suma exacta' : 'No cuadra'),
      h('div', { class: `fila__cifra ${ok ? 'gana' : 'pierde'}` }, euros(total))));
    if (ok) {
      const caben = jugadoresQueCaben(reparto, fichas);
      cajaReparto.append(h('div', { class: 'fila' },
        h('div', { class: 'fila__princ fila__sub' },
          Number.isFinite(caben) ? `Con las fichas de la caja llegáis a ${caben} jugadores.` : 'Sin límite de fichas declarado.')));
    }
    for (const a of avisos) cajaReparto.append(h('div', { class: 'fila' }, h('div', { class: 'fila__princ fila__sub pierde' }, a)));
  }

  const selJugadores = h('select', {
    onchange: (ev) => { numJugadores = parseInt(ev.target.value, 10); repintarReparto(); },
  }, ...Array.from({ length: 11 }, (_, i) => i + 2).map((n) =>
    h('option', { value: n, selected: n === numJugadores }, `${n} jugadores`)));

  repintarFichas();
  repintarReparto();

  cont.append(
    h('div', { class: 'bloque' }, campoBuyIn),
    h('div', { class: 'bloque' },
      h('p', { class: 'rotulo' }, 'Colores y valores'),
      listaFichas,
      h('button', {
        class: 'btn btn--fantasma', style: 'margin-top:8px',
        onclick: () => {
          fichas.push({ id: E.nuevoId(), nombre: 'Nuevo color', color: '#3b82f6', valor: 100, unidades: 0 });
          repintarFichas(); repintarReparto();
        },
      }, '+ Añadir color')),
    h('div', { class: 'bloque' },
      h('p', { class: 'rotulo' }, 'Reparto inicial sugerido'),
      h('label', { class: 'campo', style: 'margin-bottom:8px' },
        h('span', { class: 'campo__etiqueta' }, 'Para cuántos jugadores'), selJugadores),
      cajaReparto));

  $('#pie').hidden = false;
  vaciar($('#pie')).append(h('button', {
    class: 'btn btn--principal',
    onclick: () => {
      const errores = validarFichas(fichas);
      if (errores.length) { abrirPanel('No se puede guardar', h('p', {}, errores[0]), h('button', { class: 'btn btn--fantasma', onclick: cerrarPanel }, 'Vale')); return; }
      E.guardarAjustes({ buyIn, fichas });
      ir('inicio');
    },
  }, 'Guardar'));
}

/* ── vista: partida ──────────────────────────────────────────────────────── */

function pintarPartida() {
  const p = partidaVista();
  const cont = vaciar($('#v-partida'));
  const r = calcular(p);

  const accion = $('#accion-barra');
  accion.hidden = false;
  accion.textContent = 'Renombrar';
  accion.onclick = () => panelRenombrarPartida(p);

  cont.append(h('div', { class: 'marcador' },
    dato(r.numJugadores, 'jugadores'),
    dato(euros(r.boteTotal), 'bote'),
    dato(r.recompras, r.recompras === 1 ? 'recompra' : 'recompras')));

  for (const a of r.avisos) cont.append(h('div', { class: 'aviso' }, a));

  cont.append(
    h('p', { class: 'rotulo' }, 'Jugadores'),
    h('div', { class: 'tarjeta' }, ...r.jugadores.map((j) =>
      h('button', { class: 'fila', onclick: () => panelJugador(p, j) },
        h('div', { class: 'fila__princ' },
          h('div', { class: 'fila__nombre' }, j.nombre),
          h('div', { class: 'fila__sub' }, resumenJugador(j))),
        h('div', { class: 'fila__cifra' }, euros(j.base)),
        h('span', { class: 'fila__chevron' }, '›'))),
    r.jugadores.length ? null : h('p', { class: 'vacio' }, 'Aún no hay nadie en la mesa.')));

  const movs = [...p.movimientos].reverse();
  cont.append(
    h('p', { class: 'rotulo', style: 'margin-top:20px' }, 'Movimientos'),
    h('div', { class: 'tarjeta' }, ...movs.map((m) =>
      h('div', { class: 'fila' },
        h('div', { class: 'fila__princ' },
          h('div', { class: 'fila__nombre fila__nombre--largo' }, textoMovimiento(p, m)),
          h('div', { class: 'fila__sub' }, new Date(m.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))),
        p.cerrada ? null : h('button', {
          class: 'btn btn--peligro btn--pequeño', 'aria-label': 'Deshacer este movimiento',
          onclick: async () => { if (await confirmar('¿Deshacer este movimiento?', 'Deshacer')) E.borrarMovimiento(p.id, m.id); },
        }, '✕'))),
    movs.length ? null : h('p', { class: 'vacio' }, 'Sin movimientos todavía.')));

  $('#pie').hidden = false;
  vaciar($('#pie')).append(
    h('div', { class: 'botonera' },
      h('button', { class: 'btn btn--fantasma', onclick: () => panelAñadirJugador(p) }, '+ Jugador'),
      h('button', { class: 'btn btn--principal', disabled: !r.numJugadores, onclick: () => ir('contar') }, 'Contar fichas')));
}

const dato = (cifra, pie) => h('div', { class: 'marcador__dato' },
  h('div', { class: 'marcador__cifra' }, cifra), h('div', { class: 'marcador__pie' }, pie));

function resumenJugador(j) {
  const partes = [`${j.buyins} ${j.buyins === 1 ? 'entrada' : 'entradas'}`];
  if (j.pagado) partes.push(`ha puesto ${euros(j.pagado)}`);
  if (j.cobrado) partes.push(`ha cobrado ${euros(j.cobrado)}`);
  return partes.join(' · ');
}

function nombreDe(p, id) { return p.jugadores.find((j) => j.id === id)?.nombre || '—'; }

function textoMovimiento(p, m) {
  if (m.tipo === 'buyin') return `${nombreDe(p, m.jugador)} entra con ${euros(m.importe)}`;
  if (m.tipo === 'compra_a_jugador') return `${nombreDe(p, m.comprador)} le compra ${euros(m.importe)} en fichas a ${nombreDe(p, m.vendedor)}`;
  return `${nombreDe(p, m.de)} le paga ${euros(m.importe)} a ${nombreDe(p, m.a)}`;
}

function panelAñadirJugador(p) {
  const input = h('input', { type: 'text', placeholder: 'Nombre', autocapitalize: 'words' });
  const meter = () => { if (input.value.trim()) { E.añadirJugador(p.id, input.value); cerrarPanel(); } };
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') meter(); });
  abrirPanel('Se sienta alguien más',
    h('label', { class: 'campo' }, h('span', { class: 'campo__etiqueta' }, 'Nombre'), input),
    h('p', { class: 'fila__sub' }, `Entra con ${euros(p.ajustes.buyIn)}, como todos.`),
    h('button', { class: 'btn btn--principal', onclick: meter }, 'Añadir'));
  setTimeout(() => input.focus(), 80);
}

function panelRenombrarPartida(p) {
  const input = h('input', { type: 'text', value: p.nombre, placeholder: `Partida del ${fecha(p.fecha)}` });
  abrirPanel('Nombre de la partida',
    input,
    h('button', { class: 'btn btn--principal', onclick: () => { E.renombrarPartida(p.id, input.value.trim()); cerrarPanel(); pintar(); } }, 'Guardar'),
    p.cerrada ? null : h('button', {
      class: 'btn btn--peligro',
      onclick: async () => { if (await confirmar('¿Borrar la partida entera?')) { E.borrarPartida(p.id); ir('inicio', null); } },
    }, 'Borrar partida'));
}

/** Acciones sobre un jugador: recompra, compra de fichas a otro, pago, retoques. */
function panelJugador(p, j) {
  if (p.cerrada) return;
  const otros = p.jugadores.filter((x) => x.id !== j.id);
  abrirPanel(j.nombre,
    h('button', {
      class: 'btn btn--principal',
      onclick: () => { E.añadirMovimiento(p.id, { tipo: 'buyin', jugador: j.id, importe: p.ajustes.buyIn }); cerrarPanel(); },
    }, `Recompra de ${euros(p.ajustes.buyIn)}`),
    h('button', { class: 'btn btn--fantasma', onclick: () => panelRecompraOtra(p, j) }, 'Recompra de otro importe'),
    otros.length ? h('button', { class: 'btn btn--fantasma', onclick: () => panelCompraAJugador(p, j, otros) }, 'Le compra fichas a otro') : null,
    otros.length ? h('button', { class: 'btn btn--fantasma', onclick: () => panelPago(p, j, otros) }, 'Le paga dinero a otro') : null,
    h('button', { class: 'btn btn--fantasma', onclick: () => panelRenombrarJugador(p, j) }, 'Cambiar el nombre'),
    h('button', {
      class: 'btn btn--peligro',
      onclick: async () => { if (await confirmar(`¿Quitar a ${j.nombre} y todo lo suyo?`, 'Quitar')) E.quitarJugador(p.id, j.id); },
    }, 'Quitar de la mesa'));
}

function panelRecompraOtra(p, j) {
  const campo = campoImporte(p.ajustes.buyIn);
  abrirPanel(`Recompra de ${j.nombre}`, campo,
    h('button', {
      class: 'btn btn--principal',
      onclick: () => {
        const importe = campo.leer();
        if (!importe || importe <= 0) return;
        E.añadirMovimiento(p.id, { tipo: 'buyin', jugador: j.id, importe });
        cerrarPanel();
      },
    }, 'Apuntar'));
}

function panelCompraAJugador(p, j, otros) {
  const quien = selectorJugadores(otros, '¿A quién le compra las fichas?');
  const campo = campoImporte(1000);
  abrirPanel(`${j.nombre} compra fichas`,
    h('p', { class: 'fila__sub' },
      `${j.nombre} suelta el dinero y recibe las fichas del otro. No entran fichas nuevas en la mesa.`),
    quien, campo,
    h('button', {
      class: 'btn btn--principal',
      onclick: () => {
        const importe = campo.leer();
        if (!importe || importe <= 0) return;
        E.añadirMovimiento(p.id, { tipo: 'compra_a_jugador', comprador: j.id, vendedor: quien.leer(), importe });
        cerrarPanel();
      },
    }, 'Apuntar'));
}

function panelPago(p, j, otros) {
  const quien = selectorJugadores(otros, '¿A quién le paga?');
  const campo = campoImporte(p.ajustes.buyIn);
  abrirPanel(`${j.nombre} paga`,
    h('p', { class: 'fila__sub' }, 'Dinero suelto, sin fichas de por medio. Se descuenta del reparto final.'),
    quien, campo,
    h('button', {
      class: 'btn btn--principal',
      onclick: () => {
        const importe = campo.leer();
        if (!importe || importe <= 0) return;
        E.añadirMovimiento(p.id, { tipo: 'pago', de: j.id, a: quien.leer(), importe });
        cerrarPanel();
      },
    }, 'Apuntar'));
}

function panelRenombrarJugador(p, j) {
  const input = h('input', { type: 'text', value: j.nombre, autocapitalize: 'words' });
  abrirPanel('Cambiar el nombre', input,
    h('button', { class: 'btn btn--principal', onclick: () => { E.renombrarJugador(p.id, j.id, input.value); cerrarPanel(); } }, 'Guardar'));
}

/* ── vista: contar ───────────────────────────────────────────────────────── */

function pintarContar() {
  const p = partidaVista();
  const cont = vaciar($('#v-contar'));
  const r = calcular(p);
  const { cuadre } = r;

  const cuadrado = cuadre.todosContados && cuadre.diferencia === 0;
  cont.append(h('div', { class: `cuadre ${cuadrado ? 'cuadre--ok' : cuadre.todosContados ? 'cuadre--mal' : ''}` },
    h('div', { class: 'cuadre__titulo' },
      cuadrado ? 'La cuenta cuadra' : `Contado ${euros(cuadre.finalTotal)} de ${euros(cuadre.baseTotal)}`),
    h('div', { class: 'cuadre__detalle' }, textoCuadre(p, r))));

  for (const a of r.avisos) cont.append(h('div', { class: 'aviso' }, a));

  cont.append(h('div', { class: 'tarjeta' }, ...r.jugadores.map((j) =>
    h('button', { class: 'fila', onclick: () => panelContar(p, j.id) },
      h('div', { class: 'fila__princ' },
        h('div', { class: 'fila__nombre' }, j.nombre),
        h('div', { class: 'fila__sub' }, j.contado ? `puso ${euros(j.base)}` : 'sin contar')),
      h('div', { class: `fila__cifra ${j.contado ? signoClase(j.resultado) : ''}` },
        j.contado ? euros(j.final) : '—'),
      h('span', { class: 'fila__chevron' }, '›')))));

  $('#pie').hidden = false;
  vaciar($('#pie')).append(h('button', {
    class: 'btn btn--principal', disabled: !cuadrado, onclick: () => ir('reparto'),
  }, cuadrado ? 'Ver el reparto' : 'Falta cuadrar la cuenta'));
}

/** El mensaje del cuadre: lo que de verdad ayuda es decir dónde mirar. */
function textoCuadre(p, r) {
  const { cuadre } = r;
  if (!cuadre.todosContados) {
    const faltan = r.jugadores.filter((j) => !j.contado);
    return `Falta contar a ${faltan.map((j) => j.nombre).join(', ')}.`;
  }
  if (cuadre.diferencia === 0) return 'Las fichas contadas valen justo lo que se ha metido en la mesa.';
  const dif = cuadre.diferencia;
  const partes = [dif > 0
    ? `Hay ${euros(dif)} de más en fichas.`
    : `Faltan ${euros(-dif)} en fichas.`];
  // La causa más típica de que sobren fichas es una recompra sin apuntar.
  if (dif > 0 && p.ajustes.buyIn > 0 && dif % p.ajustes.buyIn === 0) {
    const n = dif / p.ajustes.buyIn;
    partes.push(`¿Falta apuntar ${n === 1 ? 'una recompra' : `${n} recompras`} de ${euros(p.ajustes.buyIn)}?`);
  } else if (cuadre.pista) {
    partes.push(`Seguramente ${cuadre.pista}.`);
  }
  return partes.join(' ');
}

/** Conteo de un jugador: un contador por color y el total en vivo. */
function panelContar(p, jugadorId) {
  const fichas = [...p.ajustes.fichas].sort((a, b) => b.valor - a.valor);
  const actual = { ...(p.conteo[jugadorId] || {}) };
  const total = h('div', { class: 'fila__cifra', style: 'font-size:22px' });
  const base = calcular(p).jugadores.find((j) => j.id === jugadorId)?.base || 0;
  const diferencia = h('div', { class: 'fila__sub' });

  function refrescarTotal() {
    const v = valorConteo(actual, fichas);
    total.textContent = euros(v);
    const d = v - base;
    diferencia.textContent = d === 0 ? 'justo lo que puso' : `${euros(d, { signo: true })} sobre lo que puso`;
    diferencia.className = `fila__sub ${signoClase(d)}`;
  }

  const filas = fichas.map((f) => {
    const input = h('input', {
      type: 'text', inputmode: 'numeric', value: actual[f.id] || 0, 'aria-label': `Fichas ${f.nombre}`,
      onfocus: (ev) => ev.target.select(),
      oninput: (ev) => { actual[f.id] = Math.max(0, parseInt(ev.target.value, 10) || 0); refrescarTotal(); },
    });
    const mover = (n) => {
      actual[f.id] = Math.max(0, (actual[f.id] || 0) + n);
      input.value = actual[f.id];
      refrescarTotal();
    };
    return h('div', { class: 'fila' },
      h('span', { class: 'punto', style: `background:${f.color}` }),
      h('div', { class: 'fila__princ' },
        h('div', { class: 'fila__nombre' }, f.nombre),
        h('div', { class: 'fila__sub' }, euros(f.valor))),
      h('div', { class: 'contador' },
        h('button', { class: 'contador__btn', 'aria-label': `Una ficha ${f.nombre} menos`, onclick: () => mover(-1) }, '−'),
        input,
        h('button', { class: 'contador__btn', 'aria-label': `Una ficha ${f.nombre} más`, onclick: () => mover(1) }, '+')));
  });

  refrescarTotal();
  const nombre = nombreDe(p, jugadorId);

  abrirPanel(`Fichas de ${nombre}`,
    h('div', { class: 'tarjeta' }, ...filas,
      h('div', { class: 'fila' },
        h('div', { class: 'fila__princ' }, h('div', { class: 'fila__nombre' }, 'Total'), diferencia),
        total)),
    h('button', {
      class: 'btn btn--principal',
      onclick: () => { E.fijarConteo(p.id, jugadorId, actual); cerrarPanel(); },
    }, 'Guardar el conteo'),
    p.conteo[jugadorId]
      ? h('button', { class: 'btn btn--peligro', onclick: () => { E.fijarConteo(p.id, jugadorId, null); cerrarPanel(); } }, 'Deshacer el conteo')
      : null);
}

/* ── vista: reparto ──────────────────────────────────────────────────────── */

function pintarReparto() {
  const p = partidaVista();
  const cont = vaciar($('#v-reparto'));
  const r = calcular(p);
  const titulo = p.nombre || `Partida del ${fecha(p.fecha)}`;

  if (!r.pagos.length && !r.cuadre.todosContados) {
    cont.append(h('p', { class: 'vacio' }, 'Todavía falta contar fichas.'));
    $('#pie').hidden = true;
    return;
  }

  const orden = [...r.jugadores].sort((a, b) => b.resultado - a.resultado);
  cont.append(
    h('p', { class: 'rotulo' }, 'Cómo ha ido la noche'),
    h('div', { class: 'tarjeta' }, ...orden.map((j) =>
      h('div', { class: 'fila' },
        h('div', { class: 'fila__princ' },
          h('div', { class: 'fila__nombre' }, j.nombre),
          h('div', { class: 'fila__sub' }, `puso ${euros(j.base)} · acabó con ${euros(j.final)}`)),
        h('div', { class: `fila__cifra ${signoClase(j.resultado)}` }, euros(j.resultado, { signo: true }))))),

    h('p', { class: 'rotulo', style: 'margin-top:20px' }, 'Quién paga a quién'),
    h('div', { class: 'tarjeta' },
      r.pagos.length
        ? r.pagos.map((pg) => h('div', { class: 'fila' },
          h('div', { class: 'fila__princ pago' },
            h('span', { class: 'fila__nombre' }, pg.deNombre),
            h('span', { class: 'pago__flecha' }, '→'),
            h('span', { class: 'fila__nombre' }, pg.aNombre)),
          h('div', { class: 'fila__cifra' }, euros(pg.importe))))
        : h('p', { class: 'vacio' }, 'Nadie debe nada: la noche ya está saldada.')));

  const yaMovido = r.jugadores.some((j) => j.pagado || j.cobrado);
  if (yaMovido) {
    cont.append(h('p', { class: 'fila__sub', style: 'margin:12px 4px' },
      'Ya está descontado el dinero que cambió de manos durante la partida.'));
  }

  $('#pie').hidden = false;
  vaciar($('#pie')).append(
    h('button', { class: 'btn btn--principal', onclick: () => compartir(r, titulo) }, 'Compartir el reparto'),
    p.cerrada
      ? h('button', { class: 'btn btn--fantasma', onclick: () => { E.reabrirPartida(p.id); ir('contar'); } }, 'Reabrir para corregir')
      : h('button', { class: 'btn btn--fantasma', onclick: () => { E.cerrarPartida(p.id); ir('inicio', null); } }, 'Cerrar partida'));
}

async function compartir(resumen, titulo) {
  const texto = textoCompartir(resumen, { titulo });
  try {
    if (navigator.share) { await navigator.share({ text: texto }); return; }
    await navigator.clipboard.writeText(texto);
    abrirPanel('Copiado', h('p', {}, 'El reparto está en el portapapeles.'),
      h('button', { class: 'btn btn--fantasma', onclick: cerrarPanel }, 'Vale'));
  } catch (e) {
    if (e?.name === 'AbortError') return;      // el usuario cerró la hoja de compartir
    abrirPanel('Reparto', h('pre', { style: 'white-space:pre-wrap;user-select:text;font:inherit' }, texto),
      h('button', { class: 'btn btn--fantasma', onclick: cerrarPanel }, 'Vale'));
  }
}

/* ── aviso de instalación ────────────────────────────────────────────────── */

/** ¿Merece la pena enseñar el «añádela a la pantalla de inicio»? */
function tocaAvisarInstalar() {
  const instalada = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return !instalada && esIOS && !localStorage.getItem('bote.instalar-visto');
}

/** El aviso vive dentro del inicio, debajo de todo: así no tapa el pie. Se
 * construye entero cada vez, porque repintar el inicio se lleva por delante lo
 * que hubiera dentro. */
function avisoInstalar() {
  if (!tocaAvisarInstalar()) return null;
  const caja = h('div', { class: 'instalar' },
    h('p', {}, 'Añádela a la pantalla de inicio y se abre como una app.'),
    h('p', { class: 'instalar__gesto' }, 'Compartir → «Añadir a pantalla de inicio»'),
    h('button', {
      class: 'instalar__cerrar', 'aria-label': 'Cerrar aviso',
      onclick: () => { localStorage.setItem('bote.instalar-visto', '1'); caja.remove(); },
    }, '✕'));
  return caja;
}

/* ── arranque ────────────────────────────────────────────────────────────── */

E.suscribir(() => pintar());
// Al abrir, se retoma la partida en marcha: es lo que uno quiere a media noche.
const activa = E.partidaActiva();
if (activa) { verId = activa.id; vista = activa.cerrada ? 'reparto' : 'partida'; }
pintar();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

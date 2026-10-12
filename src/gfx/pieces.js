// Piezas de un dibujo vectorial de DAAD, para seleccionarlas y editarlas.
//
// Un dibujo de DAAD no tiene objetos: es una lista de órdenes para una pluma,
// casi todas relativas a donde quedó la anterior, y los colores que se cambian
// valen para todo lo que viene detrás. Aquí la lista se parte en piezas:
//   - un trazo: empieza en un punto o un "ir a" (o en un mover relativo) y
//     sigue con sus líneas; el relleno o la trama de detrás va con él
//   - un bloque de color, una letra o un subdibujo (GOSUB): una pieza cada uno
//   - los cambios de tinta, papel, brillo y parpadeo van con la pieza siguiente
//
// Para que una edición no mueva nada más, cada pieza recuerda cómo estaban la
// pluma y los colores cuando empezaba. Al rehacer el dibujo (rebuild) se
// simula la pluma y, si a una pieza le llega otra cosa, se le pone delante lo
// que haga falta: un "ir a" o los colores. Así mover, borrar, reordenar o pegar
// deja el resto del dibujo igual.
import { decode, enc, opLen } from './vector.js';
import { Painter } from './drawstring.js';

const TMP = 256;                                    // número de dibujo para pintar trozos sueltos
const W = 256, H = 176;
const COLOURS = ['ink', 'paper', 'bright', 'flash'];
const rowAddr = (y) => ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);
const isColour = (o) => COLOURS.includes(o.kind);
const clone = (x) => JSON.parse(JSON.stringify(x));

// Colores vigentes en el pintor (8 = transparente)
function colState(p) {
  return {
    ink: p.mask & 0x07 ? 8 : p.attr & 7,
    paper: p.mask & 0x38 ? 8 : (p.attr >> 3) & 7,
    bright: p.mask & 0x40 ? 8 : (p.attr >> 6) & 1,
    flash: p.mask & 0x80 ? 8 : (p.attr >> 7) & 1,
  };
}

// Un pintor como el de paint(): la ventana del dibujo borrada con su papel y su tinta
function painter(ctx, mem = new Uint8Array(6912)) {
  const pic = ctx.pic || {};
  const attr = ((pic.paper ?? 0) & 7) << 3 | ((pic.ink ?? 7) & 7);
  const top = pic.line ?? 0, rows = pic.height ?? 12;
  for (let r = top; r < Math.min(24, top + rows); r++) mem.fill(attr, 6144 + r * 32, 6144 + r * 32 + 32);
  const lib = (ctx.lib || []).slice();
  const p = new Painter(mem, lib, { kind: 'daad', charset: ctx.charset });
  p.setColours(attr);
  p.lib = lib;
  return p;
}
// Pinta un trozo de órdenes con el estado (pluma, colores) que tenga el pintor
function runChunk(p, bytes) {
  p.lib[TMP] = { data: [...bytes, 7] };
  p.pics = p.lib;
  p.run(TMP);
}

// --------------------------------------------------------------- partir en piezas
// Devuelve [{ i0, i1, kind }] (órdenes de i0 a i1-1)
export function split(ops) {
  const out = [];
  let cur = null, pending = [];
  const start = (i, kind) => {
    cur = { i0: pending.length ? pending[0] : i, i1: i + 1, kind };
    pending = [];
    out.push(cur);
  };
  ops.forEach((o, i) => {
    if (isColour(o)) { pending.push(i); return; }
    switch (o.kind) {
      case 'plot': case 'move': case 'rmove': start(i, 'stroke'); break;
      case 'line':
      case 'fill': case 'shade':
        if (cur && cur.kind === 'stroke') { cur.i1 = i + 1; pending = []; }
        else start(i, o.kind === 'line' ? 'stroke' : 'fill');
        break;
      case 'gosub':
        // un "ir a" o un mover justo antes es para colocar el subdibujo: van juntos
        if (cur && cur.kind === 'stroke' && ops.slice(cur.i0, cur.i1).every((x) => isColour(x) || x.kind === 'move' || x.kind === 'rmove')) {
          cur.i1 = i + 1; cur.kind = 'gosub'; pending = [];
        } else start(i, 'gosub');
        break;
      default: start(i, o.kind);                     // block, text
    }
  });
  if (pending.length) out.push({ i0: pending[0], i1: ops.length, kind: 'colour' });
  return out;
}

// El primer orden que no es de color
const firstReal = (ops) => ops.findIndex((o) => !isColour(o));

// ¿La pieza necesita saber dónde está la pluma? (las que empiezan con un punto
// o un "ir a" no; los bloques y las letras tampoco)
function needsPen(ops) {
  const f = ops[firstReal(ops)];
  return !!f && !['plot', 'move', 'block', 'text'].includes(f.kind);
}

// ¿Un subdibujo se coloca solo? (entonces moverlo no sirve de nada)
function selfPlaced(data) {
  const ops = decode(data || [7]);
  const f = ops[firstReal(ops)];
  return !!f && (f.kind === 'plot' || f.kind === 'move');
}

// --------------------------------------------------------------- análisis
// ctx: { lib (dibujos por número), charset, pic (ventana y colores) }
// Devuelve las piezas con su posición y un mapa de quién pintó cada punto
export function analyze(d, ctx) {
  const ops = decode(d);
  const parts = split(ops);
  const p = painter(ctx);
  const mem = p.mem;
  const owner = new Int16Array(W * H).fill(-1);       // pieza que pintó cada punto (y de arriba abajo)
  const cellOwner = new Int16Array(768).fill(-1);
  const pieces = parts.map((part, k) => {
    const pops = ops.slice(part.i0, part.i1);
    const at0 = pops[0].at, last = pops[pops.length - 1];
    const bytes = d.slice(at0, last.at + last.len);
    const pen0 = { x: p.x, y: p.y }, col0 = colState(p);
    const before = mem.slice();
    runChunk(p, bytes);
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (let sy = 0; sy < H; sy++) {
      const a = rowAddr(sy);
      for (let c = 0; c < 32; c++) {
        const diff = before[a + c] ^ mem[a + c];
        if (!diff) continue;
        for (let b = 0; b < 8; b++) if (diff & (0x80 >> b)) {
          const sx = c * 8 + b;
          owner[sy * W + sx] = k;
          if (sx < x0) x0 = sx; if (sx > x1) x1 = sx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
        }
      }
    }
    const first = pops[firstReal(pops)];
    if (first && (first.kind === 'block' || first.kind === 'text')) {
      const h = first.kind === 'block' ? first.h : 0, w = first.kind === 'block' ? first.w : 0;
      for (let r = first.row; r <= first.row + h && r < 24; r++) for (let c = first.col; c <= first.col + w && c < 32; c++) cellOwner[r * 32 + c] = k;
      x0 = Math.min(x0, first.col * 8); x1 = Math.max(x1, (first.col + w + 1) * 8 - 1);
      y0 = Math.min(y0, first.row * 8); y1 = Math.max(y1, Math.min(H, (first.row + h + 1) * 8) - 1);
    }
    const g = pops.find((o) => o.kind === 'gosub');
    const sub = g ? ctx.lib?.[g.n]?.data : null;
    return {
      i0: part.i0, i1: part.i1, kind: part.kind, bytes, pen0, col0, pen1: { x: p.x, y: p.y },
      needsPen: needsPen(pops),
      // caja en coordenadas de pantalla (y de arriba abajo), o null si no pinta nada
      box: x1 >= 0 ? { x0, y0, x1, y1 } : null,
      movable: !(g && selfPlaced(sub)),
      kinds: pops.map((o) => o.kind),
    };
  });
  return { ops, pieces, owner, cellOwner };
}

// La pieza que hay en (sx, sy) (pantalla, y de arriba abajo), mirando un
// poco alrededor; la de más arriba (la última pintada) gana
export function hit(A, sx, sy, r = 2) {
  let best = -1, bestD = 1e9;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x < 0 || x >= W || y < 0 || y >= H) continue;
    const k = A.owner[y * W + x];
    if (k < 0) continue;
    const dd = dx * dx + dy * dy;
    if (dd < bestD || (dd === bestD && k > best)) { best = k; bestD = dd; }
  }
  if (best >= 0) return best;
  if (sx >= 0 && sx < W && sy >= 0 && sy < 192) return A.cellOwner[(sy >> 3) * 32 + (sx >> 3)];
  return -1;
}

// Piezas que caben enteras en un rectángulo (pantalla)
export function inRect(A, x0, y0, x1, y1) {
  const out = [];
  A.pieces.forEach((pc, k) => {
    const b = pc.box;
    if (b && b.x0 >= x0 && b.x1 <= x1 && b.y0 >= y0 && b.y1 <= y1) out.push(k);
  });
  return out;
}

// Caja de varias piezas
export function boxOf(A, sel) {
  let b = null;
  for (const k of sel) {
    const c = A.pieces[k]?.box;
    if (!c) continue;
    b = b ? { x0: Math.min(b.x0, c.x0), y0: Math.min(b.y0, c.y0), x1: Math.max(b.x1, c.x1), y1: Math.max(b.y1, c.y1) } : { ...c };
  }
  return b;
}

// --------------------------------------------------------------- rehacer
// entries: [{ bytes, pen0, col0, needsPen }]. Pinta en orden y, cuando a una
// pieza le llega una pluma o unos colores distintos de los que tenía, le pone
// delante lo que falta. Con start (subdibujos) la pluma empieza ahí y las
// posiciones se dan en relativo.
export function rebuild(entries, ctx, { start = null } = {}) {
  const p = painter(ctx);
  if (start) {
    p.x = start.pen.x; p.y = start.pen.y;
    for (const f of COLOURS) p.colour(f, start.col[f]);
  }
  // ¿Se sabe dónde está la pluma? Al empezar un dibujo de localidad, no: la
  // deja donde quiera el anterior. Los subdibujos empiezan donde los llaman.
  let known = !!start || ctx.pic?.location === false;
  const out = [];
  for (const e of entries) {
    let b = e.bytes;
    const ops = decode(b);
    const own = new Set();
    for (const o of ops) { if (!isColour(o)) break; own.add(o.kind); }
    let lead = [];
    if (start) b = relative(b, p, e);
    else if (e.needsPen && (p.x !== e.pen0.x || p.y !== e.pen0.y)) {
      if (known) b = anchor(b, e.pen0, p);
      else {
        // un "ir a" pinta el atributo de su cuadro: con los colores
        // transparentes no cambia nada
        ({ lead, b } = anchorAbs(b, e.pen0));
        runChunk(p, lead);
      }
    }
    const fix = [];
    const cs = colState(p);
    // (los colores sueltos del final no pintan nada: no hace falta arreglarles nada)
    if (e.kind !== 'colour') for (const f of COLOURS) if (!own.has(f) && cs[f] !== e.col0[f]) fix.push(...enc[f](e.col0[f]));
    const chunk = [...fix, ...b];
    runChunk(p, chunk);
    out.push(...lead, ...chunk);
    if (!known && placesPen(decode(chunk), ctx)) known = true;
  }
  return [...out, 7];
}

// ¿Estas órdenes dejan la pluma en un sitio fijo?
function placesPen(ops, ctx) {
  return ops.some((o) => o.kind === 'plot' || o.kind === 'move' || (o.kind === 'gosub' && selfPlaced(ctx.lib?.[o.n]?.data)));
}

// Como anchor, pero sin saber dónde está la pluma: un "ir a" con los colores transparentes
function anchorAbs(bytes, pen) {
  const ops = decode(bytes);
  const f = firstReal(ops);
  const o = ops[f];
  const to = o.kind === 'rmove' ? { x: pen.x + o.dx, y: pen.y + o.dy } : pen;
  const lead = [...enc.paper(8), ...enc.ink(8), ...enc.bright(8), ...enc.flash(8), ...enc.move(to.x & 255, ((to.y % 176) + 176) % 176)];
  return { lead, b: o.kind === 'rmove' ? [...bytes.slice(0, o.at), ...bytes.slice(o.at + o.len)] : bytes };
}

// A la pieza le llega la pluma en otro sitio: se lleva la pluma a donde la
// tenía con un mover relativo (un "ir a" no vale: en DAAD pinta el atributo
// del cuadro). Si ya empezaba con un mover, se cambia ese.
const wrapDelta = (d, m) => { d = ((d % m) + m) % m; return d > m / 2 ? d - m : d; };
function anchor(bytes, pen, p) {
  const ops = decode(bytes);
  const f = firstReal(ops);
  if (f < 0) return bytes;
  const o = ops[f];
  const pre = bytes.slice(0, o.at);
  const to = o.kind === 'rmove' ? { x: pen.x + o.dx, y: pen.y + o.dy } : pen;
  const dx = wrapDelta(to.x - p.x, 256), dy = wrapDelta(to.y - p.y, 176);
  const mv = dx || dy ? enc.rmove(dx, dy) : [];
  return o.kind === 'rmove' ? [...pre, ...mv, ...bytes.slice(o.at + o.len)] : [...pre, ...mv, ...bytes.slice(o.at)];
}

// Dentro de un subdibujo todo va en relativo a la pluma: un "ir a" pasa a
// mover relativo, y un punto suelto a un mover y una línea de un punto
function relative(bytes, p, e) {
  const ops = decode(bytes);
  const f = firstReal(ops);
  if (f < 0) return bytes;
  const o = ops[f];
  const pre = bytes.slice(0, o.at), post = bytes.slice(o.at + o.len);
  if (o.kind === 'move') {
    const dx = o.x - p.x, dy = o.y - p.y;
    return [...pre, ...(dx || dy ? enc.rmove(dx, dy) : []), ...post];
  }
  if (o.kind === 'plot') {
    const sx = o.x > 0 ? -1 : 1;                          // se llega desde el punto de al lado
    return [...pre, ...enc.rmove(o.x + sx - p.x, o.y - p.y), ...enc.line(-sx, 0, o.mode), ...post];
  }
  if (e.needsPen && (p.x !== e.pen0.x || p.y !== e.pen0.y)) return [...pre, ...enc.rmove(e.pen0.x - p.x, e.pen0.y - p.y), ...bytes.slice(o.at)];
  return bytes;
}

const entriesOf = (A) => A.pieces.map((pc) => ({ bytes: pc.bytes.slice(), pen0: { ...pc.pen0 }, col0: { ...pc.col0 }, needsPen: pc.needsPen, kind: pc.kind }));
// Los cambios de color sueltos del final se quedan al final: si quedaran
// delante de otra pieza se juntarían con ella y le cambiarían los colores
const pinTail = (list) => [...list.filter((e) => e.kind !== 'colour'), ...list.filter((e) => e.kind === 'colour')];

// --------------------------------------------------------------- transformar una pieza
// Vuelve a escribir las órdenes de una pieza cambiando lo que diga fn(op)
function mapOps(bytes, fn) {
  const out = [];
  for (const o of decode(bytes)) out.push(...encode(fn({ ...o }) || o));
  return out;
}
export function encode(o) {
  switch (o.kind) {
    case 'plot': return enc.plot(o.x, o.y, o.mode);
    case 'move': return enc.move(o.x, o.y);
    case 'line': return enc.line(o.dx, o.dy, o.mode);
    case 'rmove': return enc.rmove(o.dx, o.dy);
    case 'fill': return enc.fill(o.dx, o.dy);
    case 'shade': return enc.shade(o.dx, o.dy, o.ch, o.inverse);
    case 'block': return enc.block(o.h, o.w, o.col, o.row);
    case 'gosub': return enc.gosub(o.n, o.scale, o.mirror);
    case 'text': return enc.text(o.ch, o.col, o.row, o.mode);
    default: return enc[o.kind](o.v);                     // colores
  }
}
const clampX = (x) => Math.max(0, Math.min(255, x));
const clampY = (y) => Math.max(0, Math.min(175, y));

// Mueve una pieza (dx, dy en coordenadas de DAAD, y hacia arriba)
function shiftEntry(e, dx, dy) {
  const cdx = Math.round(dx / 8), cdy = Math.round(-dy / 8);
  let done = false;
  e.bytes = mapOps(e.bytes, (o) => {
    if (done || isColour(o)) return o;
    done = true;
    if (o.kind === 'plot' || o.kind === 'move') { o.x = clampX(o.x + dx); o.y = clampY(o.y + dy); }
    else if (o.kind === 'block' || o.kind === 'text') { o.col = Math.max(0, Math.min(31, o.col + cdx)); o.row = Math.max(0, Math.min(23, o.row + cdy)); }
    return o;
  });
  e.pen0 = { x: e.pen0.x + dx, y: e.pen0.y + dy };
}

// Cuánto se puede mover sin salirse de la pantalla (dx, dy en DAAD)
export function clampDelta(A, sel, dx, dy) {
  const b = boxOf(A, sel.filter((k) => A.pieces[k].movable));
  if (!b) return { dx, dy };
  // en pantalla: x igual, y al revés
  dx = Math.max(-b.x0, Math.min(W - 1 - b.x1, dx));
  dy = Math.max(-(H - 1 - b.y1), Math.min(b.y0, dy));
  return { dx, dy };
}

// --------------------------------------------------------------- operaciones
// Todas devuelven { bytes, sel } con las piezas seleccionadas después

export function translate(A, sel, dx, dy, ctx) {
  ({ dx, dy } = clampDelta(A, sel, dx, dy));
  const es = entriesOf(A);
  for (const k of sel) if (A.pieces[k].movable) shiftEntry(es[k], dx, dy);
  return { bytes: rebuild(es, ctx), sel: [...sel] };
}

export function remove(A, sel, ctx) {
  const drop = new Set(sel);
  return { bytes: rebuild(entriesOf(A).filter((_, k) => !drop.has(k)), ctx), sel: [] };
}

// where: 'front' (encima de todo), 'back' (debajo de todo), 'up', 'down' (un paso)
export function reorder(A, sel, where, ctx) {
  const es = entriesOf(A).map((e, k) => ({ e, k }));
  const s = new Set(sel);
  let order;
  if (where === 'front') order = [...es.filter((x) => !s.has(x.k)), ...es.filter((x) => s.has(x.k))];
  else if (where === 'back') order = [...es.filter((x) => s.has(x.k)), ...es.filter((x) => !s.has(x.k))];
  else {
    order = es.slice();
    const idx = order.map((x, i) => (s.has(x.k) ? i : -1)).filter((i) => i >= 0);
    if (where === 'up') for (let j = idx.length - 1; j >= 0; j--) {
      const i = idx[j];
      if (i + 1 < order.length && !s.has(order[i + 1].k)) [order[i], order[i + 1]] = [order[i + 1], order[i]];
    } else for (const i of idx) if (i > 0 && !s.has(order[i - 1].k)) [order[i], order[i - 1]] = [order[i - 1], order[i]];
  }
  const out = pinTail(order.map((x) => x.e));
  const picked = new Set(order.filter((x) => s.has(x.k)).map((x) => x.e));
  return { bytes: rebuild(out, ctx), sel: out.map((e, i) => (picked.has(e) ? i : -1)).filter((i) => i >= 0) };
}

// Lo copiado: las piezas con su pluma y sus colores de partida
export function copy(A, sel) {
  const ks = [...sel].sort((a, b) => a - b);
  return { entries: ks.map((k) => entriesOf(A)[k]), box: boxOf(A, ks) };
}

// Pega encima de todo, desplazado (dx, dy en DAAD)
export function paste(A, clip, dx, dy, ctx) {
  const es = entriesOf(A);
  const add = clone(clip.entries);
  if (clip.box) {                                           // que no se salga de la pantalla
    dx = Math.max(-clip.box.x0, Math.min(W - 1 - clip.box.x1, dx));
    dy = Math.max(-(H - 1 - clip.box.y1), Math.min(clip.box.y0, dy));
  }
  for (const e of add) shiftEntry(e, dx, dy);
  const out = pinTail([...es, ...add]);
  return { bytes: rebuild(out, ctx), sel: add.map((e) => out.indexOf(e)) };
}

// Que la selección quede dentro de la pantalla después de voltear o girar
function fitInside(bytes, sel, ctx) {
  const A = analyze(bytes, ctx);
  const b = boxOf(A, sel);
  if (!b) return bytes;
  const dx = b.x0 < 0 ? -b.x0 : b.x1 > W - 1 ? W - 1 - b.x1 : 0;
  const dy = b.y0 < 0 ? b.y0 : b.y1 > H - 1 ? b.y1 - (H - 1) : 0;
  return dx || dy ? translate(A, sel, dx, dy, ctx).bytes : bytes;
}

// axis: 'h' (izquierda-derecha) o 'v' (arriba-abajo), alrededor de la caja de la selección
export function flip(A, sel, axis, ctx) {
  const b = boxOf(A, sel);
  if (!b) return { bytes: rebuild(entriesOf(A), ctx), sel };
  const es = entriesOf(A);
  // la caja en DAAD (y hacia arriba)
  const X = b.x0 + b.x1, Y = (H - 1 - b.y1) + (H - 1 - b.y0);
  for (const k of sel) {
    const e = es[k];
    let first = true;
    e.bytes = mapOps(e.bytes, (o) => {
      if (isColour(o)) return o;
      const isFirst = first; first = false;
      if ('dx' in o) { if (axis === 'h') o.dx = -o.dx; else o.dy = -o.dy; }
      if (o.kind === 'gosub') o.mirror ^= axis === 'h' ? 1 : 2;
      if (isFirst && (o.kind === 'plot' || o.kind === 'move')) { if (axis === 'h') o.x = clampX(X - o.x); else o.y = clampY(Y - o.y); }
      if (isFirst && (o.kind === 'block' || o.kind === 'text')) {
        const w = o.kind === 'block' ? o.w : 0, h = o.kind === 'block' ? o.h : 0;
        if (axis === 'h') o.col = Math.max(0, Math.min(31, Math.round((b.x0 + b.x1 - (o.col * 8 + (w + 1) * 8 - 1)) / 8)));
        else o.row = Math.max(0, Math.min(23, Math.round((b.y0 + b.y1 - (o.row * 8 + (h + 1) * 8 - 1)) / 8)));
      }
      return o;
    });
    if (axis === 'h') e.pen0.x = X - e.pen0.x; else e.pen0.y = Y - e.pen0.y;
  }
  return { bytes: fitInside(rebuild(es, ctx), sel, ctx), sel: [...sel] };
}

// Gira 90 grados a la derecha (como se ve en pantalla) alrededor del centro
// de la selección. Los bloques, las letras y los subdibujos no se pueden girar.
export function rotate(A, sel, ctx) {
  if (sel.some((k) => A.pieces[k].kinds.some((x) => x === 'block' || x === 'text' || x === 'gosub'))) return { error: 'rotate' };
  const b = boxOf(A, sel);
  if (!b) return { bytes: rebuild(entriesOf(A), ctx), sel };
  const cx = (b.x0 + b.x1) >> 1, cy = ((H - 1 - b.y1) + (H - 1 - b.y0)) >> 1;
  // en DAAD (y hacia arriba), a la derecha: (x, y) -> (y, -x)
  const rp = (x, y) => ({ x: cx + (y - cy), y: cy - (x - cx) });
  const es = entriesOf(A);
  for (const k of sel) {
    const e = es[k];
    let first = true;
    e.bytes = mapOps(e.bytes, (o) => {
      if (isColour(o)) return o;
      const isFirst = first; first = false;
      if ('dx' in o) [o.dx, o.dy] = [o.dy, -o.dx];
      if (isFirst && (o.kind === 'plot' || o.kind === 'move')) { const q = rp(o.x, o.y); o.x = clampX(q.x); o.y = clampY(q.y); }
      return o;
    });
    e.pen0 = rp(e.pen0.x, e.pen0.y);
  }
  return { bytes: fitInside(rebuild(es, ctx), sel, ctx), sel: [...sel] };
}

// Pasa la selección a un subdibujo nuevo (número n) y deja en su sitio un GOSUB.
// El subdibujo va en relativo a la pluma, así se puede mover, voltear y escalar.
// Devuelve { bytes (este dibujo), sub (el nuevo), sel, warn }
export function toSub(A, sel, n, ctx) {
  const ks = [...sel].sort((a, b) => a - b);
  if (!ks.length) return { error: 'empty' };
  const es = entriesOf(A);
  const first = A.pieces[ks[0]];
  const f0 = decode(first.bytes).find((o) => !isColour(o));
  const pen = f0 && (f0.kind === 'plot' || f0.kind === 'move') ? { x: f0.x, y: f0.y } : { ...first.pen0 };
  const group = ks.map((k) => es[k]);
  const sub = rebuild(group, ctx, { start: { pen, col: first.col0 } });
  const warn = ks.some((k) => A.pieces[k].kinds.some((x) => x === 'block' || x === 'text'));
  const lib = (ctx.lib || []).slice();
  lib[n] = { data: sub };
  const call = { bytes: enc.gosub(n), pen0: pen, col0: { ...first.col0 }, needsPen: true };
  const s = new Set(ks);
  const out = [];
  es.forEach((e, k) => { if (k === ks[0]) out.push(call); else if (!s.has(k)) out.push(e); });
  return { bytes: rebuild(out, { ...ctx, lib }), sub, sel: [out.indexOf(call)], warn };
}

export { opLen };

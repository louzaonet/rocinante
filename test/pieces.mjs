// Piezas de los dibujos vectoriales: rehacer sin tocar nada deja los mismos
// bytes, y mover, borrar, reordenar, pegar, voltear, girar o pasar a
// subdibujo no cambia nada de lo que no está seleccionado.
import { readFileSync } from 'node:fs';
import { enc, paint } from '../src/gfx/vector.js';
import * as P from '../src/gfx/pieces.js';
import { defaultCharset } from '../src/spectrum/zxexport.js';
import { numberPictures } from '../src/project/compile.js';

let bad = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) bad++; };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const charset = defaultCharset();
const W = 256, H = 176;
const rowAddr = (y) => ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);

// Pantalla del dibujo: los puntos (pantalla, y de arriba abajo) y los atributos
function render(lib, n, pic, bytes) {
  const l = lib.slice(); l[n] = { data: bytes };
  const { mem } = paint(l, n, { line: pic.line ?? 0, height: pic.height ?? 12, paper: pic.paper ?? 0, ink: pic.ink ?? 7 }, { charset });
  return mem;
}
const px = (mem, x, y) => (mem[rowAddr(y) + (x >> 3)] >> (7 - (x & 7))) & 1;
// Puntos que cambian entre dos pantallas, fuera de las zonas dadas
function diffOutside(a, b, boxes) {
  let n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (boxes.some((q) => q && x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1)) continue;
    if (px(a, x, y) !== px(b, x, y)) n++;
  }
  return n;
}
const pixels = (mem) => { let n = 0; for (let i = 0; i < 6144; i++) for (let b = mem[i]; b; b >>= 1) n += b & 1; return n; };

// ---------------------------------------------------------------- sintético
{
  const lib = [];
  const pic = { paper: 7, ink: 0 };
  const ctx = { lib, charset, pic };
  const sq = (x, y, s) => [...enc.move(x, y), ...enc.line(s, 0), ...enc.line(0, s), ...enc.line(-s, 0), ...enc.line(0, -s)];
  const d = [
    ...enc.ink(2), ...sq(20, 20, 30), ...enc.fill(5, 5),
    ...enc.ink(4), ...sq(100, 100, 20),
    ...enc.rmove(40, 0), ...enc.line(10, 10),                // pieza que depende de la pluma
    ...enc.block(1, 2, 25, 2),
    ...enc.plot(200, 30), ...enc.line(30, 0),
    7,
  ];
  const A = P.analyze(d, ctx);
  check('sintético: 5 piezas', A.pieces.length === 5, A.pieces.map((p) => p.kind).join());
  check('sintético: rehacer = igual', same(P.rebuild(A.pieces.map((p) => ({ ...p })), ctx), d));
  const k = P.hit(A, 20 + 15, 175 - 20);                     // borde de abajo del primer cuadrado
  check('sintético: tocar el cuadrado', k === 0, k);
  check('sintético: rectángulo', JSON.stringify(P.inRect(A, 90, 50, 155, 80)) === '[1,2]', JSON.stringify(P.inRect(A, 90, 50, 155, 80)));

  // mover el segundo cuadrado: la pieza 2 (relativa) no se mueve con él
  const before = render(lib, 1, pic, d);
  const T = P.translate(A, [1], 10, -10, ctx);
  const after = render(lib, 1, pic, T.bytes);
  const A2 = P.analyze(T.bytes, ctx);
  check('mover: el resto igual', diffOutside(before, after, [A.pieces[1].box, A2.pieces[1].box]) === 0);
  check('mover: la caja se mueve', A2.pieces[1].box.x0 === A.pieces[1].box.x0 + 10 && A2.pieces[1].box.y0 === A.pieces[1].box.y0 + 10, JSON.stringify([A.pieces[1].box, A2.pieces[1].box]));
  check('mover: la pieza relativa sigue en su sitio', JSON.stringify(A2.pieces[2].box) === JSON.stringify(A.pieces[2].box));
  check('mover: mismos puntos', pixels(after) === pixels(before));

  // borrar
  const R = P.remove(A, [1], ctx);
  const Ar = P.analyze(R.bytes, ctx);
  check('borrar: una pieza menos', Ar.pieces.length === 4);
  check('borrar: el resto igual', diffOutside(before, render(lib, 1, pic, R.bytes), [A.pieces[1].box]) === 0);
  check('borrar: la relativa sigue en su sitio', JSON.stringify(Ar.pieces[1].box) === JSON.stringify(A.pieces[2].box));

  // reordenar: mismos puntos (no se tocan entre sí) y los colores se mantienen
  for (const w of ['front', 'back', 'up', 'down']) {
    const O = P.reorder(A, [0], w, ctx);
    const m = render(lib, 1, pic, O.bytes);
    check(`orden ${w}: misma pantalla`, same(m, before));
  }

  // pegar desplazado
  const clip = P.copy(A, [0]);
  const V = P.paste(A, clip, 100, 0, ctx);
  const Av = P.analyze(V.bytes, ctx);
  check('pegar: una pieza más', Av.pieces.length === 6 && V.sel[0] === 5);
  const b0 = A.pieces[0].box, b5 = Av.pieces[5].box;
  check('pegar: desplazada', b5.x0 === b0.x0 + 100 && b5.y0 === b0.y0, JSON.stringify([b0, b5]));
  const mv = render(lib, 1, pic, V.bytes);
  check('pegar: el original igual', diffOutside(before, mv, [b5]) === 0);
  // la copia lleva la tinta 2 aunque detrás hubiera otra
  const attr = (mem, x, y) => mem[6144 + (y >> 3) * 32 + (x >> 3)];
  check('pegar: con su color', (attr(mv, b5.x0 + 1, b5.y1) & 7) === 2, attr(mv, b5.x0 + 1, b5.y1));

  // voltear dos veces = como estaba
  const F1 = P.flip(A, [1, 2], 'h', ctx);
  const F2 = P.flip(P.analyze(F1.bytes, ctx), [1, 2], 'h', ctx);
  check('voltear ↔ dos veces: misma pantalla', same(render(lib, 1, pic, F2.bytes), before));
  const G1 = P.flip(A, [0], 'v', ctx);
  const G2 = P.flip(P.analyze(G1.bytes, ctx), [0], 'v', ctx);
  check('voltear ↕ dos veces: misma pantalla', same(render(lib, 1, pic, G2.bytes), before));

  // girar cuatro veces = como estaba (un cuadrado gira sin perder puntos)
  let Rb = d;
  for (let i = 0; i < 4; i++) Rb = P.rotate(P.analyze(Rb, ctx), [1], ctx).bytes;
  check('girar 4 veces: misma pantalla', same(render(lib, 1, pic, Rb), before));
  check('girar un bloque: no', P.rotate(A, [3], ctx).error === 'rotate');

  // subdibujo: misma pantalla y el GOSUB en su sitio
  const S = P.toSub(A, [0, 1], 50, ctx);
  const lib2 = lib.slice(); lib2[50] = { data: S.sub };
  check('subdibujo: misma pantalla', same(render(lib2, 1, pic, S.bytes), before));
  check('subdibujo: sin aviso', !S.warn);
  // y moverlo después mueve los dos cuadrados
  const ctx2 = { ...ctx, lib: lib2 };
  const As = P.analyze(S.bytes, ctx2);
  const Ts = P.translate(As, S.sel, 20, 0, ctx2);
  const As2 = P.analyze(Ts.bytes, ctx2);
  check('subdibujo: se mueve', As2.pieces[S.sel[0]].box.x0 === As.pieces[S.sel[0]].box.x0 + 20);
  const Sw = P.toSub(A, [3], 51, ctx);
  check('subdibujo con bloque: aviso', Sw.warn);
}

// ---------------------------------------------------------------- dibujos de verdad
{
  const p = JSON.parse(readFileSync(new URL('./vec/piezas.json', import.meta.url)));
  const { slots, picNum } = numberPictures(p);
  const lib = slots.map((s) => (s && s.drawstring ? { data: s.drawstring } : undefined));
  let n = 0, okRe = 0, okMove = 0, okDel = 0, okSub = 0, okPaste = 0, okOrder = 0, tried = 0;
  const fails = [];
  for (const pic of p.pictures) {
    const d = pic.drawstring;
    if (!d || d.length < 3) continue;
    const num = picNum.get(pic.id);
    const ctx = { lib, charset, pic };
    const A = P.analyze(d, ctx);
    n++;
    const re = P.rebuild(A.pieces.map((x) => ({ ...x })), ctx);
    if (same(re, d.slice(0, re.length - 1).concat(7)) || same(re, d)) okRe++; else fails.push(`rehacer ${pic.id}`);
    const before = render(lib, num, pic, d);
    // cada pieza con caja: moverla o borrarla no cambia nada fuera de su caja,
    // salvo lo que pinten los rellenos (dependen de los bordes de las demás)
    const fillMask = (B) => {
      const m = new Uint8Array(W * H);
      B.pieces.forEach((x, k) => { if (x.kinds.some((q) => q === 'fill' || q === 'shade')) for (let i = 0; i < W * H; i++) if (B.owner[i] === k) m[i] = 1; });
      return m;
    };
    const m0 = fillMask(A);
    const changed = (a, b, boxes, m1) => {
      let n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (boxes.some((q) => q && x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1)) continue;
        if (m0[y * W + x] || m1[y * W + x]) continue;
        if (px(a, x, y) !== px(b, x, y)) n++;
      }
      return n;
    };
    const cand = A.pieces.map((x, k) => k).filter((k) => A.pieces[k].box && A.pieces[k].movable).filter((k, i, a) => i % Math.ceil(a.length / 12) === 0);
    for (const k of cand) {
      tried++;
      // pegar una copia y borrarla deja el dibujo como estaba; reordenar no cambia cuántas piezas hay
      const V = P.paste(A, P.copy(A, [k]), 8, -8, ctx);
      const Av = P.analyze(V.bytes, ctx);
      if (Av.pieces.length === A.pieces.length + 1 && same(P.remove(Av, V.sel, ctx).bytes, re)) okPaste++; else fails.push(`pegar ${pic.id}#${k}`);
      for (const w of ['front', 'back', 'up', 'down']) {
        const O = P.reorder(A, [k], w, ctx);
        if (P.analyze(O.bytes, ctx).pieces.length !== A.pieces.length) { fails.push(`orden ${w} ${pic.id}#${k}`); okOrder--; }
      }
      okOrder++;
      const T = P.translate(A, [k], 3, 2, ctx);
      const A2 = P.analyze(T.bytes, ctx);
      if (changed(before, render(lib, num, pic, T.bytes), [A.pieces[k].box, A2.pieces[k]?.box], fillMask(A2)) === 0) okMove++; else fails.push(`mover ${pic.id}#${k}`);
      const R = P.remove(A, [k], ctx);
      if (changed(before, render(lib, num, pic, R.bytes), [A.pieces[k].box], fillMask(P.analyze(R.bytes, ctx))) === 0) okDel++; else fails.push(`borrar ${pic.id}#${k}`);
    }
    // todo el dibujo a subdibujo: misma pantalla
    const all = A.pieces.map((_, k) => k);
    const S = P.toSub(A, all, 255, ctx);
    if (!S.error) {
      const l2 = lib.slice(); l2[255] = { data: S.sub };
      if (same(render(l2, num, pic, S.bytes), before)) okSub++; else fails.push(`subdibujo ${pic.id}`);
    }
  }
  check(`reales: rehacer = igual (${okRe}/${n})`, okRe === n, fails.filter((f) => f.startsWith('rehacer')).join(' '));
  check(`reales: mover (${okMove}/${tried})`, okMove === tried, fails.filter((f) => f.startsWith('mover')).join(' '));
  check(`reales: borrar (${okDel}/${tried})`, okDel === tried, fails.filter((f) => f.startsWith('borrar')).join(' '));
  check(`reales: pegar y borrar (${okPaste}/${tried})`, okPaste === tried, fails.filter((f) => f.startsWith('pegar')).join(' '));
  check(`reales: reordenar (${okOrder}/${tried})`, okOrder === tried, fails.filter((f) => f.startsWith('orden')).slice(0, 8).join(' '));
  check(`reales: todo a subdibujo (${okSub}/${n})`, okSub === n, fails.filter((f) => f.startsWith('subdibujo')).join(' '));
}
process.exit(bad ? 1 : 0);

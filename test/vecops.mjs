// Órdenes de los dibujos vectoriales: lo que escribe el editor se lee igual,
// la pluma acaba donde debe y se detecta lo que se sale de la pantalla.
import { enc, decode, describe, penAt, offScreen, paint } from '../src/gfx/vector.js';
import { defaultCharset } from '../src/spectrum/zxexport.js';

let bad = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'ok  ' : 'FAIL', name, ok ? '' : extra); if (!ok) bad++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const cases = [
  [enc.plot(10, 20, 2), { kind: 'plot', x: 10, y: 20, mode: 2 }],
  [enc.move(255, 175), { kind: 'move', x: 255, y: 175 }],
  [enc.line(-7, 15), { kind: 'line', dx: -7, dy: 15, mode: 0 }],
  [enc.line(200, -16, 1), { kind: 'line', dx: 200, dy: -16, mode: 1 }],
  [enc.rmove(-30, -2), { kind: 'rmove', dx: -30, dy: -2 }],
  [enc.fill(3, -4), { kind: 'fill', dx: 3, dy: -4 }],
  [enc.shade(-1, 2, 170, true), { kind: 'shade', dx: -1, dy: 2, ch: 170, inverse: true }],
  [enc.block(1, 3, 26, 8), { kind: 'block', h: 1, w: 3, col: 26, row: 8 }],
  [enc.gosub(30, 4, 1), { kind: 'gosub', n: 30, scale: 4, mirror: 1 }],
  [enc.text(65, 31, 23, 1), { kind: 'text', ch: 65, col: 31, row: 23, mode: 1 }],
  [enc.paper(8), { kind: 'paper', v: 8 }], [enc.bright(1), { kind: 'bright', v: 1 }],
  [enc.ink(5), { kind: 'ink', v: 5 }], [enc.flash(0), { kind: 'flash', v: 0 }],
];
for (const [bytes, want] of cases) {
  const [o] = decode([...bytes, 7]);
  const got = Object.fromEntries(Object.keys(want).map((k) => [k, o[k]]));
  check(`${describe(o)} (${bytes.length} bytes)`, same(got, want) && o.len === bytes.length, JSON.stringify(got));
}
check('línea corta en 2 bytes', enc.line(15, -15).length === 2 && enc.line(16, 0).length === 3);

// un cuadrado relleno: la pluma vuelve al principio y el interior queda pintado
const sq = [...enc.move(100, 100), ...enc.line(20, 0), ...enc.line(0, 20), ...enc.line(-20, 0), ...enc.line(0, -20), ...enc.fill(5, 5), 7];
const lib = []; lib[3] = { data: sq };
const cs = defaultCharset();
check('pluma tras el cuadrado', same(penAt(lib, 3, sq.length - 1, cs), { x: 100, y: 100 }));
check('pluma a medias', same(penAt(lib, 3, decode(sq)[2].at, cs), { x: 120, y: 100 }));
const { mem } = paint(lib, 3, { line: 0, height: 24, paper: 0, ink: 7 }, { charset: cs });
let on = 0;
for (let i = 0; i < 6144; i++) for (let b = mem[i]; b; b >>= 1) on += b & 1;
check('cuadrado relleno: 21x21 puntos', on === 21 * 21, on);
check('dentro de la pantalla', offScreen(lib, 3, cs) === null);

// se sale: una línea que pasa del borde de arriba, y lo mismo dentro de un GOSUB
lib[4] = { data: [...enc.move(10, 170), ...enc.line(5, 0), ...enc.line(0, 10), ...enc.line(5, 0), 7] };
check('se sale: la orden 3', offScreen(lib, 4, cs)?.at === decode(lib[4].data)[2].at);
lib[5] = { data: [...enc.line(0, 30), 7] };
lib[6] = { data: [...enc.move(50, 100), ...enc.gosub(5), ...enc.move(50, 160), ...enc.gosub(5), 7] };
const g = offScreen(lib, 6, cs);
check('se sale dentro de un GOSUB', g && g.at === decode(lib[6].data)[3].at && g.path.length === 2, JSON.stringify(g));
process.exit(bad ? 1 : 0);

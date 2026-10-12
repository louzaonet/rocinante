// Lectura de cintas (.tap y .tzx) para importar: cada bloque de código va a
// su dirección y, en 128K, al banco que pagina el programa BASIC antes de
// cada LOAD ""CODE. También: las cintas que exporta Rocinante se leen igual
// en .tap que en .tzx.
import fs from 'fs';
import { readTape, tapeBlocks } from '../src/spectrum/tapread.js';
import { tapToTzx, tapBlocks } from '../src/spectrum/zxtap.js';

let bad = 0;
const check = (name, ok) => { console.log(ok ? 'ok  ' : 'FAIL', name); if (!ok) bad++; };
const blk = (flag, data) => { const o = [flag, ...data]; let x = 0; for (const b of o) x ^= b; return [...o, x]; };
const hdr = (type, len, p1) => blk(0, [type, ...Array(10).fill(32), len & 255, len >> 8, p1 & 255, p1 >> 8, 0, 0x80]);
const num = (n) => [...String(n)].map((c) => c.charCodeAt(0)).concat([0x0e, 0, 0, n & 255, n >> 8, 0]);
const val = (n) => [0xb0, 0x22, ...[...String(n)].map((c) => c.charCodeAt(0)), 0x22];
const LOAD = [0xef, 0x22, 0x22, 0xaf];
const fill = (n, v) => new Array(n).fill(v);

// Programa: OUT 32765,17 (VAL) / LOAD ""CODE / OUT 32765,22 (número) / LOAD ""CODE
//           / POKE 23388,16 / LOAD ""CODE / LOAD ""CODE
const stmts = [[0xdf, ...val(32765), 0x2c, ...val(17)], LOAD, [0xdf, ...num(32765), 0x2c, ...num(22)], LOAD,
  [0xf4, ...num(23388), 0x2c, ...num(16)], LOAD, LOAD];
const body = stmts.flatMap((s, i) => (i ? [0x3a, ...s] : s)).concat(0x0d);
const prog = [0, 10, body.length & 255, body.length >> 8, ...body];
const blocks = [
  hdr(0, prog.length, 10), blk(0xff, prog),
  hdr(3, 16, 0xc000), blk(0xff, fill(16, 0x11)),          // banco 1
  hdr(3, 16, 0xc000), blk(0xff, fill(16, 0x66)),          // banco 6
  hdr(3, 16, 0xc000), blk(0xff, fill(16, 0x00 + 0x77)),   // banco 0
  hdr(3, 8, 0x8000), blk(0xff, fill(8, 0x55)),            // memoria normal
  blk(0xff, fill(10, 0x99)),                              // sin cabecera
];
const tap = Uint8Array.from(blocks.flatMap((b) => [b.length & 255, b.length >> 8, ...b]));
const r = readTape(tap, 'x.tap');
check('128K: el banco 1', r.machine === '128' && r.banks[1][0] === 0x11 && r.banks[1][15] === 0x11 && r.banks[1][16] === 0);
check('128K: el banco 6', r.banks[6][0] === 0x66);
check('128K: el banco 0 y C000h', r.banks[0][0] === 0x77 && r.ram[0xc000] === 0x77);
check('memoria normal en 8000h', r.ram[0x8000] === 0x55 && r.banks[2][0] === 0x55);
check('un bloque sin cabecera', r.unplaced === 1);

// El mismo contenido en .tzx, con bloques de todo tipo por medio
const tz = [...'ZXTape!'].map((c) => c.charCodeAt(0)).concat([0x1a, 1, 20]);
tz.push(0x30, 3, 65, 66, 67);                             // texto
tz.push(0x32, 4, 0, 1, 0, 1, 65);                          // información
tz.push(0x21, 2, 65, 66);                                  // inicio de grupo
blocks.forEach((b, i) => {
  if (i % 3 === 1) tz.push(0x11, ...fill(15, 1), b.length & 255, (b.length >> 8) & 255, 0, ...b);   // turbo
  else if (i % 3 === 2) tz.push(0x14, ...fill(7, 1), b.length & 255, (b.length >> 8) & 255, 0, ...b); // datos puros
  else tz.push(0x10, 0xe8, 3, b.length & 255, b.length >> 8, ...b);
  tz.push(0x20, 0xe8, 3);                                  // pausa
});
tz.push(0x22);                                             // fin de grupo
const t2 = readTape(Uint8Array.from(tz), 'x.tzx');
check('.tzx igual que .tap', JSON.stringify([...t2.ram]) === JSON.stringify([...r.ram]) && t2.banks.every((b, k) => b.every((v, i) => v === r.banks[k][i])) && t2.unplaced === 1);

// 48K: un solo bloque, sin paginación
const tap48 = Uint8Array.from([hdr(3, 4, 0x6000), blk(0xff, [1, 2, 3, 4])].flatMap((b) => [b.length & 255, b.length >> 8, ...b]));
const r48 = readTape(tap48, 'y.tap');
check('48K', r48.machine === '48' && r48.ram[0x6003] === 4 && r48.banks === null);

// Las cintas que exporta Rocinante: los mismos bloques en .tap y en .tzx
for (const f of ['t48.tap', 'p128_en.tap']) {
  const t = new Uint8Array(fs.readFileSync(`test/tap/${f}`));
  const a = tapeBlocks(t), b = tapeBlocks(tapToTzx(t, { title: 'X' }));
  check(`${f} -> .tzx`, a.length === tapBlocks(t).length && JSON.stringify(a.map((x) => [x.flag, ...x.data])) === JSON.stringify(b.map((x) => [x.flag, ...x.data])));
}
process.exit(bad ? 1 : 0);

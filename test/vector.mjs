// Dibujos vectoriales (cadenas de DAAD en el SDG) junto a un mapa de bits:
// pinta con el motor JS y exporta a 48K y 128K; test/vector.py compara las
// pantallas con las de los intérpretes reales.
import fs from 'fs';
import { newProject } from '../src/project/template.js';
import { compileProject } from '../src/project/compile.js';
import { export128, export48 } from '../src/daad/export128.js';
import { snapshot128, snapshot48, defaultCharset } from '../src/spectrum/zxexport.js';
import { Engine } from '../src/daad/engine.js';
import { DaadScreen } from '../src/spectrum/daadscreen.js';
import { ScreenIO } from '../src/spectrum/screen-io.js';
import { convertToZX } from '../src/gfx/zxconvert.js';
import { enc } from '../src/gfx/vector.js';

class End extends Error {}
const b64 = (u) => Buffer.from(u).toString('base64');
// Cadena de DAAD: cada orden con su código (bits 0-2) y sus parámetros
const DRAW = [
  6 | (2 << 3),                    // INK 2
  0, 20, 160,                      // PLOT 20,160
  1, 100, 0, 1 | 0x80, 0, 60,      // LINE 100,0 ; LINE 0,-60
  1 | 0x40, 100, 0, 1, 0, 60,      // LINE -100,0 ; LINE 0,60
  2 | 0x80, 10, 10,                // FILL en (30,150): bit 7 = dy negativo
  0 | 0x18, 140, 160,              // mover a 140,160 sin pintar
  6 | (5 << 3), 5 | (1 << 3),      // INK 5, PAPER 1
  1 | 0x20, 0x9f,                  // LINE corta 9,15 (DAAD)
  1 | 0x20 | 0x80, 0x9f,           // LINE corta 9,-15
  1 | 0x40, 18, 0,                 // LINE -18,0
  2 | 0x20 | 0x80, 9, 5, 65,       // SHADE con la letra A como trama
  4, 66, 20, 2,                    // TEXT B en columna 20, fila 2
  0 | 0x18, 200, 120,              // mover a 200,120
  3 | (4 << 3), 30,                // GOSUB 30 a escala 4/8
  5 | 0x80 | (1 << 3),             // BRIGHT 1
  0x12, 1, 3, 26, 8,               // BLOCK: 2 filas x 4 columnas desde (26,8)
  7,                               // END
];
const SUB = [1, 40, 0, 1 | 0x40, 20, 40, 1 | 0x40 | 0x80, 20, 40, 7];  // triángulo desde el punto actual
// Rellenos que tocan el borde de arriba y la izquierda, GOSUB con espejo,
// líneas con OVER e INVERSE, tinta y papel transparentes (8), texto inverso
const DRAW_B = [
  0, 0, 175, 1, 120, 0, 1 | 0x80, 0, 80, 1 | 0x40, 120, 0,          // borde superior y caja abierta a la izquierda
  2 | 0x80, 10, 20,                                                 // FILL que llega al borde
  0 | 0x18, 160, 110, 3 | (0 << 3) | 0x40, 30, 3 | (6 << 3) | 0x80, 30, // GOSUB con espejo en x y en y
  6 | (8 << 3), 5 | (8 << 3),                                       // INK 8, PAPER 8
  0, 130, 100, 1 | 0x08, 100, 30, 1 | 0x10 | 0x40 | 0x80, 60, 20,          // LINE con OVER y con INVERSE
  4 | 0x10, 67, 25, 9,                                              // TEXT inverso
  2 | 0x20 | 0x10, 40, 0, 72,                                       // SHADE inverso con la H
  7,
];
// Un dibujo hecho con las órdenes que escribe el editor de Rocinante
const EDIT = [
  ...enc.move(30, 150), ...enc.line(80, 0), ...enc.line(0, -50), ...enc.line(-80, 0), ...enc.line(0, 50),
  ...enc.ink(2), ...enc.fill(10, -10),
  ...enc.rmove(100, 0), ...enc.line(12, -9), ...enc.line(-12, -9, 1), ...enc.line(5, 5, 2),
  ...enc.rmove(3, -4), ...enc.line(2, 0), ...enc.plot(200, 160), ...enc.plot(201, 160, 1),
  ...enc.paper(3), ...enc.bright(1), ...enc.block(1, 2, 28, 1),
  ...enc.text(70, 24, 6, 2), ...enc.flash(0), ...enc.ink(8),
  ...enc.move(150, 120), ...enc.gosub(30, 5),
  ...enc.move(60, 60), ...enc.line(40, 20), ...enc.line(-40, 20), ...enc.line(0, -40),
  ...enc.shade(5, 10, 65, true),
  7,
];
// Pseudoaleatorio con semilla: polígonos dentro de pantalla y rellenos/tramas
function randomDrawing(seed) {
  let r = seed;
  const rnd = (n) => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r % n; };
  const out = [];
  let x = 20 + rnd(200), y = 100 + rnd(70);
  out.push(0, x, y);
  for (let k = 0; k < 14; k++) {
    if (rnd(5) === 0) out.push(6 | (rnd(8) << 3));
    const nx = 5 + rnd(245), ny = 90 + rnd(85);
    const dx = nx - x, dy = ny - y;
    out.push(1 | (dx < 0 ? 0x40 : 0) | (dy < 0 ? 0x80 : 0), Math.abs(dx), Math.abs(dy));
    x = nx; y = ny;
    if (rnd(3) === 0) {
      const fx = rnd(40), fy = rnd(30);
      if (y - fy >= 0 && x + fx <= 255) {
        if (rnd(2)) out.push(2 | 0x80, fx, fy); else out.push(2 | 0x20 | 0x80, fx, fy, 33 + rnd(90));
      }
    }
  }
  out.push(7);
  return out;
}
for (const lang of ['es', 'en']) {
  const p = newProject('Vector', lang);
  const synth = new Uint8ClampedArray(256 * 96 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7) & 255));
  const zx = convertToZX(synth, 32, 12);
  p.pictures = [
    { id: 'vec', drawstring: DRAW, line: 0, col: 0, height: 12, width: 42, paper: 0, ink: 7 },
    { id: 'bmp', zx: { cx: 0, cy: 0, cw: 32, ch: 12, pixels: b64(zx.pixels), attrs: b64(zx.attrs) } },
    { id: 'sub', drawstring: SUB, location: false, number: 30 },
    { id: 'vecb', drawstring: DRAW_B, line: 0, col: 0, height: 12, width: 42, paper: 1, ink: 6 },
    { id: 'edit', drawstring: EDIT, line: 0, col: 0, height: 12, width: 42, paper: 1, ink: 7 },
    ...[1, 2, 3, 4].map((k) => ({ id: 'rnd' + k, drawstring: randomDrawing(k * 7919), line: 0, col: 0, height: 12, width: 42, paper: k & 7, ink: 7 - (k & 7) })),
  ];
  p.locations[1].picture = 'vec';
  p.locations[2].picture = 'bmp';
  // más localidades hacia el este, cada una con su dibujo
  const extra = ['vecb', 'rnd1', 'rnd2', 'rnd3', 'rnd4', 'edit'];
  extra.forEach((pic, k) => p.locations.push({ id: 'sala' + k, text: 'Sala ' + k + '.', exits: [], picture: pic }));
  p.locations[1].exits.push({ word: 'E', to: 'sala0' });
  extra.forEach((_, k) => { if (k < extra.length - 1) p.locations[3 + k].exits.push({ word: 'E', to: 'sala' + (k + 1) }); });
  const { model, errors } = compileProject(p);
  if (errors.length) { console.log(errors); process.exit(1); }
  if (model.pictures[30]?.id !== 'sub') throw new Error('el subdibujo no es el 30');
  const n = lang === 'es' ? '' : '_en';
  fs.mkdirSync('test/vec', { recursive: true });
  const x = export128(model), y = export48(model);
  fs.writeFileSync(`test/vec/v128${n}.z80`, snapshot128(x.ddb, x.sdg, x.banks, model.language));
  fs.writeFileSync(`test/vec/v48${n}.z80`, snapshot48(y.ddb, y.sdg, model.language));
  const east = (n) => Array(n).fill('e');
  for (const [tag, cmds0] of [['a', ['n', 's']], ['b', ['n']], ['c', east(1)], ['d', east(2)], ['e', east(3)], ['f', east(4)], ['g', east(5)], ['h', east(6)]]) {
    if (process.env.ONLY && process.env.ONLY !== tag + n) continue;      // depuración
    const cmds = [...cmds0];
    fs.writeFileSync(`test/vec/cmds${tag}${n}.txt`, cmds.join('\n') + '\n');
    let cmd = null;
    const screen = new DaadScreen({
      charset: defaultCharset(), sysmsg: (k) => model.sysmsgs[k] ?? '',
      getKey: async (why) => {
        if (why !== 'input') return 32;
        if (cmd === null) { if (!cmds.length) throw new End(); cmd = [...cmds.shift()].map((c) => c.charCodeAt(0)).concat([13]); }
        const k = cmd.shift(); if (!cmd.length) cmd = null; return k;
      },
    });
    const sio = new ScreenIO(screen, model.pictures);
    // depuración: DUMP=etiqueta:n guarda la pantalla tras el n-ésimo DISPLAY
    const [dt, dn] = (process.env.DUMP || '').split(':');
    if (dt === tag + n) {
      let k = 0;
      const orig = sio.display.bind(sio);
      sio.display = async (v) => { if (k + 1 === +dn && process.env.DUMP_BEFORE) fs.writeFileSync('/tmp/js_disp.bin', screen.mem); const r = await orig(v); if (++k === +dn && !process.env.DUMP_BEFORE) fs.writeFileSync('/tmp/js_disp.bin', screen.mem); return r; };
    }
    try { await new Engine(model, sio).run(); } catch (e) { if (!(e instanceof End)) throw e; }
    fs.writeFileSync(`test/vec/js${tag}${n}.bin`, screen.mem);
  }
}
console.log('vectoriales listos');

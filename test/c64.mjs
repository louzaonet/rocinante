// Commodore 64: exporta la plantilla (con y sin dibujos) a test/c64/ y deja lo
// que test/c64.py necesita para compararla en VICE con el intérprete original:
// órdenes, transcripción del motor JS, juego de caracteres y, del dibujo de la
// primera localidad, el color del C64 que debería tener cada punto (el dibujo
// pintado como en el Spectrum, con sus colores pasados al C64).
import fs from 'fs';
import { newProject } from '../src/project/template.js';
import { compileProject } from '../src/project/compile.js';
import { exportC64, c64Charset } from '../src/c64/c64export.js';
import { readD64 } from '../src/c64/d64.js';
import { readDDB } from '../src/daad/ddb.js';
import { Engine } from '../src/daad/engine.js';
import { TextIO, EndOfScript } from '../src/daad/io-text.js';
import { Painter } from '../src/gfx/drawstring.js';
import { defaultCharset } from '../src/spectrum/zxexport.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FALLO ') + m); if (!c) fails++; };
const CMDS = {
  es: ['mirar', 'i', 'coger linterna', 'n', 'coger linterna', 'cogela', 'i', 'dejar todo', 'coger todo y s', 'ex linterna',
    'punto', 'turno', 'xyzzy', 'o', 'ponerse linterna', 'abrir puerta', 'n. s. n. s', 'fin', 'n'],
  en: ['look', 'i', 'get torch', 'n', 'get torch', 'get it', 'i', 'drop all', 'get all and s', 'x torch',
    'score', 'turns', 'xyzzy', 'w', 'wear torch', 'open door', 'n. s. n. s', 'put torch in torch', 'quit', 'n'],
};
const ZX2C64 = [[0, 6, 2, 4, 5, 3, 7, 1], [0, 14, 10, 4, 13, 3, 7, 1]];
const rowAddr = (y) => ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);
const piezas = JSON.parse(fs.readFileSync('test/vec/piezas.json'));
fs.mkdirSync('test/c64', { recursive: true });
fs.writeFileSync('test/c64/charset.bin', c64Charset());

for (const lang of ['es', 'en']) {
  const sfx = lang === 'es' ? '' : '_en';
  const p = newProject(lang === 'es' ? 'Prueba' : 'Test', lang);
  const r = compileProject(p);
  ok(!r.errors.length, `${lang}: plantilla sin errores`);
  const io = new TextIO(CMDS[lang]);
  try { await new Engine(r.model, io, { random: () => 0 }).run(); } catch (e) { if (!(e instanceof EndOfScript)) throw e; }
  fs.writeFileSync(`test/c64/js${sfx}.txt`, io.out);
  fs.writeFileSync(`test/c64/cmds${sfx}.txt`, CMDS[lang].join('\n') + '\n');
  const x = exportC64(r.model, { title: p.meta.title });
  fs.writeFileSync(`test/c64/plantilla${sfx}.d64`, x.d64);
  const files = readD64(x.d64);
  const names = files.map((f) => f.name).join(' ');
  ok(names === `${p.meta.title.toUpperCase()} APART1 ${lang === 'es' ? 'SDI64' : 'EDI64'} BPART1`, `${lang}: ficheros del disco (${names})`);
  const boot = files[0].data;
  ok(boot[0x15] === 0x31 && boot[0x17] === (lang === 'es' ? 0x53 : 0x45), `${lang}: el cargador pide el intérprete ${lang === 'es' ? 'S' : 'E'}`);
  const gfx = files[1].data;
  ok((gfx[0] | (gfx[1] << 8)) + gfx.length - 2 === 0xcc00, `${lang}: la base de gráficos acaba en CC00h`);
  const bp = files[3].data;
  ok(bp[0] === 0x80 && bp[1] === 0x38, `${lang}: BPART1 se carga en 3880h`);
  const back = readDDB(bp.subarray(2), 0x3880);
  ok(JSON.stringify(back.msgs) === JSON.stringify(r.model.msgs) && back.machine === 2, `${lang}: la base se lee igual (3880h, máquina 2)`);

  // con dibujos vectoriales en las primeras localidades
  const q = newProject(lang === 'es' ? 'Dibujos' : 'Pictures', lang);
  const ids = ['camino', 'bosque', 'noche', 'sierra', 'corral', 'molinos', 'castillo', 'playa'];
  q.pictures = piezas.pictures.filter((d) => ids.includes(d.id)).map((d) => ({ ...d }));
  q.pictures.find((d) => d.id === 'camino').number = 80;
  q.pictures.find((d) => d.id === 'bosque').number = 81;
  const locs = ['noche', 'sierra', 'corral', 'molinos', 'castillo', 'playa'];
  while (q.locations.length < locs.length + 1) q.locations.push({ ...q.locations[q.locations.length - 1], id: 'l' + q.locations.length });
  locs.forEach((id, i) => { q.locations[i + 1].picture = id; });
  const rq = compileProject(q);
  ok(!rq.errors.length, `${lang}: proyecto con dibujos sin errores`);
  const xq = exportC64(rq.model, { title: q.meta.title, zxCharset: defaultCharset() });
  ok(xq.converted >= locs.length, `${lang}: ${xq.converted} dibujos convertidos, ${xq.free} bytes libres`);
  fs.writeFileSync(`test/c64/dibujos${sfx}.d64`, xq.d64);
  // el dibujo de la localidad 1 pintado como en el Spectrum, en colores del C64
  const pic = rq.model.pictures[1];
  const mem = new Uint8Array(6912);
  const attr = (pic.paper << 3) | pic.ink;
  mem.fill(attr, 6144);
  const lib = rq.model.pictures.map((d) => (d && d.drawstring ? { data: d.drawstring } : null));
  const painter = new Painter(mem, lib, { kind: 'daad', charset: defaultCharset() });
  painter.setColours(attr);
  painter.run(1);
  const want = new Uint8Array(256 * 176);
  for (let y = 0; y < 176; y++) for (let xx = 0; xx < 256; xx++) {
    const sy = 175 - y, at = mem[6144 + (sy >> 3) * 32 + (xx >> 3)];
    const set = mem[rowAddr(sy) + (xx >> 3)] & (0x80 >> (xx & 7));
    want[xx | (y << 8)] = ZX2C64[at & 0x40 ? 1 : 0][set ? at & 7 : (at >> 3) & 7];
  }
  fs.writeFileSync(`test/c64/dibujo${sfx}.json`, JSON.stringify({ rows: pic.height, colours: Buffer.from(want).toString('base64') }));
}
if (fails) process.exit(1);

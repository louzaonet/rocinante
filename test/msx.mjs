// MSX: comprueba por estructura lo que se exporta (cartucho ASCII16, base de
// datos en 0100h, base de gráficos que acaba en B000h, órdenes de dibujo del
// MSX) y deja en test/msx/ lo que test/msx.py necesita para jugarlo en openMSX
// con C-BIOS y el intérprete original: cartuchos, órdenes, transcripción del
// motor JS y, del dibujo de la primera localidad, el color del Spectrum de
// cada punto (como lo pinta el Spectrum).
import fs from 'fs';
import { newProject } from '../src/project/template.js';
import { compileProject } from '../src/project/compile.js';
import { exportMSX } from '../src/msx/msxexport.js';
import { convertDrawstring, MSX_END } from '../src/msx/msxgfx.js';
import { MSX_CART } from '../src/msx/msxload-bin.js';
import { readDDB } from '../src/daad/ddb.js';
import { Engine } from '../src/daad/engine.js';
import { TextIO, EndOfScript } from '../src/daad/io-text.js';
import { Painter } from '../src/gfx/drawstring.js';
import { defaultCharset } from '../src/spectrum/zxexport.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FALLO ') + m); if (!c) fails++; };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const CMDS = {
  es: ['mirar', 'i', 'coger linterna', 'n', 'coger linterna', 'cogela', 'i', 'dejar todo', 'coger todo y s', 'ex linterna',
    'punto', 'turno', 'xyzzy', 'o', 'ponerse linterna', 'abrir puerta', 'n. s. n. s', 'fin', 'n'],
  en: ['look', 'i', 'get torch', 'n', 'get torch', 'get it', 'i', 'drop all', 'get all and s', 'x torch',
    'score', 'turns', 'xyzzy', 'w', 'wear torch', 'open door', 'n. s. n. s', 'put torch in torch', 'quit', 'n'],
};
const rowAddr = (y) => ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);

// --- órdenes de dibujo
ok(same(convertDrawstring([0x16, 0x2d, 0x8d, 0x3e, 0x05, 0x85, 0x0e, 0x46, 0x07]), [0x36, 0x3d, 0x7e, 0x05, 0x26, 0x86, 0x07]),
  'INK y PAPER a colores del MSX (con el brillo), BRIGHT fuera, transparente = 16');
ok(same(convertDrawstring([0x21, 0x35, 0x61, 0x24, 0x07]), [0x01, 3, 5, 0x41, 2, 4, 0x07]), 'la LINE corta pasa a la normal');
ok(same(convertDrawstring([0x00, 10, 20, 0x03, 80, 0x12, 1, 2, 3, 4, 0x22, 5, 6, 65, 0x04, 66, 1, 2]), [0x00, 10, 20, 0x03, 80, 0x12, 1, 2, 3, 4, 0x22, 5, 6, 65, 0x04, 66, 1, 2, 0x07]),
  'PLOT, GOSUB, BLOCK, SHADE y TEXT pasan tal cual (y se acaba con END)');

fs.mkdirSync('test/msx', { recursive: true });
fs.writeFileSync('test/msx/charset.bin', defaultCharset());
const piezas = JSON.parse(fs.readFileSync('test/vec/piezas.json'));

for (const lang of ['es', 'en']) {
  const sfx = lang === 'es' ? '' : '_en';
  const p = newProject(lang === 'es' ? 'Prueba' : 'Test', lang);
  const r = compileProject(p);
  ok(!r.errors.length, `${lang}: plantilla sin errores`);
  const io = new TextIO(CMDS[lang]);
  try { await new Engine(r.model, io, { random: () => 0 }).run(); } catch (e) { if (!(e instanceof EndOfScript)) throw e; }
  fs.writeFileSync(`test/msx/js${sfx}.txt`, io.out);
  fs.writeFileSync(`test/msx/cmds${sfx}.txt`, CMDS[lang].join('\n') + '\n');

  const x = exportMSX(r.model);
  fs.writeFileSync(`test/msx/plantilla${sfx}.rom`, x.rom);
  ok(x.rom.length === 0x20000 && x.rom[0] === 0x41 && x.rom[1] === 0x42 && same(x.rom.subarray(0, MSX_CART.length), MSX_CART), `${lang}: cartucho de 128 KB con la cabecera AB y el arranque`);
  // la tabla de trozos: arranque del intérprete y, por trozo, banco, origen,
  // destino y longitud; se recompone la memoria del MSX
  const w = (o) => x.rom[o] | (x.rom[o + 1] << 8);
  const mem = new Uint8Array(0x10000);
  let o = MSX_CART.length + 6;
  for (; w(o + 5); o += 7) {
    const src = x.rom[o] * 0x4000 + w(o + 1), dest = w(o + 3), len = w(o + 5);
    mem.set(x.rom.subarray(src, src + len), dest);
  }
  ok(w(MSX_CART.length) === (lang === 'es' ? 0xcff3 : 0xcf5e), `${lang}: arranca el intérprete por su entrada`);
  ok(same(mem.subarray(0x100, 0x100 + x.ddb.length), x.ddb), `${lang}: la base de datos va en 0100h`);
  const back = readDDB(x.ddb, 0x100);
  ok(back.machine === 4 && JSON.stringify(back.msgs) === JSON.stringify(r.model.msgs), `${lang}: la base se lee igual (MSX, 0100h)`);
  ok(same(mem.subarray(MSX_END - x.mdg.length, MSX_END), x.mdg), `${lang}: los gráficos acaban en B000h`);
  ok(mem[0xb001] === (lang === 'es' ? 0xcf : 0x3a), `${lang}: el intérprete de su idioma en B000h`);

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
  const xq = exportMSX(rq.model);
  ok(xq.converted >= locs.length, `${lang}: ${xq.converted} dibujos convertidos, ${xq.free} bytes libres`);
  fs.writeFileSync(`test/msx/dibujos${sfx}.rom`, xq.rom);
  // el dibujo de la localidad 1 pintado como en el Spectrum: color (0-15,
  // con el brillo) de cada punto
  const pic = rq.model.pictures[1];
  const zx = new Uint8Array(6912);
  const attr = (pic.paper << 3) | pic.ink;
  zx.fill(attr, 6144);
  const lib = rq.model.pictures.map((d) => (d && d.drawstring ? { data: d.drawstring } : null));
  const painter = new Painter(zx, lib, { kind: 'daad', charset: defaultCharset() });
  painter.setColours(attr);
  painter.run(1);
  const want = new Uint8Array(256 * 8 * pic.height);
  for (let y = 0; y < 8 * pic.height; y++) for (let xx = 0; xx < 256; xx++) {
    const at = zx[6144 + (y >> 3) * 32 + (xx >> 3)];
    const set = zx[rowAddr(y) + (xx >> 3)] & (0x80 >> (xx & 7));
    want[y * 256 + xx] = (at & 0x40 ? 8 : 0) + (set ? at & 7 : (at >> 3) & 7);
  }
  fs.writeFileSync(`test/msx/dibujo${sfx}.json`, JSON.stringify({ rows: pic.height, colours: Buffer.from(want).toString('base64') }));
}
if (fails) process.exit(1);

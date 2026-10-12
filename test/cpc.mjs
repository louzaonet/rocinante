// Amstrad CPC: exporta la plantilla (con y sin dibujos) a test/cpc/ y deja lo
// que test/cpc.py necesita para compararla en MAME con el intérprete original:
// órdenes, transcripción del motor JS, juego de caracteres y, del dibujo de la
// primera localidad, el color que debería tener cada punto.
import fs from 'fs';
import { newProject } from '../src/project/template.js';
import { compileProject } from '../src/project/compile.js';
import { exportCPC, cpcCharset } from '../src/cpc/cpcexport.js';
import { readDisk, readHeader } from '../src/cpc/amsdos.js';
import { readDDB } from '../src/daad/ddb.js';
import { cdtBlocks } from '../src/cpc/cpctape.js';
import { Engine } from '../src/daad/engine.js';
import { TextIO, EndOfScript } from '../src/daad/io-text.js';

let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FALLO ') + m); if (!c) fails++; };
const CMDS = {
  es: ['mirar', 'i', 'coger linterna', 'n', 'coger linterna', 'cogela', 'i', 'dejar todo', 'coger todo y s', 'ex linterna',
    'punto', 'turno', 'xyzzy', 'o', 'ponerse linterna', 'abrir puerta', 'n. s. n. s', 'fin', 'n'],
  en: ['look', 'i', 'get torch', 'n', 'get torch', 'get it', 'i', 'drop all', 'get all and s', 'x torch',
    'score', 'turns', 'xyzzy', 'w', 'wear torch', 'open door', 'n. s. n. s', 'put torch in torch', 'quit', 'n'],
};
const piezas = JSON.parse(fs.readFileSync('test/vec/piezas.json'));
fs.mkdirSync('test/cpc', { recursive: true });
fs.writeFileSync('test/cpc/charset.bin', cpcCharset());

for (const lang of ['es', 'en']) {
  const sfx = lang === 'es' ? '' : '_en';
  // plantilla sin dibujos, y su partida en el motor JS
  const p = newProject(lang === 'es' ? 'Prueba' : 'Test', lang);
  const r = compileProject(p);
  ok(!r.errors.length, `${lang}: plantilla sin errores`);
  const io = new TextIO(CMDS[lang]);
  try { await new Engine(r.model, io, { random: () => 0 }).run(); } catch (e) { if (!(e instanceof EndOfScript)) throw e; }
  fs.writeFileSync(`test/cpc/js${sfx}.txt`, io.out);
  fs.writeFileSync(`test/cpc/cmds${sfx}.txt`, CMDS[lang].join('\n') + '\n');
  const x = exportCPC(r.model, { title: p.meta.title, author: 'Rocinante' });
  fs.writeFileSync(`test/cpc/plantilla${sfx}.dsk`, x.dsk);
  fs.writeFileSync(`test/cpc/plantilla${sfx}.cdt`, x.tape);
  const files = readDisk(x.dsk);
  ok(files.length === 1 && files[0].name === 'DISC.BIN', `${lang}: el disco tiene DISC.BIN`);
  const h = readHeader(files[0].data);
  ok(h && h.load === 0x840 && h.exec === 0x840 && h.length > files[0].data.length - 256 && h.length <= files[0].data.length - 128, `${lang}: cabecera AMSDOS`);
  const blocks = cdtBlocks(x.tape);
  ok(blocks.length === 2 * Math.ceil((x.bin.length - 128) / 2048) && blocks[0].data[0] === 0x2c && blocks[1].data[0] === 0x16, `${lang}: cinta en bloques de 2K`);
  const back = readDDB(x.ddb, 0x2880);
  ok(JSON.stringify(back.msgs) === JSON.stringify(r.model.msgs) && back.machine === 3, `${lang}: la base se lee igual (2880h, máquina 3)`);

  // con dibujos vectoriales en las primeras localidades
  const q = newProject(lang === 'es' ? 'Dibujos' : 'Pictures', lang);
  const ids = ['camino', 'bosque', 'noche', 'sierra', 'corral', 'molinos', 'castillo', 'playa'];
  q.pictures = piezas.pictures.filter((d) => ids.includes(d.id)).map((d) => ({ ...d }));
  // camino (80) y bosque (81) son subdibujos de los demás: aquí, con su número
  q.pictures.find((d) => d.id === 'camino').number = 80;
  q.pictures.find((d) => d.id === 'bosque').number = 81;
  const locs = ['noche', 'sierra', 'corral', 'molinos', 'castillo', 'playa'];
  while (q.locations.length < locs.length + 1) q.locations.push({ ...q.locations[q.locations.length - 1], id: 'l' + q.locations.length });
  locs.forEach((id, i) => { q.locations[i + 1].picture = id; });
  const rq = compileProject(q);
  ok(!rq.errors.length, `${lang}: proyecto con dibujos sin errores`);
  const xq = exportCPC(rq.model);
  ok(xq.converted >= locs.length, `${lang}: ${xq.converted} dibujos convertidos`);
  fs.writeFileSync(`test/cpc/dibujos${sfx}.dsk`, xq.dsk);
  const pv = xq.previews[1];
  fs.writeFileSync(`test/cpc/dibujo${sfx}.json`, JSON.stringify({ inks: pv.inks, window: pv.window, pens: Buffer.from(pv.pens).toString('base64') }));
}
if (fails) process.exit(1);

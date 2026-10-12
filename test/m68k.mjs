// Atari ST y Amiga: comprueba por estructura lo que se exporta (base de datos
// con el byte alto primero y alineada, PART1.DAT, discos .st y .adf) y deja en
// test/st/ y test/amiga/ lo que test/st.py y test/amiga.py necesitan para
// jugarlo en Hatari y FS-UAE con el intérprete original: discos, órdenes, transcripción del motor JS, juego de caracteres
// y, del dibujo de la primera localidad, el índice de color de cada punto.
import fs from 'fs';
import { newProject } from '../src/project/template.js';
import { compileProject } from '../src/project/compile.js';
import { exportST, exportAmiga } from '../src/m68k/export16.js';
import { buildDAT, readDAT, compress, decompress, planar } from '../src/m68k/dat.js';
import { renderVector, quantize, ZX_PALETTE16, from9 } from '../src/m68k/m68kgfx.js';
import { readST, writeST } from '../src/atari/stdisk.js';
import { readADF } from '../src/amiga/adf.js';
import { readDDB } from '../src/daad/ddb.js';
import { Engine } from '../src/daad/engine.js';
import { TextIO, EndOfScript } from '../src/daad/io-text.js';
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

// --- PART1.DAT: compresión y planos
{
  const w = 32, h = 8;
  const px = Uint8Array.from({ length: w * h }, (_, i) => (i < 100 ? 3 : i % 7 === 0 ? 9 : 0));
  const z = compress(px);
  ok(z && same(decompress(z, px.length), px), 'compresión de DMG: ida y vuelta');
  const pl = planar(Uint8Array.from({ length: 16 }, (_, i) => i), 16, 1);
  ok(same(pl, [0x55, 0x33, 0x0f, 0x00, 0x55, 0x33, 0x0f, 0xff]), 'planos del ST: 4 bytes por cada 8 puntos');
  const ims = [{ n: 3, x: 16, y: 8, width: w, height: h, pixels: px, palette: ZX_PALETTE16 },
    { n: 7, x: 0, y: 0, width: 16, height: 1, pixels: Uint8Array.from({ length: 16 }, (_, i) => i), palette: ZX_PALETTE16 }];
  const dat = buildDAT(ims);
  const back = readDAT(dat);
  ok(back.length === 2 && back.every((b, i) => b.n === ims[i].n && b.x === ims[i].x && b.y === ims[i].y && same(b.pixels, ims[i].pixels) && same(b.palette, ims[i].palette)),
    'PART1.DAT: ida y vuelta');
  ok(dat[0] === 3 && dat[1] === 0 && (dat[6] << 24 | dat[7] << 16 | dat[8] << 8 | dat[9]) === dat.length, 'PART1.DAT: cabecera');
  const rgba = new Uint8Array(64 * 4).map((_, i) => ((i >> 2) * 37 * ((i & 3) + 1)) & 255);
  const q = quantize(rgba, 64, 1);
  ok(q.palette.length === 16 && q.palette[0] === 0 && q.palette[15] === 0x777 && q.pixels.every((v) => v < 16), 'paso a 16 colores con negro y blanco fijos (0 y 15, los del texto)');
  ok(ZX_PALETTE16[0] === 0 && ZX_PALETTE16[15] === 0x777, 'paleta del Spectrum: negro en 0 y blanco en 15');
  // una imagen que ya tiene colores del ST no se trama
  const cols = [0x000, 0x777, 0x600, 0x060, 0x006, 0x660, 0x700];
  const flat = new Uint8Array(64 * 16 * 4);
  for (let i = 0; i < 64 * 16; i++) flat.set([...from9(cols[(i >> 3) % cols.length]).map(Math.round), 255], i * 4);
  const fq = quantize(flat, 64, 16);
  ok(fq.pixels.every((v, i) => fq.palette[v] === cols[(i >> 3) % cols.length]), 'una imagen con colores del ST queda tal cual');
}

// --- disco .st
{
  const files = [{ name: 'A.TXT', data: Uint8Array.from('hola', (c) => c.charCodeAt(0)) }, { name: 'GRANDE.BIN', data: new Uint8Array(5000).map((_, i) => i * 7) }];
  const back = readST(writeST(files));
  ok(back.length === 2 && back.every((b, i) => b.name === files[i].name && same(b.data, files[i].data)), 'disco .st: ida y vuelta');
  let full = false;
  try { writeST([{ name: 'X', data: new Uint8Array(800000) }]); } catch (e) { full = e.message === 'disk-full'; }
  ok(full, 'disco .st: avisa si no cabe');
}

fs.mkdirSync('test/st', { recursive: true });
fs.mkdirSync('test/amiga', { recursive: true });
fs.writeFileSync('test/st/charset.bin', defaultCharset());
const piezas = JSON.parse(fs.readFileSync('test/vec/piezas.json'));

for (const lang of ['es', 'en']) {
  const sfx = lang === 'es' ? '' : '_en';
  const p = newProject(lang === 'es' ? 'Prueba' : 'Test', lang);
  const r = compileProject(p);
  ok(!r.errors.length, `${lang}: plantilla sin errores`);
  const io = new TextIO(CMDS[lang]);
  try { await new Engine(r.model, io, { random: () => 0 }).run(); } catch (e) { if (!(e instanceof EndOfScript)) throw e; }
  fs.writeFileSync(`test/st/js${sfx}.txt`, io.out);
  fs.writeFileSync(`test/st/cmds${sfx}.txt`, CMDS[lang].join('\n') + '\n');
  fs.writeFileSync(`test/amiga/js${sfx}.txt`, io.out);
  fs.writeFileSync(`test/amiga/cmds${sfx}.txt`, CMDS[lang].join('\n') + '\n');

  const x = await exportST(r.model, { title: p.meta.title });
  fs.writeFileSync(`test/st/plantilla${sfx}.st`, x.st);
  const files = readST(x.st);
  const prg = lang === 'es' ? 'SDI1.PRG' : 'EDI1.PRG';
  ok(files.map((f) => f.name).join(' ') === `EMUDESK.INF DESKTOP.INF ${prg} PART1.DDB PART1.DAT PART1.CHR PART1.CH0`, `${lang}: ficheros del disco .st`);
  const inf = new TextDecoder().decode(files[0].data);
  ok(inf.includes(`#Z 01 A:\\${prg}@`) && new TextDecoder().decode(files[1].data).includes(`#Z 01 A:\\${prg}@`), `${lang}: el escritorio arranca ${prg}`);
  const ddb = files[3].data;
  const back = readDDB(ddb, 0, true);
  ok(back.machine === 5 && JSON.stringify(back.msgs) === JSON.stringify(r.model.msgs) && JSON.stringify(back.ltx) === JSON.stringify(r.model.ltx), `${lang}: la base se lee igual (ST, byte alto primero)`);
  // las tablas de palabras y lo que apuntan, en direcciones pares
  const w16 = (o) => (ddb[o] << 8) | ddb[o + 1];
  const tables = [w16(8 + 2), w16(8 + 4), w16(8 + 6), w16(8 + 8), w16(8 + 10), w16(8 + 12)];
  const pointed = [];
  for (const [tbl, n] of [[w16(10), r.model.procs.length], [w16(12), r.model.objs.length], [w16(14), r.model.ltx.length], [w16(16), r.model.msgs.length], [w16(18), r.model.sysmsgs.length], [w16(20), r.model.ltx.length]]) {
    for (let i = 0; i < n; i++) pointed.push(w16(tbl + 2 * i));
  }
  ok(tables.every((a) => a % 2 === 0) && pointed.every((a) => a % 2 === 0), `${lang}: tablas y textos en direcciones pares`);
  ok(files[5].data.length === 2176 && same(files[5].data.subarray(128), defaultCharset()), `${lang}: PART1.CHR con el juego de caracteres`);

  const a = await exportAmiga(r.model, { title: p.meta.title });
  fs.writeFileSync(`test/amiga/plantilla${sfx}.adf`, a.adf);
  const af = readADF(a.adf);
  const ai = lang === 'es' ? 'sdi1' : 'edi1';
  const names = af.map((f) => f.path).sort().join(' ');
  ok(names === [ai, 'part1.chr', 'part1.dat', 'part1.ddb', 's/startup-sequence'].sort().join(' '), `${lang}: ficheros del disco .adf (${names})`);
  ok(new TextDecoder().decode(af.find((f) => f.path === 's/startup-sequence').data).trim() === ai, `${lang}: la Startup-Sequence llama a ${ai}`);
  const ab = readDDB(af.find((f) => f.path === 'part1.ddb').data, 0, true);
  ok(ab.machine === 6 && JSON.stringify(ab.msgs) === JSON.stringify(r.model.msgs), `${lang}: la base del Amiga se lee igual`);
  ok(a.adf[0] === 0x44 && a.adf[1] === 0x4f && a.adf[2] === 0x53, `${lang}: el .adf arranca (DOS)`);

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
  const xq = await exportST(rq.model, { title: q.meta.title });
  ok(xq.converted >= locs.length, `${lang}: ${xq.converted} dibujos en PART1.DAT (${xq.dat.length} bytes)`);
  fs.writeFileSync(`test/st/dibujos${sfx}.st`, xq.st);
  const aq = await exportAmiga(rq.model, { title: q.meta.title });
  fs.writeFileSync(`test/amiga/dibujos${sfx}.adf`, aq.adf);
  const im = renderVector(rq.model.pictures, 1, defaultCharset());
  const inDat = readDAT(xq.dat).find((d) => d.n === 1);
  ok(inDat && same(inDat.pixels, im.pixels), `${lang}: el dibujo 1 está en PART1.DAT tal cual`);
  const pic = JSON.stringify({ x: im.x, y: im.y, width: im.width, height: im.height, pixels: Buffer.from(im.pixels).toString('base64') });
  fs.writeFileSync(`test/st/dibujo${sfx}.json`, pic);
  fs.writeFileSync(`test/amiga/dibujo${sfx}.json`, pic);
}
if (fails) process.exit(1);

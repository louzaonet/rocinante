// PC (MS-DOS): comprueba por estructura lo que se exporta (base de datos con
// el byte bajo primero, PART1.DAT del PC, .zip y disquete .img) y deja en
// test/dos/ lo que test/dos.py necesita para jugarlo en DOSBox con el
// intérprete original: el .zip de la plantilla, el disquete con dibujos,
// órdenes, transcripción del motor JS y, del dibujo de la primera localidad,
// el índice de color de cada punto.
import fs from 'fs';
import { newProject } from '../src/project/template.js';
import { compileProject } from '../src/project/compile.js';
import { exportDOS } from '../src/dos/dosexport.js';
import { buildDAT, readDAT, compressPC, decompress } from '../src/m68k/dat.js';
import { renderVector, ZX_PALETTE16 } from '../src/m68k/m68kgfx.js';
import { readFAT12 } from '../src/disk/fat12.js';
import { readZip } from '../src/disk/zip.js';
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

// --- PART1.DAT del PC
{
  const px = Uint8Array.from({ length: 32 * 8 }, (_, i) => (i < 100 ? 3 : i % 7 === 0 ? 9 : 0));
  for (const z of [true, false]) ok(same(decompress(compressPC(px, z), px.length, { pc: true, mask: z ? null : 0 }), px), `nibbles del PC ${z ? 'comprimidos' : 'sin comprimir'}: ida y vuelta`);
  const ims = [{ n: 2, x: 16, y: 8, width: 32, height: 8, pixels: px, palette: ZX_PALETTE16 }];
  const dat = buildDAT(ims, { pc: true });
  const back = readDAT(dat);
  ok(back.length === 1 && back[0].n === 2 && back[0].x === 16 && same(back[0].pixels, px) && same(back[0].palette, ZX_PALETTE16), 'PART1.DAT del PC: ida y vuelta');
  const dv = new DataView(dat.buffer);
  ok(dv.getUint16(0) === 0xffff && dv.getUint32(6, true) === dat.length && dv.getUint16(10 + 48 * 2 + 4, true) === 4, 'PART1.DAT del PC: cabecera y entradas con el byte bajo primero');
  ok(dv.getUint16(10 + 48 * 2 + 12 + 30) === 0x777, 'PART1.DAT del PC: la paleta, con el byte alto primero');
  // el intérprete salta de una imagen a la siguiente sumando 6 y el tamaño
  const two = buildDAT([ims[0], { ...ims[0], n: 5 }], { pc: true });
  const tv = new DataView(two.buffer);
  const first = tv.getUint32(10 + 48 * 2, true);
  ok(tv.getUint32(10 + 48 * 5, true) === first + 6 + tv.getUint16(first + 4, true), 'PART1.DAT del PC: imágenes seguidas, sin relleno');
}

fs.mkdirSync('test/dos', { recursive: true });
const piezas = JSON.parse(fs.readFileSync('test/vec/piezas.json'));

for (const lang of ['es', 'en']) {
  const sfx = lang === 'es' ? '' : '_en';
  const p = newProject(lang === 'es' ? 'Prueba' : 'Test', lang);
  const r = compileProject(p);
  ok(!r.errors.length, `${lang}: plantilla sin errores`);
  const io = new TextIO(CMDS[lang]);
  try { await new Engine(r.model, io, { random: () => 0 }).run(); } catch (e) { if (!(e instanceof EndOfScript)) throw e; }
  fs.writeFileSync(`test/dos/js${sfx}.txt`, io.out);
  fs.writeFileSync(`test/dos/cmds${sfx}.txt`, CMDS[lang].join('\n') + '\n');

  const x = await exportDOS(r.model, { title: p.meta.title });
  fs.writeFileSync(`test/dos/plantilla${sfx}.zip`, x.zip);
  const exe = lang === 'es' ? 'INTSM1.EXE' : 'INTEM1.EXE', bat = lang === 'es' ? 'JUGAR.BAT' : 'PLAY.BAT';
  const want = [bat, exe, 'PART1.DDB', 'PART1.DAT', 'PART1.CHR', lang === 'es' ? 'LEEME.TXT' : 'README.TXT'];
  const z = readZip(x.zip);
  const dir = p.meta.title.toUpperCase();
  ok(z.map((f) => f.name).join(' ') === want.map((n) => `${dir}/${n}`).join(' ') && z.every((f) => f.crcOk), `${lang}: ficheros del .zip, en la carpeta ${dir}`);
  ok(new TextDecoder().decode(z[0].data) === `@ECHO OFF\r\n${exe.slice(0, -4)} V\r\n`, `${lang}: ${bat} arranca ${exe} en VGA`);
  const img = readFAT12(x.img);
  ok(x.img.length === 1474560 && img.map((f) => f.name).join(' ') === want.join(' ') && img.every((f, i) => same(f.data, z[i].data)), `${lang}: disquete de 1,44 MB con los mismos ficheros`);
  ok(x.img[510] === 0x55 && x.img[511] === 0xaa && x.img[21] === 0xf0, `${lang}: el disquete tiene el formato de MS-DOS`);
  const ddb = img[2].data;
  const back = readDDB(ddb, 0);
  ok(back.machine === 0 && JSON.stringify(back.msgs) === JSON.stringify(r.model.msgs) && JSON.stringify(back.ltx) === JSON.stringify(r.model.ltx), `${lang}: la base se lee igual (PC, byte bajo primero)`);
  ok(same(img[4].data.subarray(128), defaultCharset()), `${lang}: PART1.CHR con el juego de caracteres`);

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
  const xq = await exportDOS(rq.model, { title: q.meta.title });
  ok(xq.converted >= locs.length, `${lang}: ${xq.converted} dibujos en PART1.DAT (${xq.dat.length} bytes)`);
  fs.writeFileSync(`test/dos/dibujos${sfx}.img`, xq.img);
  const im = renderVector(rq.model.pictures, 1, defaultCharset());
  const inDat = readDAT(xq.dat).find((d) => d.n === 1);
  ok(inDat && same(inDat.pixels, im.pixels), `${lang}: el dibujo 1 está en PART1.DAT tal cual`);
  fs.writeFileSync(`test/dos/dibujo${sfx}.json`, JSON.stringify({ x: im.x, y: im.y, width: im.width, height: im.height, pixels: Buffer.from(im.pixels).toString('base64') }));
}
if (fails) process.exit(1);

// Importación de juegos de DAAD de Atari ST, Amiga, PC, MSX, CPC y C64: la plantilla,
// con dibujos vectoriales y un mapa de bits, se exporta a cada máquina y se
// vuelve a importar. La base de datos tiene que salir igual (vocabulario,
// textos, objetos, conexiones y procesos), y los dibujos también: en el ST, el
// Amiga y el PC, exportando otra vez lo importado, cada imagen de 16 colores
// con los mismos colores punto a punto; en el MSX, la misma base de gráficos.
// Del CPC y el C64 (disco y cinta del CPC, disco del C64) de momento solo se
// importa la base de datos.
import fs from 'fs';
import { newProject } from '../src/project/template.js';
import { compileProject } from '../src/project/compile.js';
import { exportST, exportAmiga } from '../src/m68k/export16.js';
import { exportDOS } from '../src/dos/dosexport.js';
import { exportMSX } from '../src/msx/msxexport.js';
import { exportCPC } from '../src/cpc/cpcexport.js';
import { exportC64 } from '../src/c64/c64export.js';
import { readDAT } from '../src/m68k/dat.js';
import { readFAT12 } from '../src/disk/fat12.js';
import { from9 } from '../src/m68k/m68kgfx.js';
import { importClassic } from '../src/import/classic.js';
import { decodePNG } from '../src/gfx/png.js';
import { resizeRGBA } from '../src/gfx/zxconvert.js';

let bad = 0;
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) bad++; };

// decode(maestra, w, h) para las exportaciones de 16 bits (en el navegador lo
// hace un canvas)
const decode = async (url, w, h) => {
  const { width, height, rgba } = await decodePNG(url);
  return width === w && height === h ? rgba : resizeRGBA(rgba, width, height, w, h);
};
const same = (m) => JSON.stringify({ vocab: [...m.vocab].sort((a, b) => (a.word + a.type).localeCompare(b.word + b.type)),
  sysmsgs: m.sysmsgs, msgs: m.msgs, ltx: m.ltx, otx: m.otx, con: m.con, objs: m.objs, procs: m.procs, language: m.language });
// colores de cada punto de las imágenes de un .DAT
const colours = (dat) => readDAT(dat).map((im) => ({ n: im.n, x: im.x, y: im.y, w: im.width, h: im.height,
  rgb: Array.from(im.pixels, (p) => from9(im.palette[p]).join()).join(';') }));

const piezas = JSON.parse(fs.readFileSync('test/vec/piezas.json'));
const bitmaps = JSON.parse(fs.readFileSync('test/pic/proyecto.json')).pictures;
for (const lang of ['es', 'en']) {
  const p = newProject(lang === 'es' ? 'Prueba' : 'Test', lang);
  const ids = ['camino', 'bosque', 'noche', 'sierra', 'corral'];
  p.pictures = [...piezas.pictures.filter((d) => ids.includes(d.id)).map((d) => ({ ...d })), { ...bitmaps[0] }];
  p.pictures.find((d) => d.id === 'camino').number = 80;
  p.pictures.find((d) => d.id === 'bosque').number = 81;
  const locs = ['noche', 'sierra', 'corral', bitmaps[0].id];
  while (p.locations.length < locs.length + 1) p.locations.push({ ...p.locations[p.locations.length - 1], id: 'l' + p.locations.length });
  locs.forEach((id, i) => { p.locations[i + 1].picture = id; });
  const { model, errors } = compileProject(p);
  check(!errors.length, `${lang}: el proyecto compila`);

  const st = await exportST(model, { title: 'Prueba' });
  const amiga = await exportAmiga(model, { title: 'Prueba' });
  const dos = await exportDOS(model, { title: 'Prueba' });
  const msx = exportMSX(model);
  const cases = [
    ['st', 'juego.st', st.st, st.dat, (m) => exportST(m, { title: 'Prueba', decode }).then((x) => x.dat)],
    ['amiga', 'juego.adf', amiga.adf, amiga.dat, (m) => exportAmiga(m, { title: 'Prueba', decode }).then((x) => x.dat)],
    ['pc (.zip)', 'juego.zip', dos.zip, dos.dat, (m) => exportDOS(m, { title: 'Prueba', decode }).then((x) => x.dat)],
    ['pc (.img)', 'juego.img', dos.img, dos.dat, null],
    ['msx', 'juego.rom', msx.rom, msx.mdg, (m) => exportMSX(m).mdg],
  ];
  // y un disco de MSX-DOS con PART1.DDB y DAAD.MDG (sin intérprete: solo para leerlo)
  const { writeFAT12, ST_720K } = await import('../src/disk/fat12.js');
  const msxDisk = writeFAT12([{ name: 'PART1.DDB', data: msx.ddb }, { name: 'DAAD.MDG', data: msx.mdg }], { ...ST_720K, atari: false, media: 0xf9 });
  check(readFAT12(msxDisk).length === 2, `${lang}: disco de MSX de prueba`);
  cases.push(['msx (disco)', 'juego.dsk', msxDisk, msx.mdg, (m) => exportMSX(m).mdg]);
  const cpc = exportCPC(model, { title: 'Prueba' }), c64 = exportC64(model, { title: 'Prueba' });
  cases.push(['cpc (disco)', 'juego.dsk', cpc.dsk, null, null], ['cpc (cinta)', 'juego.cdt', cpc.tape, null, null], ['c64', 'juego.d64', c64.d64, null, null]);

  for (const [what, name, bytes, gfx, again] of cases) {
    let parts;
    try { parts = await importClassic(bytes, name); } catch (e) { check(false, `${lang} ${what}: ${e.message}`); continue; }
    const { project, report } = await parts[0].load();
    const r = compileProject(project);
    check(!r.errors.length && same(r.model) === same(model), `${lang} ${what}: base de datos igual (${report.slice(0, 60)}...)`);
    // (en el MSX no hay mapas de bits: la localidad 4 se queda con el suyo vacío)
    if (gfx) check(project.locations.slice(1, 5).every((l) => l.picture), `${lang} ${what}: localidades con su dibujo`);
    if (!again) continue;
    const back = await again(r.model);
    if (what.startsWith('msx')) check(Buffer.compare(Buffer.from(back), Buffer.from(gfx)) === 0, `${lang} ${what}: la misma base de gráficos`);
    else {
      const a = colours(gfx), b = colours(back);
      const diff = a.filter((im, i) => JSON.stringify(im) !== JSON.stringify(b[i])).map((im) => im.n);
      check(a.length === b.length && !diff.length, `${lang} ${what}: ${a.length} imágenes iguales punto a punto` + (diff.length ? ` (distintas: ${diff})` : ''));
    }
  }
}
process.exit(bad ? 1 : 0);

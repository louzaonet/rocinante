// Importación de aventuras clásicas: juegos de DAAD (de las dos versiones) y
// de PAW de Spectrum, desde cintas (.tap, .tzx), instantáneas (.z80, .sna) y
// discos de +3 (.dsk); juegos de DAAD de Atari ST, Amiga, PC y MSX (ver
// daadfiles.js), y de Amstrad CPC y Commodore 64 (cpcc64.js; sin dibujos).
//
// De cada fichero sale la memoria tal como la deja la carga (o, en un disco,
// cada fichero de código o el contenido en bruto de las pistas) y en ella se
// busca la base de datos de DAAD; si no hay, se prueba con PAW. Los gráficos de
// DAAD van al final de la memoria (sdgread.js).
//
// DAAD 1 lleva el bucle del juego en el intérprete, como PAW: el proyecto lo
// lleva en sus procesos (ver wrapV1).

import { readSnapshot } from '../spectrum/z80read.js';
import { readSDG } from '../spectrum/sdgread.js';
import { readDisk } from '../spectrum/p3disk.js';
import { readDDB } from '../daad/ddb.js';
import { decompileModel } from '../project/decompile.js';
import { PROC_ROLES } from '../project/template.js';
import { defaultCharset } from '../spectrum/zxexport.js';
import { importPAW } from '../paw/import.js';
import { opLen } from '../gfx/vector.js';
import { fileContainer, findParts, readDDBFile, readCHR, datPictures, readMDGFile, readMDG } from './daadfiles.js';
import { isCpcDisk, cpcDiskFiles, isCpcTape, cpcTapeFiles, isD64, c64Files, placeFiles } from './cpcc64.js';
import { t } from '../i18n.js';

// Las partidas que hay en el fichero: [{ label, ram }] (ram: 64K con la
// memoria) y, si no se pudo colocar algo, unplaced.
export function memoryImages(bytes, name = '') {
  if (/\.dsk$/i.test(name) || /^(EXTENDED CPC DSK|MV - CPC)/.test(String.fromCharCode(...bytes.subarray(0, 16)))) return readDisk(bytes);
  const s = readSnapshot(bytes, name);
  return [{ label: '', ram: s.ram, unplaced: s.unplaced || 0 }];
}

// Cabecera de DDB en addr: versión 1 o 2, byte de máquina e idioma, palabra
// nula 95 y punteros dentro de la memoria. Devuelve la dirección lógica en la
// que tiene que estar (los punteros son absolutos) o -1.
function ddbAt(ram, addr) {
  const v = ram[addr];
  if ((v !== 1 && v !== 2) || ram[addr + 2] !== 95 || (ram[addr + 1] & 15) > 1) return -1;
  if (!ram[addr + 4] || !ram[addr + 7]) return -1;
  const ptrs = Array.from({ length: v === 1 ? 11 : 12 }, (_, i) => ram[addr + 8 + 2 * i] | (ram[addr + 9 + 2 * i] << 8)).filter(Boolean);
  if (ptrs.length < 10) return -1;
  const min = Math.min(...ptrs);
  // las tablas empiezan tras la cabecera (32 bytes en la versión 1, 34 + 26
  // de los vectores de EXTERN en la 2); la base suele ser la de la máquina
  // (8400h en Spectrum, 2880h en CPC, 3880h en C64)
  const own = { 1: 0x8400, 2: 0x3880, 3: 0x2880, 4: 0x0100 }[ram[addr + 1] >> 4];
  const bases = v === 1 ? [min - 32, 0x8480, 0x8400] : [own ?? 0x8400, min - 60, min - 34];
  for (const base of bases) {
    if (base < 0 || base > 0xfe00) continue;
    if (ptrs.every((p) => p > base && p - base + addr < ram.length)) return base;
  }
  return -1;
}

// Busca las bases de datos en la memoria: en su sitio de siempre o en
// cualquier otro (en un disco leído en bruto, donde caiga; puede haber varias,
// una por parte). Devuelve [{ base, mem, model }].
export function findDDBs(ram, all = false) {
  const out = [];
  const tries = [0x8400, 0x8480];
  for (let a = 0; a < ram.length - 64; a++) if (ram[a + 2] === 95 && (ram[a] === 1 || ram[a] === 2) && a !== 0x8400 && a !== 0x8480) tries.push(a);
  for (const addr of tries) {
    const base = ddbAt(ram, addr);
    if (base < 0) continue;
    // la memoria vista desde la base lógica
    let mem = ram;
    if (base !== addr || ram.length !== 65536) {
      mem = new Uint8Array(65536);
      const from = addr - base;
      for (let a = 0; a < 65536; a++) { const k = from + a; if (k >= 0 && k < ram.length) mem[a] = ram[k]; }
    }
    try {
      const model = readDDB(mem.subarray(base), base);
      if (model.vocab.length && model.ltx.length) {
        out.push({ base, mem, model });
        if (!all) break;
      }
    } catch { /* no es una base de datos */ }
  }
  return out;
}

// Las partes del juego que hay en el fichero: [{ label, load() }], donde
// load() -> Promise<{ project, report }> (y, para las pruebas, la memoria y
// la versión de DAAD de los de Spectrum)
export async function importClassic(bytes, name = 'juego') {
  const title = name.replace(/\.(z80|sna|tap|tzx|dsk|st|adf|img|zip|rom|cdt|d64|prg)$/i, '').replace(/_+/g, ' ').trim();
  const named = (label) => title + (label ? ` (${label})` : '');
  // Amstrad CPC y Commodore 64: cada fichero de código en su dirección
  const cpcDisk = isCpcDisk(bytes), cpcTape = !cpcDisk && isCpcTape(bytes, name), c64 = !cpcDisk && !cpcTape && (isD64(bytes, name) || /\.prg$/i.test(name));
  if (cpcDisk || cpcTape || c64) {
    const machine = c64 ? 'c64' : 'cpc';
    const tape = cpcTape ? cpcTapeFiles(bytes) : null;
    const files = cpcDisk ? cpcDiskFiles(bytes) : tape ? tape.files : c64Files(bytes, name);
    const found = [];
    for (const f of files) for (const x of findDDBs(placeFiles([f]))) found.push({ ...x, label: f.name });
    if (!found.length) {
      if (tape?.unplaced) throw new Error(t('Formato de fichero no soportado: tiene {n} bloques de un cargador propio (turbo o protegido) y no sé dónde van.', { n: tape.unplaced }));
      throw new Error(t('Formato de fichero no soportado: no encuentro una aventura de DAAD ni de PAW.'));
    }
    return found.map((f) => ({ label: found.length > 1 ? f.label : '', load: async () => importDAAD({ model: f.model, machine, loose: true }, named(found.length > 1 ? f.label : '')) }));
  }
  const isSpectrumDisk = /^(EXTENDED CPC DSK|MV - CPC)/.test(String.fromCharCode(...bytes.subarray(0, 16)));
  if (!isSpectrumDisk && !/\.(z80|sna|tap|tzx)$/i.test(name) && String.fromCharCode(...bytes.subarray(0, 7)) !== 'ZXTape!') {
    const c = await fileContainer(bytes, name);
    if (c?.kind === 'msxrom') {
      // la base de datos, en 0100h
      let model = null;
      try { model = readDDB(c.mem.subarray(0x100), 0x100); } catch { /* no está */ }
      if (!model) throw new Error(t('Formato de fichero no soportado: no encuentro una aventura de DAAD ni de PAW.'));
      return [{ label: '', load: async () => importDAAD({ model, sdg: readMDG(c.mem), machine: 'msx' }, title) }];
    }
    if (c?.kind === 'files') {
      const parts = findParts(c.files);
      if (!parts.length) throw new Error(t('Formato de fichero no soportado: no encuentro una aventura de DAAD ni de PAW.'));
      return parts.map((pt) => ({
        label: pt.label,
        load: async () => {
          let r;
          try { r = readDDBFile(pt.ddb); } catch (e) {
            if (pt.ddb[0] === 1) throw new Error(t('No he podido leer la base de datos: es de la primera versión de DAAD, y en esta máquina su soporte es experimental.'));
            throw e;
          }
          const { model, machine } = r;
          return importDAAD({ model, machine, charset: readCHR(pt.chr), sdg: readMDGFile(pt.mdg), dat: pt.dat }, named(pt.label));
        },
      }));
    }
  }
  const images = memoryImages(bytes, name);
  const found = [];
  // en un disco, el contenido en bruto solo si en los ficheros no hay nada
  for (const im of images) {
    if (im.raw && found.length) break;
    const r = findDDBs(im.ram, im.raw);
    r.forEach((x, i) => found.push({ ...x, label: im.label || (r.length > 1 ? t('parte {n}', { n: i + 1 }) : '') }));
  }
  if (found.length) {
    return found.map((f) => ({
      label: f.label, mem: f.mem, version: f.model.ddb === 1 ? 1 : 2,
      load: async () => importDAAD({ model: f.model, sdg: readSDG(f.mem), machine: 'zx' }, named(f.label)),
    }));
  }
  // ¿PAW? Solo en cintas e instantáneas
  const unplaced = images.reduce((a, im) => a + (im.unplaced || 0), 0);
  if (!/\.dsk$/i.test(name)) {
    let r = null;
    try { r = importPAW(bytes, name); } catch { /* tampoco es de PAW */ }
    if (r) return [{ label: '', load: async () => r }];
  }
  if (unplaced) throw new Error(t('Formato de fichero no soportado: tiene {n} bloques de un cargador propio (turbo o protegido) y no sé dónde van.', { n: unplaced }));
  throw new Error(t('Formato de fichero no soportado: no encuentro una aventura de DAAD ni de PAW.'));
}

// Un fichero .DDB suelto (sin gráficos). La base depende de la máquina (byte
// 1 de la cabecera); en Atari ST y Amiga las palabras van al revés.
export async function importDDBFile(bytes, name = 'juego.ddb') {
  const { model, machine } = readDDBFile(bytes);
  return importDAAD({ model, machine, loose: true }, name.replace(/\.ddb$/i, ''));
}

// ------------------------------------------------------------------ DAAD
// model: el de la base de datos; sdg: dibujos vectoriales (de readSDG o
// readMDG); dat: imágenes de 16 colores (.DAT); charset: el juego de
// caracteres si viene aparte (.CHR); machine: la del juego (para el informe);
// loose: es un .DDB suelto (no se esperan gráficos)
async function importDAAD({ model, sdg = null, dat = null, charset = null, machine = 'zx', loose = false }, title) {
  const g = sdg;
  const lang = model.language;
  const T = (es, en) => (lang === 'en' ? en : es);
  // INK, PAPER y BORDER pasan por la tabla de colores de los gráficos; en el
  // proyecto, la tabla es la normal
  if (g && g.colourMap.some((c, i) => c !== i)) {
    for (const entries of model.procs) for (const e of entries) for (const c of e.condacts) {
      if ([65, 66, 67].includes(c.op) && !c.ind) c.args[0] = (c.args[0] & 8) | g.colourMap[c.args[0] & 7];
    }
  }
  // Dibujos que se piden con PICTURE sin ser de localidad (en DAAD 1 se
  // pintan; en la 2, PICTURE solo vale con los de localidad): van con otro
  // número, como dibujo de localidad que llama al original
  const alias = new Map();
  if (g && model.ddb === 1) {
    for (const entries of model.procs) for (const e of entries) e.condacts.forEach((c, j) => {
      if (c.op !== 84 || c.ind) return;
      const pic = g.pictures[c.args[0]];
      if (!pic || pic.location) return;
      if (!alias.has(pic.number)) {
        const k = Math.max(g.pictures.length, model.ltx.length) + alias.size;
        if (k > 255) return;
        alias.set(pic.number, k);
      }
      c.args[0] = alias.get(pic.number);
      // no es de localidad: la bandera 40 se queda a 0
      const let40 = e.condacts[j + 2];
      if (let40?.op === 51 && let40.args[0] === 40) let40.args[1] = 0;
    });
  }
  const imported = decompileModel(model, { title });
  const project = model.ddb === 1 ? wrapV1(imported, model) : imported;

  // Dibujos
  let npics = 0;
  if (g) {
    project.pictures = [];
    // DAAD 1 no tiene la forma corta de LINE: el bit 5 no se usa
    const data = g.pictures.map((p) => (model.ddb === 1 ? fixV1Lines(p.data) : p.data));
    // los que se usan desde otros (GOSUB)
    const used = new Set();
    for (const d of data) for (let i = 0; i < d.length && (d[i] & 7) !== 7; i += opLen(d, i)) if ((d[i] & 7) === 3) used.add(d[i + 1]);
    for (const n of alias.keys()) used.add(n);
    const locs = project.locations;
    for (const p of g.pictures) {
      if (!p.location && !used.has(p.number)) continue;
      const linked = p.location && p.number < locs.length;
      const id = (linked ? `${T('dibujo', 'picture')}_${locs[p.number].id}` : `${T('dibujo', 'picture')}_${p.number}`).slice(0, 40);
      project.pictures.push({ id, number: p.number, drawstring: data[p.number], location: p.location,
        line: p.line, col: p.col, height: p.height, width: p.width, paper: p.paper, ink: p.ink });
      if (linked) { locs[p.number].picture = id; npics++; }
    }
    for (const [n, k] of alias) {
      const p = g.pictures[n];
      project.pictures.push({ id: `${T('dibujo', 'picture')}_${n}_${T('aparte', 'extra')}`, number: k, drawstring: [3, n, 7], location: true,
        line: p.line, col: p.col, height: p.height, width: p.width, paper: p.paper, ink: p.ink });
    }
  }
  // Imágenes de 16 colores (ST, Amiga, PC); si el fichero está mal, el juego
  // se importa sin ellas
  let badDat = false;
  if (dat) {
    const locs = project.locations;
    try {
      const pics = await datPictures(dat, machine, (n) => (n < locs.length ? `${T('dibujo', 'picture')}_${locs[n].id}` : `${T('dibujo', 'picture')}_${n}`).slice(0, 40));
      project.pictures = pics;
      for (const p of pics) if (p.number < locs.length) { locs[p.number].picture = p.id; npics++; }
    } catch { badDat = true; dat = null; }
  }
  const cs = charset ?? g?.charset ?? null;
  if (cs) {
    const plain = defaultCharset();
    if (cs.some((v, k) => v !== plain[k])) project.settings.charset = b64(cs);
  }

  const dropped = Object.entries(model.dropped || {}).map(([k, v]) => `${k} (${v})`).join(', ');
  const report = t('Importado: {loc} localidades, {obj} objetos, {msg} mensajes, {proc} procesos', { loc: model.ltx.length, obj: model.otx.length, msg: model.msgs.length, proc: model.procs.length - (model.helpers?.length || 0) }) +
    (npics ? t(', {n} dibujos', { n: npics }) : '') + '.' +
    (dat && npics ? t(' Los dibujos de 16 colores pasan a mapas de bits del Spectrum; la imagen original se guarda para la web y las máquinas de 16 bits.') : '') +
    (model.ddb === 1 && machine !== 'zx' ? t(' Aviso: es de la primera versión de DAAD, y en esta máquina su soporte es experimental.') : '') +
    (model.ddb === 1 ? t(' Es de la primera versión de DAAD: el bucle del juego, que iba en el intérprete, está ahora en los procesos.') : '') +
    (model.helpers?.includes('INVEN') ? t(' INVEN lista los objetos con LISTAT (el original los ponía uno por línea).') : '') +
    (model.ddb === 1 && model.language === 'es' && continuousLists(model) ? t(' En las listas de objetos seguidas (bandera 53), DAAD 1 cambiaba «un» y «una» por «el» y «la»; DAAD 2 no.') : '') +
    (dropped ? t(' Sin equivalente en DAAD 2: {list}.', { list: dropped }) : '') +
    (machine === 'cpc' || machine === 'c64' ? t(' Los dibujos del CPC y del C64 todavía no se importan.') : '') +
    (badDat ? t(' No he podido leer su fichero de imágenes.') : g || dat || loose ? '' : t(' No he encontrado sus gráficos.'));
  return { project, report };
}

// ¿Pone el juego las listas de objetos seguidas (bit 6 de la bandera 53)?
function continuousLists(model) {
  return model.procs.some((entries) => entries.some((e) => e.condacts.some((c) =>
    !c.ind && c.args[0] === 53 && (c.op === 47 || (c.op === 51 && c.args[1] & 64)))));
}

// (con opLen no vale: en DAAD 2, LINE con el bit 5 ocupa 2 bytes)
function fixV1Lines(d) {
  const out = d.slice();
  for (let i = 0; i < out.length;) {
    const c = out[i], op = c & 7;
    if (op === 7) break;
    if (op === 1) out[i] = c & ~0x20;
    i += op === 0 || op === 1 ? 3 : op === 2 ? (c === 0x12 ? 5 : c & 0x20 ? 4 : 3) : op === 3 ? 2 : op === 4 ? 4 : 1;
  }
  return out;
}

const b64 = (u) => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };

// --------------------------------------------------------------- DAAD 1
// El bucle del intérprete de DAAD 1, escrito con procesos de DAAD 2:
//   en la localidad 0 (al empezar, y tras END, que la pone a 0): se borran
//     las banderas 0 a 247 y los objetos van a su sitio. Un juego que vuelva
//     a la localidad 0 a propósito empezaría de nuevo (DAAD 1 no lo hacía).
//   describir: ventana 0; la bandera 2 baja; a oscuras (bandera 0 y sin el
//     objeto 0 presente), la 3 y la 4 bajan, se borra el sitio del dibujo y
//     sale el mensaje 0; con luz, el dibujo y el texto de la localidad (en la
//     ventana 1, tras borrarla), y la bandera 40 dice si había dibujo; luego
//     el proceso 1
//   cada turno: el proceso 2; bajan las banderas 5 a 8, y a oscuras la 9 (y
//     la 10 si no está el objeto 0); se lee la orden (si no se entiende, el
//     mensaje 6, o el 35 si se acabó el tiempo); cuenta el turno; el proceso 0;
//     si nada hizo algo, las conexiones; si tampoco, el mensaje 7 o el 8
// DESC del juego original es RESTART, que vuelve a describir.
function wrapV1(imported, model) {
  const lang = model.language;
  const T = (es, en) => (lang === 'en' ? en : es);
  const R = Object.fromEntries(['main', 'turn', 'not_understood', 'after_describe', 'each_turn', 'responses', 'init']
    .map((k, i) => [k, PROC_ROLES[lang === 'en' ? 'en' : 'es'][i]]));
  const nProc = model.procs.length - model.helpers.length;
  const ren = new Map();
  const names = { 0: R.responses, 1: R.after_describe, 2: R.each_turn };
  imported.processes.forEach((pr, i) => {
    if (i >= nProc) ren.set(pr.id, { INVEN: T('inventario', 'inventory'), TURNS: T('turnos', 'turns') }[model.helpers[i - nProc]]);
    else ren.set(pr.id, names[i] || T(`proceso${i}`, `process${i}`));
  });
  const rename = (src) => src.replace(/(PROCESS\s+)(p\d+)\b/g, (_, a, id) => a + (ren.get(id) || id));
  const orig = imported.processes.map((pr) => ({ id: ren.get(pr.id), source: rename(pr.source) }));
  const byId = Object.fromEntries(orig.map((p) => [p.id, p]));
  for (let i = 0; i < 3; i++) byId[names[i]] ??= { id: names[i], source: '' };

  const light = imported.objects[0]?.id ?? '0';
  const D = T('describir', 'describe'), DARK = T('a_oscuras', 'in_the_dark');

  const head = (es, en) => T(es, en).split('\n').map((l) => '; ' + l).join('\n') + '\n';
  const procs = [
    { id: R.main, source: head(
      'Como el intérprete de la primera versión de DAAD: en la localidad 0 (al\nempezar y tras END) se prepara la partida; luego se describe la localidad y\nse pasa a los turnos. El DESC del juego original es aquí RESTART, que\nvuelve a este proceso.',
      'As the interpreter of the first version of DAAD did: at location 0 (at the\nstart and after END) the game is set up; then the location is described and\nturns begin. DESC in the original game is RESTART here, which comes back to\nthis process.') +
      `> _ _\n    AT ${imported.locations[0].id}\n    PROCESS ${R.init}\n` +
      `> _ _\n    MINUS 2 1\n> _ _\n    WINDOW 0\n    NOTZERO fDark\n    MINUS 3 1\n> _ _\n    ZERO fDark\n    PROCESS ${D}\n    PROCESS ${R.after_describe}\n    PROCESS ${R.turn}\n` +
      `> _ _\n    PRESENT ${light}\n    PROCESS ${D}\n    PROCESS ${R.after_describe}\n    PROCESS ${R.turn}\n> _ _\n    PROCESS ${DARK}\n    PROCESS ${R.after_describe}\n    PROCESS ${R.turn}\n` },
    { id: R.turn, source: head('Un turno, como en la primera versión de DAAD.', 'One turn, as in the first version of DAAD.') +
      `> _ _\n    PROCESS ${R.each_turn}\n> _ _\n    MINUS 5 1\n    MINUS 6 1\n    MINUS 7 1\n    MINUS 8 1\n> _ _\n    NOTZERO fDark\n    MINUS 9 1\n> _ _\n    NOTZERO fDark\n    ABSENT ${light}\n    MINUS 10 1\n` +
      `> _ _\n    PARSE 0${' '.repeat(16)}; ${T('si no se entiende la frase...', 'if the sentence is not understood...')}\n    PROCESS ${R.not_understood}\n    REDO\n` +
      `> _ _\n    EQ fTurns 255\n    PLUS fTurnsHi 1\n    CLEAR fTurns\n    SKIP 1\n> _ _\n    PLUS fTurns 1\n` +
      `> _ _\n    PROCESS ${R.responses}\n    ISDONE${' '.repeat(17)}; ${T('si alguna respuesta hizo algo, otra orden', 'if a response did something, next order')}\n    REDO\n` +
      `> _ _\n    MOVE fPlayer${' '.repeat(11)}; ${T('si no, las conexiones', 'if not, the connections')}\n    RESTART\n> _ _\n    NEWTEXT\n    LT fVerb 14\n    SYSMESS 7\n    REDO\n> _ _\n    SYSMESS 8\n    REDO\n` },
    { id: R.not_understood, source: head('La frase no se entiende (o se acabó el tiempo de espera).', 'The sentence is not understood (or the time ran out).') +
      '> _ _\n    HASAT TIMEOUT\n    SYSMESS 35\n    DONE\n> _ _\n    SYSMESS 6\n' },
    { id: R.after_describe, source: head('Proceso 1 del juego original: después de describir la localidad.', 'Process 1 of the original game: after describing the location.') + byId[R.after_describe].source },
    { id: R.each_turn, source: head('Proceso 2 del juego original: antes de cada orden.', 'Process 2 of the original game: before each order.') + byId[R.each_turn].source },
    { id: R.responses, source: head('Proceso 0 del juego original: las respuestas.', 'Process 0 of the original game: the responses.') + byId[R.responses].source },
    { id: R.init, source: head('Preparación de la partida, como en DAAD 1: borra las banderas 0 a 247 (las\nde arriba se conservan de una partida a otra) y pone los objetos en su sitio.',
      'Game setup, as in DAAD 1: clears flags 0 to 247 (the ones above are kept\nfrom one game to the next) and puts the objects in their places.') +
      `> _ _\n    LET 247 247\n> _ _\n    MINUS 247 1\n    CLEAR @247\n    NOTZERO 247\n    SKIP -1\n` +
      `> _ _\n    LET fGFlags 128\n    LET fMaxCarr 4\n    LET fStrength 10\n    LET fCPronounNoun 255\n    LET fCPronounAdject 255\n    RESET\n` },
    { id: D, source: head('Con luz: el dibujo y el texto de la localidad. La bandera 40 dice si la\nlocalidad tiene dibujo (255) o no (0).', 'With light: the picture and text of the location. Flag 40 tells whether\nthe location has a picture (255) or not (0).') +
      `> _ _\n    CLEAR 40\n    PICTURE @fPlayer\n    DISPLAY 0\n    LET 40 255\n> _ _\n    WINDOW 1\n    CLS\n    DESC @fPlayer\n` },
    { id: DARK, source: head('A oscuras: se borra el sitio del dibujo y sale el mensaje 0.', 'In the dark: the picture area is cleared and message 0 is shown.') +
      `> _ _\n    PICTURE @fPlayer\n    DISPLAY 1\n> _ _\n    WINDOW 1\n    CLS\n    SYSMESS 0\n    MINUS 4 1\n` },
    ...orig.filter((p) => !Object.values(names).includes(p.id)),
  ];
  return { ...imported, processes: procs, settings: { ...imported.settings } };
}

// Juegos de DAAD guardados como ficheros: discos de Atari ST (.st), Amiga
// (.adf), PC (.img o una carpeta en .zip) y MSX (disco de MSX-DOS), y el
// cartucho de MSX que hace Rocinante.
//
// En un disco, cada base de datos (.DDB) es una parte; los gráficos van en el
// fichero del mismo nombre: .DAT (imágenes de 16 colores del ST, el Amiga y
// el PC) o .MDG (dibujos vectoriales del MSX), y el juego de caracteres en
// .CHR. Las imágenes de 16 colores pasan a mapas de bits del Spectrum en el
// sitio que ocupaban, y la imagen original se guarda como maestra (la usan la
// página web y las exportaciones de 16 bits).
//
// Solo la versión 2 de DAAD está comprobada en estas máquinas; con la 1, el
// informe avisa de que es experimental.

import { readFAT12 } from '../disk/fat12.js';
import { readADF } from '../amiga/adf.js';
import { unzip } from '../disk/zip.js';
import { readDAT } from '../m68k/dat.js';
import { from9 } from '../m68k/m68kgfx.js';
import { readMDG, cartridgeMemory } from '../msx/mdgread.js';
import { convertToZX, resizeRGBA } from '../gfx/zxconvert.js';
import { encodePNG } from '../gfx/png.js';
import { readDDB } from '../daad/ddb.js';

const MACHINE = { 0: 'pc', 1: 'zx', 2: 'c64', 3: 'cpc', 4: 'msx', 5: 'st', 6: 'amiga' };
const BASE = { pc: 0, zx: 0x8400, c64: 0x3880, cpc: 0x2880, msx: 0x0100, st: 0, amiga: 0 };

// ¿Qué es el fichero? { kind: 'files', files: [{ name, data }], system } o
// { kind: 'msxrom', mem } o null (no es de estos)
export async function fileContainer(bytes, name = '') {
  const s = (o, n) => String.fromCharCode(...bytes.subarray(o, o + n));
  if (s(0, 3) === 'DOS' && bytes.length >= 880 * 1024) return { kind: 'files', files: readADF(bytes).map((f) => ({ name: f.path, data: f.data })), system: 'amiga' };
  if (s(0, 4) === 'PK\x03\x04' || /\.zip$/i.test(name)) return { kind: 'files', files: await unzip(bytes), system: 'zip' };
  if (bytes[0] === 0x41 && bytes[1] === 0x42 && /\.rom$/i.test(name)) {
    const mem = cartridgeMemory(bytes);
    return mem ? { kind: 'msxrom', mem } : null;
  }
  // FAT12 con su BPB: ST, PC o MSX
  const bps = bytes[11] | (bytes[12] << 8), spc = bytes[13], nf = bytes[16], total = bytes[19] | (bytes[20] << 8);
  if (bps === 512 && [1, 2, 4].includes(spc) && (nf === 1 || nf === 2) && total * 512 <= bytes.length + 512 && total >= 320) {
    try { return { kind: 'files', files: readFAT12(bytes), system: 'fat' }; } catch { /* no lo es */ }
  }
  return null;
}

const looksDDB = (d) => d.length > 64 && (d[0] === 1 || d[0] === 2) && d[2] === 95 && (d[1] & 15) <= 1;
const stem = (n) => n.replace(/\.[^./]*$/, '').toUpperCase();

// Las partes de un juego en una lista de ficheros: [{ label, ddb, dat, chr, mdg }]
export function findParts(files) {
  const ddbs = files.filter((f) => /\.ddb$/i.test(f.name) && looksDDB(f.data));
  const byStem = (st, ext) => files.find((f) => stem(f.name) === st && f.name.toUpperCase().endsWith(ext));
  const only = (ext) => { const l = files.filter((f) => f.name.toUpperCase().endsWith(ext)); return l.length === 1 ? l[0] : null; };
  return ddbs.sort((a, b) => a.name.localeCompare(b.name)).map((f) => {
    const st = stem(f.name);
    return {
      label: ddbs.length > 1 ? f.name.split('/').pop() : '', ddb: f.data,
      dat: (byStem(st, '.DAT') ?? only('.DAT'))?.data ?? null,
      chr: (byStem(st, '.CHR') ?? only('.CHR'))?.data ?? null,
      mdg: (byStem(st, '.MDG') ?? only('.MDG'))?.data ?? null,
    };
  });
}

// La base de datos de un .DDB: la máquina va en la cabecera; en el ST y el
// Amiga las palabras van con el byte alto primero (en el PC se prueba de las
// dos maneras)
export function readDDBFile(bytes) {
  const machine = MACHINE[bytes[1] >> 4] ?? 'pc';
  let base = BASE[machine];
  const big = machine === 'st' || machine === 'amiga';
  if (bytes[0] === 1) {
    // versión 1: las tablas empiezan justo tras la cabecera de 32 bytes
    const tryBase = (be) => {
      const w = (i) => (be ? (bytes[i] << 8) | bytes[i + 1] : bytes[i] | (bytes[i + 1] << 8));
      return Math.min(...Array.from({ length: 11 }, (_, i) => w(8 + 2 * i)).filter(Boolean)) - 32;
    };
    base = tryBase(big);
  }
  try { return { model: readDDB(bytes, base, big), machine }; } catch (e) {
    if (machine !== 'pc') throw e;
    return { model: readDDB(bytes, base, true), machine };
  }
}

// Juego de caracteres de un .CHR de 16 bits (128 bytes de cabecera y 2048 de
// letras, como el del Spectrum)
export function readCHR(chr) {
  return chr && chr.length >= 128 + 2048 ? chr.slice(128, 128 + 2048) : null;
}

const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

// Imágenes de un .DAT a dibujos del proyecto (mapas de bits del Spectrum con
// la maestra). La pantalla de 16 bits es de 320x200; lo que no cabe en la del
// Spectrum (256x192) se encoge. names(n) -> id del dibujo n.
export async function datPictures(dat, machine, names) {
  const images = readDAT(dat);
  const out = [];
  for (const im of images) {
    // colores: 3 bits por componente (en el Amiga pueden ser 4)
    const wide = machine === 'amiga' && im.palette.some((c) => (c & 0x888) !== 0);
    const pal = im.palette.map((c) => (wide ? [((c >> 8) & 15) * 17, ((c >> 4) & 15) * 17, (c & 15) * 17] : from9(c)));
    const sx = im.x + im.width > 256 ? 256 / 320 : 1, sy = im.y + im.height > 192 ? 192 / 200 : 1;
    const X0 = Math.floor(im.x * sx), Y0 = Math.floor(im.y * sy);
    const W = Math.max(1, Math.round(im.width * sx)), H = Math.max(1, Math.round(im.height * sy));
    const cx = Math.min(31, X0 >> 3), cy = Math.min(23, Y0 >> 3);
    const cw = Math.max(1, Math.min(32 - cx, Math.ceil((X0 + W) / 8) - cx)), ch = Math.max(1, Math.min(24 - cy, Math.ceil((Y0 + H) / 8) - cy));
    // la imagen en color, y en su rectángulo de cuadros (el resto en negro)
    let rgba = new Uint8ClampedArray(im.width * im.height * 4);
    for (let i = 0; i < im.pixels.length; i++) { const c = pal[im.pixels[i]] ?? [0, 0, 0]; rgba.set([c[0], c[1], c[2], 255], i * 4); }
    if (sx !== 1 || sy !== 1) rgba = resizeRGBA(rgba, im.width, im.height, W, H);
    const area = new Uint8ClampedArray(cw * 8 * ch * 8 * 4);
    for (let i = 3; i < area.length; i += 4) area[i] = 255;
    const indices = new Uint8Array(cw * 8 * ch * 8);
    const dx = X0 - cx * 8, dy = Y0 - cy * 8;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const tx = x + dx, ty = y + dy;
      if (tx >= cw * 8 || ty >= ch * 8) continue;
      const o = (ty * cw * 8 + tx) * 4, i = (y * W + x) * 4;
      area[o] = rgba[i]; area[o + 1] = rgba[i + 1]; area[o + 2] = rgba[i + 2];
      if (sx === 1 && sy === 1) indices[ty * cw * 8 + tx] = im.pixels[y * im.width + x];
    }
    const zx = convertToZX(area, cw, ch, { dither: true, allowBright: true, contrast: 1 });
    // la maestra: la imagen tal cual, de paleta, si no se ha encogido; si no,
    // la del rectángulo ya en color
    let master;
    if (sx === 1 && sy === 1) master = await encodePNG(cw * 8, ch * 8, indices, pal);
    else {
      // 256 colores como mucho en un PNG de paleta: se cuentan los que hay
      const colours = new Map(), idx = new Uint8Array(cw * 8 * ch * 8);
      let ok = true;
      for (let i = 0; i < idx.length && ok; i++) {
        const k = (area[i * 4] << 16) | (area[i * 4 + 1] << 8) | area[i * 4 + 2];
        if (!colours.has(k)) { if (colours.size === 256) { ok = false; break; } colours.set(k, colours.size); }
        idx[i] = colours.get(k);
      }
      master = ok ? await encodePNG(cw * 8, ch * 8, idx, [...colours.keys()].map((k) => [k >> 16, (k >> 8) & 255, k & 255])) : null;
    }
    out.push({
      id: names(im.n), number: im.n, location: true,
      zx: { cx, cy, cw, ch, pixels: b64(zx.pixels), attrs: b64(zx.attrs) },
      master, area: { cx, cy, cw, ch }, options: { dither: true, bright: true, contrast: 1 },
    });
  }
  return out;
}

// La base de gráficos de un .MDG suelto: acaba en B000h
export function readMDGFile(mdg) {
  if (!mdg || mdg.length > 0xb000) return null;
  const mem = new Uint8Array(65536);
  mem.set(mdg, 0xb000 - mdg.length);
  return readMDG(mem);
}

export { readMDG };

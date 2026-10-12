// Exportaciones: página web, Spectrum (.z80 48K y 128K), Amstrad CPC, Commodore 64,
// .DDB y proyecto.
import { writeDDB } from '../daad/ddb-write.js';
import { export128, export48 } from '../daad/export128.js';
import { snapshot48, snapshot128, defaultCharset } from '../spectrum/zxexport.js';
import { serializeModel } from '../player/run.js';
import { tape48, tape128, tapToTzx, tapToWav } from '../spectrum/zxtap.js';
import { exportCPC } from '../cpc/cpcexport.js';
import { cdtToWav } from '../cpc/cpctape.js';
import { exportC64 } from '../c64/c64export.js';
import { exportST, exportAmiga } from '../m68k/export16.js';
import { exportDOS } from '../dos/dosexport.js';
import { exportMSX } from '../msx/msxexport.js';
import { t, L } from '../i18n.js';
import LOGO from '../../docs/logo.svg';

/* global __PLAYER_JS__, __PAGE_HTML__, __SCREEN_CSS__ */

export function charsetOf(p) {
  const c = p.settings?.charset;
  return c ? Uint8Array.from(atob(c), (x) => x.charCodeAt(0)) : defaultCharset();
}
const b64 = (u) => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const fileBase = (p) => (p.meta.title || 'aventura').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toLowerCase() || 'aventura';

export function webPage(p, model) {
  const game = { id: fileBase(p), charset: b64(charsetOf(p)), model: serializeModel(model) };
  const json = JSON.stringify(game).replace(/</g, '\\u003c');
  // Los textos de la página van en el idioma del juego, no en el del editor
  const lang = model.language === 'en' ? 'en' : 'es';
  const T = (es, en) => L(lang, es, en);
  return __PAGE_HTML__
    .replace('__LANG__', lang)
    .replace('__RESTART__', T('Empezar de nuevo', 'Start again'))
    .replace('__HIRES__', T('Dibujos en alta resolución', 'High-resolution pictures'))
    .replace('__HINT__', T('Pulsa en la pantalla y escribe tus órdenes.', 'Click the screen and type your commands.'))
    .replace('__LOGO__', () => LOGO)
    .replace('__FOOTER__', T('Hecho con Rocinante, editor de aventuras conversacionales para DAAD.',
      'Made with Rocinante, a text adventure editor for DAAD.'))
    .replaceAll('__TITLE__', esc(p.meta.title))
    .replace('__AUTHOR__', esc(p.meta.author ? T('De ', 'By ') + p.meta.author : ''))
    .replace('__DESC__', esc(p.meta.description || ''))
    .replace('__SCREENCSS__', () => __SCREEN_CSS__)
    .replace('__GAME__', () => json)
    .replace('__PLAYER__', () => __PLAYER_JS__.replace(/<\/script/gi, '<\\/script'));
}

// Spectrum 128K: textos y mapas de bits en los bancos
// fmt: 'z80' (instantánea para emulador) o 'tap', 'tzx' o 'wav' (cinta, también
// para una máquina real)
export function zx128(p, model, fmt = 'z80') {
  const x = export128(model, { charset: charsetOf(p) });
  const file = fmt === 'z80' ? snapshot128(x.ddb, x.sdg, x.banks, model.language)
    : asTape(p, tape128(p.meta.title || 'aventura', x.ddb, x.sdg, x.banks, model.language), fmt);
  return { file, info: x };
}
// La cinta en el formato pedido: .tap, .tzx (con título y autor) o .wav
function asTape(p, tap, fmt) {
  if (fmt === 'tzx') return tapToTzx(tap, { title: p.meta.title, author: p.meta.author });
  if (fmt === 'wav') return tapToWav(tap);
  return tap;
}

// Spectrum 48K: todo en la memoria principal; los dibujos, mientras quepan
export function zx48(p, model, fmt = 'z80') {
  const x = export48(model, { charset: charsetOf(p) });
  if (x.free < 0) throw new Error(t('No cabe en 48K: faltan {n} bytes. Exporta para 128K.', { n: -x.free }));
  const file = fmt === 'z80' ? snapshot48(x.ddb, x.sdg, model.language) : asTape(p, tape48(p.meta.title || 'aventura', x.ddb, x.sdg, model.language), fmt);
  return { file, info: x };
}

export function ddbFile(model) { return writeDDB(model); }

// Amstrad CPC: disco (.dsk), cinta (.cdt), su audio (.wav) o la base de datos
// (.ddb, para 2880h). El juego de caracteres es el del proyecto si tiene uno
// propio; si no, el del intérprete de CPC.
export function cpc(p, model, fmt = 'dsk') {
  if (fmt === 'ddb') return { file: writeDDB(model, { machine: 'cpc' }), info: {} };
  const own = p.settings?.charset ? charsetOf(p) : null;
  const x = exportCPC(model, { charset: own, title: p.meta.title || '', author: p.meta.author || '' });
  const file = fmt === 'cdt' ? x.tape : fmt === 'wav' ? cdtToWav(x.tape) : x.dsk;
  return { file, info: x };
}

// Commodore 64: disco (.d64) o la base de datos (.ddb, para 3880h). El juego
// de caracteres es el del proyecto si tiene uno propio; si no, el del
// intérprete de C64. Las tramas de los dibujos salen del juego de caracteres
// con el que se pintan en el Spectrum.
export function c64(p, model, fmt = 'd64') {
  if (fmt === 'ddb') return { file: writeDDB(model, { machine: 'c64' }), info: {} };
  const own = p.settings?.charset ? charsetOf(p) : null;
  const x = exportC64(model, { charset: own, zxCharset: charsetOf(p), title: p.meta.title || '' });
  return { file: x.d64, info: x };
}

// Decodifica una maestra (data: URL) reducida a w x h puntos; RGBA o null
export function decodeMaster(url, w, h) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      resolve(g.getImageData(0, 0, w, h).data);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Atari ST: disco (.st) o la base de datos (.ddb, con el byte alto primero).
// Amiga: disco (.adf) o la base de datos. El juego de caracteres es el del
// proyecto o el de DAAD; los mapas de bits salen de la maestra si la hay.
export async function st(p, model, fmt = 'st') {
  if (fmt === 'ddb') return { file: writeDDB(model, { machine: 'st' }), info: {} };
  const x = await exportST(model, { charset: charsetOf(p), title: p.meta.title || '', decode: decodeMaster });
  return { file: x.st, info: x };
}
export async function amiga(p, model, fmt = 'adf') {
  if (fmt === 'ddb') return { file: writeDDB(model, { machine: 'amiga' }), info: {} };
  const x = await exportAmiga(model, { charset: charsetOf(p), title: p.meta.title || '', decode: decodeMaster });
  return { file: x.adf, info: x };
}

// PC (MS-DOS): carpeta para DOSBox (.zip), disquete de 1,44 MB (.img) o la
// base de datos (.ddb, con el byte bajo primero)
export async function dos(p, model, fmt = 'zip') {
  if (fmt === 'ddb') return { file: writeDDB(model, { machine: 'pc' }), info: {} };
  const x = await exportDOS(model, { charset: charsetOf(p), title: p.meta.title || '', decode: decodeMaster });
  return { file: fmt === 'img' ? x.img : x.zip, info: x };
}

// MSX: cartucho (.rom) o la base de datos (.ddb, colocada en 0100h). El juego
// de caracteres es el del proyecto (o el de DAAD), también para las tramas.
export function msx(p, model, fmt = 'rom') {
  if (fmt === 'ddb') return { file: writeDDB(model, { machine: 'msx' }), info: {} };
  const x = exportMSX(model, { charset: charsetOf(p) });
  return { file: x.rom, info: x };
}

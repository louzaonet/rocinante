// Exportación para Atari ST y Amiga: un disco que arranca solo el intérprete
// DAAD original (SDI1 en español, EDI1 en inglés) con la base de datos
// (PART1.DDB, palabras con el byte alto primero), los dibujos (PART1.DAT) y
// el juego de caracteres (PART1.CHR; el ST pide también PART1.CH0).
//   ST: .st de 720K; arranca solo con EmuTOS y con el TOS 1.04 o posterior
//   Amiga: .adf de 880K; la Startup-Sequence llama al intérprete

import { writeDDB } from '../daad/ddb-write.js';
import { ST_INTERPRETER, AMIGA_INTERPRETER, CHR_HEADER } from './m68kbase.js';
import { buildImages } from './m68kgfx.js';
import { buildDAT } from './dat.js';
import { writeST } from '../atari/stdisk.js';
import { desktopInf, emudeskInf } from '../atari/desktop.js';
import { writeADF } from '../amiga/adf.js';
import { defaultCharset } from '../spectrum/zxexport.js';
import { t } from '../i18n.js';

const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export function chrFile(charset) {
  const f = new Uint8Array(128 + 2048);
  f.set(fromB64(CHR_HEADER), 0);
  f.set(charset.subarray(0, 2048), 128);
  return f;
}

// Lo común (también para el PC): base de datos, dibujos y juego de caracteres
export async function parts(model, machine, { charset, decode }) {
  const ddb = writeDDB(model, { machine });
  if (ddb.length > 0xffff) throw new Error(t('La base de datos pasa de 64 KB: {n} bytes.', { n: ddb.length }));
  const cs = charset ?? defaultCharset();
  const pictures = Array.from({ length: (model.pictures || []).length }, (_, i) => model.pictures[i] || null);
  const { images, converted, skipped } = await buildImages(pictures, { charset: cs, decode });
  const dat = buildDAT(images, { pc: machine === 'pc' });
  return { ddb, dat, chr: chrFile(cs), converted, skipped };
}

const label = (title) => title.normalize('NFD').replace(/[^A-Za-z0-9 ]/g, '').trim().toUpperCase().slice(0, 11) || 'DAAD';
const diskFull = (e) => { if (e.message === 'disk-full') throw new Error(t('No cabe en el disco.')); throw e; };

// charset: el del proyecto (null = el de DAAD); decode(master, w, h): ver
// m68kgfx.js. Devuelve { st, ddb, dat, converted, skipped }
export async function exportST(model, { charset = null, title = '', decode = null } = {}) {
  const lang = model.language === 'en' ? 'en' : 'es';
  const p = await parts(model, 'st', { charset, decode });
  const prg = lang === 'en' ? 'EDI1.PRG' : 'SDI1.PRG';
  let st;
  try {
    st = writeST([
      { name: 'EMUDESK.INF', data: emudeskInf(prg) },
      { name: 'DESKTOP.INF', data: desktopInf(prg) },
      { name: prg, data: fromB64(ST_INTERPRETER[lang]) },
      { name: 'PART1.DDB', data: p.ddb },
      { name: 'PART1.DAT', data: p.dat },
      { name: 'PART1.CHR', data: p.chr },
      { name: 'PART1.CH0', data: p.chr },
    ], { label: label(title) });
  } catch (e) { diskFull(e); }
  return { st, ...p };
}

// Devuelve { adf, ddb, dat, converted, skipped }
export async function exportAmiga(model, { charset = null, title = '', decode = null } = {}) {
  const lang = model.language === 'en' ? 'en' : 'es';
  const p = await parts(model, 'amiga', { charset, decode });
  const prg = lang === 'en' ? 'edi1' : 'sdi1';
  let adf;
  try {
    adf = writeADF([
      { path: 's/startup-sequence', data: Uint8Array.from(prg + '\n', (c) => c.charCodeAt(0)) },
      { path: prg, data: fromB64(AMIGA_INTERPRETER[lang]) },
      { path: 'part1.ddb', data: p.ddb },
      { path: 'part1.dat', data: p.dat },
      { path: 'part1.chr', data: p.chr },
    ], { label: title.trim().slice(0, 30) || 'DAAD' });
  } catch (e) { diskFull(e); }
  return { adf, ...p };
}

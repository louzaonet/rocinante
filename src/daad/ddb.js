// Lectura de bases de datos DAAD (.DDB) al modelo del editor. La versión 2 es
// la de DAAD desde 1991; la 1, la de los primeros juegos (ver v1.js): sus
// condactos se traducen a los de la 2 y el modelo lleva ddb: 1.
//
// Formato (direcciones absolutas; en Spectrum la base está en 0x8400):
//   0  versión (2)            1  máquina<<4 | idioma (1 = español)
//   2  palabra nula (95)      3..7  nº objetos, localidades, mensajes,
//                                   mensajes del sistema, procesos
//   8  tabla de tokens        10 lista de procesos    12 textos de objetos
//   14 textos de localidades  16 mensajes             18 mensajes del sistema
//   20 conexiones             22 vocabulario          24 posición inicial obj.
//   26 nombre/adjetivo obj.   28 peso y atributos     30 atributos extra
//   32 longitud               34 13 vectores de EXTERN (26 bytes)
// Textos: cada byte XOR 0xFF, terminados en 0x0A. Códigos >= 128 son tokens.

import { t } from '../i18n.js';
import { daadToChar } from './charset.js';
import { CONDACTS, WORDTYPE } from './condacts.js';
import { condactV1, translateV1, helperV1, toOp } from './v1.js';

export const BASE = { zx: 0x8400 };

// big: palabras con el byte alto primero (Amiga y Atari ST)
export function readDDB(bytes, base = 0x8400, big = false) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // fuera de la base de datos se para (si no, un fichero que no lo es, con una
  // cabecera que lo parece, podía dejar al lector dando vueltas sin fin)
  const at = (addr) => {
    const i = addr - base;
    if (i < 0 || i >= b.length) throw new Error(t('La base de datos está dañada: apunta fuera de ella.'));
    return b[i];
  };
  const word = big ? (addr) => (at(addr) << 8) | at(addr + 1) : (addr) => at(addr) | (at(addr + 1) << 8);
  const hdr = big ? (off) => (b[off] << 8) | b[off + 1] : (off) => b[off] | (b[off + 1] << 8);

  const version = b[0];
  if (version !== 2 && version !== 1) throw new Error(t('Versión de DDB no soportada: {v}', { v: version }));
  const v1 = version === 1;
  const machine = b[1] >> 4, language = (b[1] & 15) === 1 ? 'es' : 'en';
  const nObj = b[3], nLoc = b[4], nMsg = b[5], nSys = b[6], nProc = b[7];
  const P = {
    tokens: hdr(8), procs: hdr(10), otx: hdr(12), ltx: hdr(14), mtx: hdr(16),
    stx: hdr(18), con: hdr(20), voc: hdr(22), objInit: hdr(24), objNames: hdr(26),
    objAttr: hdr(28), objExtra: v1 ? 0 : hdr(30), length: v1 ? hdr(30) : hdr(32),
  };

  // Tokens: cada uno termina en el byte con el bit 7 puesto.
  const tokens = [];
  if (P.tokens) {
    let a = P.tokens;
    // El intérprete busca el token N saltando N terminadores; leemos 129
    // posibles entradas (códigos 127..255).
    for (let i = 0; i < 129; i++) {
      let s = '';
      for (;;) {
        const c = at(a++);
        s += daadToChar(c & 0x7f);
        if (c & 0x80) break;
      }
      tokens.push(s);
    }
  }

  function text(addr) {
    let s = '';
    for (;;) {
      const c = at(addr++) ^ 0xff;
      if (c === 0x0a) break;
      if (c >= 128 && tokens.length) s += tokens[c - 127];
      else s += daadToChar(c);
    }
    return s;
  }
  const table = (ptr, n) => Array.from({ length: n }, (_, i) => text(word(ptr + 2 * i)));

  const vocab = [];
  for (let a = P.voc; at(a) !== 0; a += 7) {
    let w = '';
    for (let i = 0; i < 5; i++) w += daadToChar(at(a + i) ^ 0xff);
    vocab.push({ word: w.trimEnd(), value: at(a + 5), type: WORDTYPE[at(a + 6)] });
  }

  const con = [];
  for (let l = 0; l < nLoc; l++) {
    const list = [];
    for (let a = word(P.con + 2 * l); at(a) !== 0xff; a += 2) list.push({ verb: at(a), loc: at(a + 1) });
    con.push(list);
  }

  const objs = [];
  for (let o = 0; o < nObj; o++) {
    const attr = at(P.objAttr + o);
    objs.push({
      noun: at(P.objNames + 2 * o), adj: at(P.objNames + 2 * o + 1),
      loc: at(P.objInit + o),
      weight: attr & 0x3f, container: !!(attr & 0x40), wearable: !!(attr & 0x80),
      attrs: P.objExtra ? word(P.objExtra + 2 * o) : 0,
    });
  }

  // Versión 1: procesos auxiliares que hacen falta para traducir condactos
  const helpers = new Map(), dropped = new Map();
  const helper = (name) => {
    if (!helpers.has(name)) helpers.set(name, nProc + helpers.size);
    return helpers.get(name);
  };
  const note = (name) => dropped.set(name, (dropped.get(name) || 0) + 1);
  const procs = [];
  for (let p = 0; p < nProc; p++) {
    const entries = [];
    for (let a = word(P.procs + 2 * p); at(a) !== 0; a += 4) {
      entries.push({ verb: at(a), noun: at(a + 1), condacts: readCondacts(word(a + 2)) });
    }
    procs.push(entries);
  }
  function readCondacts(a) {
    const list = [];
    for (;;) {
      const op = at(a++);
      if (op === 0xff) break;
      const c = v1 ? condactV1(op & 0x7f) : CONDACTS[op & 0x7f];
      if (!c) throw new Error(t('Condacto desconocido ({op}) en {addr}.', { op, addr: (a - 1).toString(16) }));
      const args = [];
      for (let i = 0; i < c.params; i++) args.push(at(a++));
      if (v1) {
        list.push(...translateV1(c.name, args, !!(op & 0x80), helper, note).map(toOp));
        if (['DONE', 'OK', 'NOTDONE', 'REDO', 'DESC', 'END'].includes(c.name)) break;
        continue;
      }
      const ca = { op: op & 0x7f, args };
      if (op & 0x80) ca.ind = true;
      list.push(ca);
      // DRC omite el 0xFF tras condactos que siempre salen de la entrada
      if ([22, 23, 103, 116, 117, 108].includes(op & 0x7f)) break;
    }
    return list;
  }
  for (const [name] of helpers) {
    procs.push(helperV1(name, objs).map((e) => ({ ...e, condacts: e.condacts.map(toOp) })));
  }

  const externs = v1 ? [] : Array.from({ length: 13 }, (_, i) => hdr(34 + 2 * i));

  return {
    format: 'daad-model', version: 1,
    language, machine,
    vocab,
    sysmsgs: table(P.stx, nSys),
    msgs: table(P.mtx, nMsg),
    ltx: table(P.ltx, nLoc),
    otx: table(P.otx, nObj),
    con, objs, procs,
    tokens: tokens.length ? tokens.slice(1) : null,
    externs,
    ...(v1 ? { ddb: 1, helpers: [...helpers.keys()], dropped: Object.fromEntries(dropped) } : {}),
  };
}

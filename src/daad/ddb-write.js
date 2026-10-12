// Escritura de bases de datos DAAD (.DDB, versión 2) a partir del modelo.
// Implementación propia a partir de la descripción del formato (ver ddb.js).
//
// Compresión: elegimos nuestros propios tokens (hasta 128) con un algoritmo
// voraz sobre los textos reales del juego. Los textos de objetos no se
// comprimen porque el intérprete los recorre byte a byte para "_" y "@".

import { charToDaad } from './charset.js';
import { CONDACTS, WORDTYPE } from './condacts.js';

const MACHINE = { pc: 0, zx: 1, c64: 2, cpc: 3, msx: 4, st: 5, amiga: 6, pcw: 7 };
// Dirección donde carga cada intérprete la base de datos
export const DDB_BASE = { pc: 0, zx: 0x8400, c64: 0x3880, cpc: 0x2880, msx: 0x0100, st: 0, amiga: 0, pcw: 0x0100 };
// Máquinas de 16 bits: el 68000 (Amiga y ST) lee las palabras con el byte alto
// primero; en las tres, las tablas de palabras y todo lo que se apunta desde
// ellas empieza en dirección par (el 68000 no lee palabras en direcciones
// impares).
const BIG_ENDIAN = new Set(['st', 'amiga']);
const ALIGNED = new Set(['pc', 'st', 'amiga']);
const EXITS = new Set([22, 23, 103, 116, 117, 108]);   // DONE OK NOTDONE SKIP RESTART REDO

export function writeDDB(model, opts = {}) {
  const base = opts.base ?? DDB_BASE[opts.machine ?? 'zx'];
  const machine = MACHINE[opts.machine ?? 'zx'];
  const big = BIG_ENDIAN.has(opts.machine), aligned = ALIGNED.has(opts.machine);
  const out = [];
  const addr = () => base + out.length;
  const byte = (v) => out.push(v & 255);
  const word = (v) => { if (big) out.push((v >> 8) & 255, v & 255); else out.push(v & 255, (v >> 8) & 255); };
  const patch = (off, v) => { if (big) { out[off] = (v >> 8) & 255; out[off + 1] = v & 255; } else { out[off] = v & 255; out[off + 1] = (v >> 8) & 255; } };
  const align = () => { if (aligned && (addr() & 1)) out.push(0); };

  // Textos a bytes DAAD
  const enc = (t) => Array.from(t, charToDaad);
  const stx = model.sysmsgs.map(enc), mtx = model.msgs.map(enc);
  const ltx = model.ltx.map(enc), otx = model.otx.map(enc);
  const xmes = (model.xmsgs || []).map(enc);

  let tokens = null;
  if (opts.compress !== false) {
    tokens = opts.tokens ?? chooseTokens([...stx, ...mtx, ...ltx, ...xmes], opts.maxTokens ?? 128);
    const tk = tokens.map(enc);
    for (const list of [stx, mtx, ltx, xmes]) list.forEach((t, i) => { list[i] = applyTokens(t, tk); });
  }

  // --- cabecera
  byte(2);
  byte((machine << 4) | (model.language === 'es' ? 1 : 0));
  byte(95);
  byte(model.objs.length); byte(model.ltx.length); byte(model.msgs.length);
  byte(model.sysmsgs.length); byte(model.procs.length);
  for (let i = 0; i < 13; i++) word(0);          // punteros, se rellenan al final
  const externs = model.externs ?? [];
  for (let i = 0; i < 13; i++) word(0);          // vectores EXTERN
  const P = {};

  // --- código externo (EXTERN), justo tras la cabecera
  if (opts.externCode) {
    P.extern = addr();
    for (const b of opts.externCode) byte(b);
  }
  align();

  // --- textos de objetos (sin comprimir)
  const texts = (list) => {
    const offs = list.map((t) => { align(); const a = addr(); for (const c of t) byte(c ^ 0xff); byte(0x0a ^ 0xff); return a; });
    align();
    const table = addr();
    for (const a of offs) word(a);
    align();
    return table;
  };
  P.otx = texts(otx);

  P.objNames = addr();
  for (const o of model.objs) { byte(o.noun); byte(o.adj); }
  P.objAttr = addr();
  for (const o of model.objs) byte((o.weight & 0x3f) | (o.container ? 0x40 : 0) | (o.wearable ? 0x80 : 0));
  align();
  P.objExtra = addr();
  for (const o of model.objs) word(o.attrs ?? 0);
  P.objInit = addr();
  for (const o of model.objs) byte(o.loc);
  byte(0xff);
  align();

  // --- vocabulario
  P.voc = addr();
  for (const w of model.vocab) {
    const chars = Array.from(w.word.toUpperCase().padEnd(5).slice(0, 5), (ch) => vocChar(ch));
    for (const c of chars) byte(c ^ 0xff);
    byte(w.value);
    byte(WORDTYPE.indexOf(w.type));
  }
  byte(0);
  align();

  // --- tokens: el primero es un relleno que nunca se usa (código 127)
  P.tokens = 0;
  if (tokens) {
    P.tokens = addr();
    byte(0x80);
    for (const t of tokens) {
      const b = enc(t);
      b.forEach((c, i) => byte(i === b.length - 1 ? c | 0x80 : c));
    }
    align();
  }

  P.stx = texts(stx);
  P.mtx = texts(mtx);
  P.ltx = texts(ltx);

  // --- conexiones
  const conOffs = model.ltx.map((_, l) => {
    align();
    const a = addr();
    for (const c of model.con[l] || []) { byte(c.verb); byte(c.loc); }
    byte(0xff);
    return a;
  });
  align();
  P.con = addr();
  for (const a of conOffs) word(a);
  align();

  // --- procesos: primero los condactos de cada entrada, luego las tablas
  const entryOffs = model.procs.map((entries) => entries.map((e) => {
    align();
    const a = addr();
    let exited = false;
    for (const ca of e.condacts) {
      const c = CONDACTS[ca.op];
      byte(ca.op | (ca.ind ? 0x80 : 0));
      for (let i = 0; i < c.params; i++) byte(ca.args[i] ?? 0);
      if (EXITS.has(ca.op)) { exited = true; break; }
    }
    if (!exited) byte(0xff);
    return a;
  }));
  align();
  const procOffs = model.procs.map((entries, p) => {
    const a = addr();
    entries.forEach((e, i) => { byte(e.verb); byte(e.noun); word(entryOffs[p][i]); });
    byte(0);
    align();
    return a;
  });
  align();
  P.procs = addr();
  for (const a of procOffs) word(a);

  P.length = addr();

  // --- punteros de la cabecera
  [P.tokens, P.procs, P.otx, P.ltx, P.mtx, P.stx, P.con, P.voc, P.objInit, P.objNames, P.objAttr, P.objExtra, P.length]
    .forEach((v, i) => patch(8 + 2 * i, v));
  for (let i = 0; i < 13; i++) {
    const v = i === 0 && P.extern ? P.extern : (externs[i] || 0);
    patch(34 + 2 * i, v);
  }
  return Uint8Array.from(out);
}

// En el vocabulario las letras españolas van en mayúscula (ñ -> Ñ...)
function vocChar(ch) {
  const c = charToDaad(ch);
  if (c >= 0x1a && c < 0x20) return c | 1;
  return c;
}

// Sustituye en t (array de códigos) los tokens tk (arrays), voraz por
// orden de la lista; el token i se codifica como 128 + i.
export function applyTokens(t, tk) {
  let cur = t;
  tk.forEach((tok, ti) => {
    const code = 128 + ti;
    const r = [];
    for (let i = 0; i < cur.length;) {
      if (cur[i] === tok[0] && matchAt(cur, i, tok)) { r.push(code); i += tok.length; }
      else r.push(cur[i++]);
    }
    cur = r;
  });
  return cur;
}
function matchAt(a, i, b) {
  if (i + b.length > a.length) return false;
  for (let k = 0; k < b.length; k++) if (a[i + k] !== b[k]) return false;
  return true;
}

// Elige hasta n tokens que más bytes ahorren. Los textos se van reescribiendo
// con cada token elegido para que los siguientes cuenten sobre lo que queda.
// Un token no puede contener _ ni @ (el intérprete los busca en el texto) ni
// códigos de control.
export function chooseTokens(texts, n = 128, maxLen = 10) {
  const usable = (c) => c >= 32 && c < 128 && c !== 0x5f && c !== 0x40 || (c >= 16 && c < 32) || c === 13;
  let cur = texts.map((t) => t.slice());
  const chosen = [];
  for (let k = 0; k < n; k++) {
    const counts = new Map();
    for (const t of cur) {
      for (let i = 0; i < t.length; i++) {
        let key = '';
        for (let L = 1; L <= maxLen && i + L <= t.length; L++) {
          const c = t[i + L - 1];
          if (c >= 128 || !usable(c)) break;
          key += String.fromCharCode(c);
          if (L >= 2) counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    }
    let best = null, bestScore = 0;
    for (const [key, cnt] of counts) {
      // ahorro aproximado: cada aparición ahorra L-1 bytes; guardar el token cuesta L
      const score = (key.length - 1) * cnt - key.length;
      if (score > bestScore) { bestScore = score; best = key; }
    }
    if (!best) break;
    const code = 128 + k;
    const tok = Array.from(best, (ch) => ch.charCodeAt(0));
    cur = cur.map((t) => {
      const r = [];
      for (let i = 0; i < t.length;) {
        if (t[i] === tok[0] && matchAt(t, i, tok)) { r.push(code); i += tok.length; }
        else r.push(t[i++]);
      }
      return r;
    });
    chosen.push(tok);
  }
  // Los tokens se devuelven como texto del modelo
  return chosen.map((tok) => tok.map((c) => {
    if (c >= 16 && c < 32) return 'ª¡¿«»áéíóúñÑçÇüÜ'[c - 16];
    if (c === 13) return '\n';
    return String.fromCharCode(c);
  }).join(''));
}

// Compilador de proyectos de Rocinante al modelo DAAD (el que entienden el motor
// y el generador de DDB).
//
// Un proyecto usa nombres en lugar de números: localidades, objetos, mensajes,
// banderas y procesos se identifican por su "id". Los procesos se escriben en
// texto, con una sintaxis parecida a la de los .DSF de DRC:
//
//   ; comentario
//   > COGER LIBRO          ; entrada: verbo y nombre (o _)
//       AT biblioteca      ; condactos, uno por línea
//       MESSAGE "Pesa."    ; un texto entre comillas crea un mensaje
//       GET libro
//       DONE
//   $fin                   ; etiqueta para SKIP
//
// Indirección: @bandera o [bandera] en el primer parámetro.

import { BY_NAME, CONDACTS } from '../daad/condacts.js';
import { SYSTEM_FLAGS, CONSTANTS, SPECIAL_LOCS, FIRST_USER_FLAG } from './symbols.js';
import { vocabKey } from '../daad/engine.js';
import { t } from '../i18n.js';

const TYPE_NAMES = { verb: 'verbo', noun: 'nombre', adjective: 'adjetivo', adverb: 'adverbio', preposition: 'preposición', conjunction: 'conjunción', pronoun: 'pronombre' };

// Texto del proyecto -> texto del modelo (secuencias #b #k #g #t #s ##)
export function textIn(t) {
  return (t ?? '').replace(/\r\n?/g, '\n').replace(/#([bkgtsfn#])/g, (_, c) =>
    ({ b: '\x0b', k: '\x0c', g: '\x0e', t: '\x0f', s: ' ', f: ' ', n: '\n', '#': '#' })[c]);
}
export function textOut(t) {
  return (t ?? '').replace(/#/g, '##').replace(/[\x0b\x0c\x0e\x0f ]/g, (c) =>
    ({ '\x0b': '#b', '\x0c': '#k', '\x0e': '#g', '\x0f': '#t', ' ': '#f' })[c]);
}

export function compileProject(p) {
  const errors = [];
  const warn = [];
  const err = (where, msg) => errors.push({ ...where, msg });

  // --- índices de nombres
  const index = (list, kind) => {
    const m = new Map();
    list.forEach((x, i) => {
      if (!x.id) return;
      if (m.has(x.id)) err({ kind, id: x.id }, t('Nombre repetido: {id}', { id: x.id }));
      m.set(x.id, i);
    });
    return m;
  };
  const locIx = index(p.locations, 'location');
  const objIx = index(p.objects, 'object');
  const msgIx = index(p.messages, 'message');
  const procIx = index(p.processes, 'process');
  const flagIx = new Map(Object.entries(SYSTEM_FLAGS));
  let nextFlag = FIRST_USER_FLAG;
  for (const f of p.flags || []) {
    const n = f.num ?? nextFlag;
    nextFlag = Math.max(nextFlag, n + 1);
    flagIx.set(f.name, n);
  }
  const defines = new Map(Object.entries(CONSTANTS));
  for (const d of p.defines || []) defines.set(d.name, d.value);

  // --- vocabulario
  const vocab = (p.vocab || []).map((w) => ({ word: vocabKey(w.word), value: w.value, type: w.type }));
  const vmap = new Map();
  for (const w of vocab) {
    if (vmap.has(w.word)) err({ kind: 'vocab', id: w.word }, t('Palabra repetida: {w}', { w: w.word }));
    vmap.set(w.word, w);
  }
  const word = (tok, types, where) => {
    if (tok === '_' || tok === undefined) return 255;
    if (/^\d+$/.test(tok)) return +tok;
    const w = vmap.get(vocabKey(tok));
    if (!w) { err(where, t('Palabra que no está en el vocabulario: {w}', { w: tok })); return 255; }
    if (!types.includes(w.type) && !(types.includes('verb') && w.type === 'noun' && w.value < 40)) {
      err(where, t('{w} es {type}, no {types}', { w: tok, type: t(TYPE_NAMES[w.type] || w.type), types: types.map((x) => t(TYPE_NAMES[x] || x)).join(t(' ni ')) }));
    }
    return w.value;
  };

  // --- localidades y conexiones
  const ltx = p.locations.map((l) => textIn(l.text));
  const con = p.locations.map((l, i) => (l.exits || []).filter((e) => e.word && e.to !== undefined && e.to !== '').map((e) => {
    const where = { kind: 'location', id: l.id };
    const to = typeof e.to === 'number' ? e.to : locIx.get(e.to);
    if (to === undefined) err(where, t('Salida {w} a una localidad que no existe: {to}', { w: e.word, to: e.to }));
    return { verb: word(e.word, ['verb'], where), loc: to ?? 0 };
  }));

  // --- objetos
  const locValue = (v, where, allowSpecial = true) => {
    if (typeof v === 'number') return v;
    if (allowSpecial && v in SPECIAL_LOCS) return SPECIAL_LOCS[v];
    if (locIx.has(v)) return locIx.get(v);
    if (objIx.has(v)) return objIx.get(v);           // dentro de un contenedor
    if (/^\d+$/.test(v)) return +v;
    err(where, t('Localidad desconocida: {v}', { v }));
    return 252;
  };
  const otx = p.objects.map((o) => textIn(o.text));
  const objs = p.objects.map((o) => {
    const where = { kind: 'object', id: o.id };
    return {
      noun: word(o.noun, ['noun'], where), adj: word(o.adj, ['adjective'], where),
      loc: locValue(o.loc ?? 'NOTCREATED', where),
      weight: Math.max(0, Math.min(63, o.weight ?? 1)),
      container: !!o.container, wearable: !!o.wearable, attrs: o.attrs ?? 0,
    };
  });
  objs.forEach((o, i) => {
    if (o.container && i < ltx.length && ltx[i]) {
      warn.push({ kind: 'object', id: p.objects[i].id, msg: t('El contenedor {id} guarda sus objetos en la localidad {n}, que es una localidad con texto.', { id: p.objects[i].id, n: i }) });
    }
  });

  // --- mensajes (los textos entre comillas de los procesos se añaden al final)
  const msgs = p.messages.map((m) => textIn(m.text));
  const inline = new Map();
  const inlineMsg = (text) => {
    const t = textIn(text);
    if (inline.has(t)) return inline.get(t);
    const n = msgs.length;
    msgs.push(t);
    inline.set(t, n);
    return n;
  };
  const sysmsgs = (p.sysmsgs || []).map(textIn);
  const inlineSys = (text) => { sysmsgs.push(textIn(text)); return sysmsgs.length - 1; };

  // --- procesos (se compilan al final, cuando ya se conocen los dibujos)
  let procs;

  function compileProcess(pr) {
    const entries = [];
    const labels = new Map();
    const pendingSkips = [];
    const lines = (pr.source || '').split('\n');
    let cur = null;
    lines.forEach((raw, li) => {
      const where = { kind: 'process', id: pr.id, line: li + 1 };
      const toks = tokenize(raw, where);
      if (!toks.length) return;
      if (toks[0].startsWith('$') && toks.length === 1) { labels.set(toks[0], entries.length); return; }
      let rest = toks;
      if (toks[0] === '>' || toks[0].startsWith('>')) {
        if (toks[0] !== '>') rest = [toks[0].slice(1), ...toks.slice(1)]; else rest = toks.slice(1);
        cur = { verb: word(rest[0], ['verb'], where), noun: word(rest[1], ['noun'], where), condacts: [] };
        entries.push(cur);
        rest = rest.slice(2);
        if (!rest.length) return;
      }
      if (!cur) { err(where, t('Condacto fuera de una entrada (falta una línea que empiece por >)')); return; }
      const name = rest[0].toUpperCase();
      const c = BY_NAME[name];
      if (!c) { err(where, t('Condacto desconocido: {c}', { c: rest[0] })); return; }
      const args = rest.slice(1);
      if (args.length !== c.params) { err(where, (c.params === 1 ? t('{c} lleva 1 parámetro', { c: name }) : t('{c} lleva {n} parámetros', { c: name, n: c.params }))); return; }
      const ca = { op: c.code, args: [] };
      args.forEach((a, i) => {
        let tok = a;
        if (i === 0 && (tok.startsWith('@') || (tok.startsWith('[') && tok.endsWith(']')))) {
          ca.ind = true;
          tok = tok.startsWith('@') ? tok.slice(1) : tok.slice(1, -1);
          ca.args.push(flag(tok, where));
          return;
        }
        if (c.types[i] === 'skip' && tok.startsWith('$')) {
          ca.args.push(0);
          pendingSkips.push({ ca, label: tok, from: entries.length - 1, where });
          return;
        }
        ca.args.push(param(c.types[i], tok, where));
      });
      cur.condacts.push(ca);
    });
    for (const s of pendingSkips) {
      if (!labels.has(s.label)) { err(s.where, t('Etiqueta desconocida: {l}', { l: s.label })); continue; }
      const d = labels.get(s.label) - s.from - 1;
      if (d < -128 || d > 127) err(s.where, t('Salto demasiado largo'));
      s.ca.args[0] = d & 255;
    }
    return entries;
  }

  function flag(tok, where) {
    if (/^\d+$/.test(tok)) return +tok;
    if (flagIx.has(tok)) return flagIx.get(tok);
    if (defines.has(tok)) return defines.get(tok);
    err(where, t('Bandera desconocida: {v}', { v: tok }));
    return 0;
  }
  function num(tok, where) {
    if (/^-?\d+$/.test(tok)) return (+tok) & 255;
    if (defines.has(tok)) return defines.get(tok);
    if (flagIx.has(tok)) return flagIx.get(tok);
    err(where, t('Se esperaba un número: {v}', { v: tok }));
    return 0;
  }
  function param(type, tok, where) {
    const quoted = tok.startsWith('"');
    const str = quoted ? tok.slice(1, -1).replace(/\\"/g, '"') : null;
    switch (type) {
      case 'loc': case 'loc+':
        if (/^\d+$/.test(tok)) return +tok;
        if (defines.has(tok)) return defines.get(tok);
        return locValue(tok, where, type === 'loc+');
      case 'obj':
        if (/^\d+$/.test(tok)) return +tok;
        if (objIx.has(tok)) return objIx.get(tok);
        if (defines.has(tok)) return defines.get(tok);
        err(where, t('Objeto desconocido: {v}', { v: tok })); return 0;
      case 'flag': return flag(tok, where);
      case 'msg':
        if (quoted) return inlineMsg(str);
        if (/^\d+$/.test(tok)) return +tok;
        if (msgIx.has(tok)) return msgIx.get(tok);
        err(where, t('Mensaje desconocido: {v}', { v: tok })); return 0;
      case 'sys':
        if (quoted) return inlineSys(str);
        return num(tok, where);
      case 'proc':
        if (/^\d+$/.test(tok)) return +tok;
        if (procIx.has(tok)) return procIx.get(tok);
        err(where, t('Proceso desconocido: {v}', { v: tok })); return 0;
      case 'verb': return word(tok, ['verb'], where);
      case 'noun': return word(tok, ['noun'], where);
      case 'adj': return word(tok, ['adjective'], where);
      case 'adv': return word(tok, ['adverb'], where);
      case 'prep': return word(tok, ['preposition'], where);
      default: return num(tok, where);
    }
  }

  procs = p.processes.map((pr) => compileProcess(pr));
  if (msgs.length > 255) err({ kind: 'message' }, t('Demasiados mensajes ({n}, máximo 255)', { n: msgs.length }));
  if (ltx.length > 252) err({ kind: 'location' }, t('Demasiadas localidades (máximo 252)'));
  if (objs.length > 255) err({ kind: 'object' }, t('Demasiados objetos (máximo 255)'));

  // --- dibujos: el de cada localidad lleva su número; los que tienen número
  // propio (subdibujos vectoriales, que se llaman con GOSUB n), ese; los demás, detrás
  const { slots, picNum } = numberPictures(p, (k, id, msg) => err({ kind: k, id }, msg));
  const pictures = slots.map((pic) => pic && modelPicture(pic));
  for (const [id, n] of picNum) if (!defines.has(id)) defines.set(id, n);

  const model = {
    format: 'daad-model', version: 1, language: p.meta?.language ?? 'es', machine: 1,
    vocab, sysmsgs, msgs, ltx, otx, con, objs, procs, tokens: null, externs: Array(13).fill(0),
    pictures,
  };
  return { model, errors, warnings: warn };
}

// Número de cada dibujo: el de cada localidad lleva su número; los que tienen
// número propio (subdibujos vectoriales, que se llaman con GOSUB n), ese; los
// demás, detrás. slots: dibujo del proyecto por número; picNum: id -> número.
export function numberPictures(p, onError = () => {}) {
  const slots = [];
  const picNum = new Map();
  for (const pic of p.pictures || []) {
    if (!Number.isInteger(pic.number)) continue;
    if (pic.number < 0 || pic.number > 255) { onError('picture', pic.id, t('Número de dibujo fuera de rango: {n}', { n: pic.number })); continue; }
    slots[pic.number] = pic;
    picNum.set(pic.id, pic.number);
  }
  p.locations.forEach((l, i) => {
    if (!l.picture) return;
    const pic = (p.pictures || []).find((x) => x.id === l.picture);
    if (!pic) { onError('location', l.id, t('Dibujo desconocido: {v}', { v: l.picture })); return; }
    if (slots[i] && slots[i].id !== pic.id) { onError('location', l.id, t('El dibujo {a} tiene el número {n}, que es el de esta localidad', { a: slots[i].id, n: i })); return; }
    slots[i] = pic;
    if (!picNum.has(pic.id)) picNum.set(pic.id, i);
  });
  for (const pic of p.pictures || []) {
    if (picNum.has(pic.id)) continue;
    const n = Math.max(slots.length, p.locations.length);
    slots[n] = pic;
    picNum.set(pic.id, n);
  }
  return { slots, picNum };
}

const fromB64 = (s) => (typeof s === 'string' ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : s);
function modelPicture(pic) {
  return {
    id: pic.id, location: pic.location !== false,
    line: pic.line ?? 0, col: pic.col ?? 0, height: pic.height ?? 12, width: pic.width ?? 42,
    paper: pic.paper ?? 0, ink: pic.ink ?? 7,
    zx: pic.zx ? { cx: pic.zx.cx, cy: pic.zx.cy, cw: pic.zx.cw, ch: pic.zx.ch, pixels: fromB64(pic.zx.pixels), attrs: fromB64(pic.zx.attrs) } : null,
    drawstring: pic.drawstring ?? null,
    master: pic.master ?? null,
  };
}

// Separa una línea en piezas: palabras, cadenas entre comillas, comentarios fuera.
export function tokenize(line, where) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === ';') break;
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if (ch === '"') {
      let j = i + 1;
      while (j < line.length && !(line[j] === '"' && line[j - 1] !== '\\')) j++;
      out.push(line.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < line.length && line[j] !== ' ' && line[j] !== '\t' && line[j] !== ';') j++;
    out.push(line.slice(i, j));
    i = j;
  }
  return out;
}

export { CONDACTS };

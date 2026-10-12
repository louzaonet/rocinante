// Importación de juegos hechos con PAW (Professional Adventure Writer) desde
// una instantánea de Spectrum 48K.
//
// La base de datos de PAW acaba en la parte alta de la memoria con una tabla de
// punteros (FFD9h...) y los contadores en FFF7h. Los textos van con XOR FFh,
// terminan en 1Fh y los códigos desde 164 son tokens; la tabla de tokens está
// justo detrás del juego de caracteres (CHARS + 401h).
//
// PAW lleva el bucle del juego dentro del intérprete y DAAD lo lleva en la base
// de datos, así que el proyecto resultante usa la plantilla de Rocinante y mete
// las tablas de PAW en ella: la de respuestas (proceso 0 de PAW) en
// "respuestas", el proceso 1 en "tras_describir" y el 2 en "cada_turno".

import { readSnapshot } from '../spectrum/z80read.js';
import { newProject, PROC_ROLES } from '../project/template.js';
import { t } from '../i18n.js';
import { decompileModel } from '../project/decompile.js';
import { Painter, OffScreen } from '../gfx/drawstring.js';
import { opLen } from '../gfx/vector.js';
import { defaultCharset, fitFont42 } from '../spectrum/zxexport.js';
import { charToDaad, ES as DAAD_ES } from '../daad/charset.js';

// Condactos de PAW: nombre y número de parámetros
const PAW = [['AT', 1], ['NOTAT', 1], ['ATGT', 1], ['ATLT', 1], ['PRESENT', 1], ['ABSENT', 1], ['WORN', 1], ['NOTWORN', 1],
  ['CARRIED', 1], ['NOTCARR', 1], ['CHANCE', 1], ['ZERO', 1], ['NOTZERO', 1], ['EQ', 2], ['GT', 2], ['LT', 2],
  ['ADJECT1', 1], ['ADVERB', 1], ['INVEN', 0], ['DESC', 0], ['QUIT', 0], ['END', 0], ['DONE', 0], ['OK', 0],
  ['ANYKEY', 0], ['SAVE', 0], ['LOAD', 0], ['TURNS', 0], ['SCORE', 0], ['CLS', 0], ['DROPALL', 0], ['AUTOG', 0],
  ['AUTOD', 0], ['AUTOW', 0], ['AUTOR', 0], ['PAUSE', 1], ['TIMEOUT', 0], ['GOTO', 1], ['MESSAGE', 1], ['REMOVE', 1],
  ['GET', 1], ['DROP', 1], ['WEAR', 1], ['DESTROY', 1], ['CREATE', 1], ['SWAP', 2], ['PLACE', 2], ['SET', 1],
  ['CLEAR', 1], ['PLUS', 2], ['MINUS', 2], ['LET', 2], ['NEWLINE', 0], ['PRINT', 1], ['SYSMESS', 1], ['ISAT', 2],
  ['COPYOF', 2], ['COPYOO', 2], ['COPYFO', 2], ['COPYFF', 2], ['LISTOBJ', 0], ['EXTERN', 1], ['RAMSAVE', 0],
  ['RAMLOAD', 1], ['BEEP', 2], ['PAPER', 1], ['INK', 1], ['BORDER', 1], ['PREP', 1], ['NOUN2', 1], ['ADJECT2', 1],
  ['ADD', 2], ['SUB', 2], ['PARSE', 0], ['LISTAT', 1], ['PROCESS', 1], ['SAME', 2], ['MES', 1], ['CHARSET', 1],
  ['NOTEQ', 2], ['NOTSAME', 2], ['MODE', 2], ['LINE', 1], ['TIME', 2], ['PICTURE', 1], ['DOALL', 1], ['PROMPT', 1],
  ['GRAPHIC', 1], ['ISNOTAT', 2], ['WEIGH', 2], ['PUTIN', 2], ['TAKEOUT', 2], ['NEWTEXT', 0], ['ABILITY', 2],
  ['WEIGHT', 1], ['RANDOM', 1], ['INPUT', 1], ['SAVEAT', 0], ['BACKAT', 0], ['PRINTAT', 2], ['WHATO', 0],
  ['RESET', 1], ['PUTO', 1], ['NOTDONE', 0], ['AUTOP', 1], ['AUTOT', 1], ['MOVE', 1], ['PROTECT', 0]];

// Convenio de los PAW en castellano: símbolos con forma de letra acentuada
const ES_MAP = { '@': 'á', '#': 'é', '$': 'í', '%': 'ó', '&': 'ú', '[': '¡', '\\': 'Ñ', ']': '¿', '^': '«', '`': '»', '{': 'ü', '|': 'ñ', '~': 'ç' };
const WORD_TYPES = ['verb', 'adverb', 'noun', 'adjective', 'preposition', 'conjunction', 'pronoun'];

// ¿Hay de verdad una base de datos de PAW? Las tablas tienen que estar en la
// memoria alta, y el vocabulario, ser de palabras: cinco letras (con XOR FFh)
// y un tipo de 0 a 6, acabado en un 0. (Con unos contadores sueltos no basta:
// cualquier instantánea que no sea de PAW los puede tener por casualidad.)
function looksPAW(m, P) {
  if (![P.proc, P.objd, P.locd, P.msg, P.sys, P.conn, P.voc, P.oloc, P.owords, P.oattr].every((a) => a >= 0x5b00 && a < 0xffd9)) return false;
  let n = 0, good = 0;
  for (let a = P.voc; m[a] !== 0 && n < 2000 && a + 7 <= 0xffd9; a += 7, n++) {
    const letters = [0, 1, 2, 3, 4].every((k) => { const c = m[a + k] ^ 0xff; return c >= 0x20 && c < 0x80; });
    if (letters && m[a + 6] < 7) good++;
  }
  return n >= 8 && good >= n * 0.9;
}

export function importPAW(bytes, name = 'juego.z80') {
  const snap = readSnapshot(bytes, name);
  // La base de datos de PAW vive con la página 0 en C000h. En 128K hay además
  // localidades (con sus conexiones y dibujos) y mensajes en otras páginas, y
  // cada página lleva en FFD9h su propia tabla de punteros.
  const view = (pg) => {
    if (!snap.banks) return snap.ram;
    const v = snap.ram.slice();
    v.set(snap.banks[pg], 0xc000);
    return v;
  };
  const m = view(0);
  const w = (a, mem = m) => mem[a] | (mem[a + 1] << 8);
  const P = {
    proc: w(0xffd9), objd: w(0xffdb), locd: w(0xffdd), msg: w(0xffdf), sys: w(0xffe1), conn: w(0xffe3),
    voc: w(0xffe5), oloc: w(0xffe7), owords: w(0xffe9), oattr: w(0xffeb), gfxdata: w(0xffef), gfxptr: w(0xfff1), gfxattr: w(0xfff3),
  };
  // Cabecera de PAW (MainTop, en FFFDh): UDG, sombreados, reparto de páginas,
  // contadores totales, fuentes y abreviaturas
  const MT = w(0xfffd);
  const hasHeader = MT >= 0x5c00 && MT < 0xfe00 && m[MT + 325] > 0;
  const [nObj, nLoc, nMsg, nSys, nProc] = hasHeader ? [324, 325, 326, 327, 328].map((o) => m[MT + o])
    : [m[0xfffa], m[0xfffb], m[0xfff8], m[0xfff9], m[0xfffc]];
  if (!nLoc || !nProc || P.voc < 0x6000 || !looksPAW(m, P)) {
    if (snap.unplaced) throw new Error(t('No encuentro una base de datos de PAW en esa cinta. Tiene {n} bloques sin cabecera (de un cargador propio, turbo o protegido) y no sé dónde van. Cárgala en un emulador y guarda una instantánea .z80 cuando empiece la partida.', { n: snap.unplaced }));
    throw new Error(t('No encuentro una base de datos de PAW en esa instantánea.'));
  }
  const chars = w(23606);
  const tokBase = hasHeader ? w(MT + 332) + 1 : chars + 0x401;
  const tokens = [];
  for (let i = 0, a = tokBase; i < 92; i++) {
    let s = '';
    for (;;) { const c = m[a++]; s += String.fromCharCode(c & 0x7f); if (c & 0x80) break; }
    tokens.push(s);
  }
  const rawText = (mem, a) => {
    let s = '';
    for (let n = 0; n < 4000; n++) {
      const c = mem[a++] ^ 0xff;
      if (c === 0x1f) break;
      s += c >= 164 ? tokens[c - 164] : String.fromCharCode(c);
    }
    return s;
  };
  // Reparto en páginas: pares (página, último índice + 1) hasta FFh; un 255
  // quiere decir "hasta el final"
  const spread = (off, total) => {
    if (!snap.banks || !hasHeader) return [{ page: 0, from: 0, to: total }];
    const ends = new Array(8).fill(0);
    let last = 0;
    for (let i = 0; m[MT + off + i] !== 255 && i < 32; i += 2) {
      const pg = m[MT + off + i] & 7, val = m[MT + off + i + 1];
      if (val !== 255) ends[pg] = val; else if (last !== 255) ends[pg] = total;
      last = val;
    }
    const out = [];
    let from = 0;
    for (let pg = 0; pg < 8; pg++) if (ends[pg] > from) { out.push({ page: pg, from, to: Math.min(ends[pg], total) }); from = ends[pg]; }
    return out;
  };
  const locPages = spread(297, nLoc), msgPages = spread(283, nMsg);
  // Recorre una tabla repartida en páginas: fn(índice, memoria, dirección)
  const perPage = (pages, table, fn) => {
    for (const d of pages) {
      const mem = view(d.page), T = w(table, mem);
      for (let i = d.from; i < d.to; i++) fn(i, mem, w(T + 2 * (i - d.from), mem), d);
    }
  };
  const texts = { loc: [], obj: [], msg: [], sys: [] };
  perPage(locPages, 0xffdd, (i, mem, a) => { texts.loc[i] = rawText(mem, a); });
  for (let i = 0; i < nObj; i++) texts.obj.push(rawText(m, w(P.objd + 2 * i)));
  perPage(msgPages, 0xffdf, (i, mem, a) => { texts.msg[i] = rawText(mem, a); });
  for (let i = 0; i < nSys; i++) texts.sys.push(rawText(m, w(P.sys + 2 * i)));
  for (const k of ['loc', 'msg']) for (let i = 0; i < (k === 'loc' ? nLoc : nMsg); i++) texts[k][i] ??= '';

  // ¿Castellano con el convenio @ = á...? Se mira si esos símbolos aparecen
  // pegados a letras.
  const all = Object.values(texts).flat().join(' ');
  const inWord = (all.match(/[a-z][@#$%&][a-z]?|[a-z]?[@#$%&][a-z]/gi) || []).length;
  // y, por si acaso, palabras frecuentes de cada idioma
  const count = (re) => (all.toLowerCase().match(re) || []).length;
  const esWords = count(/\b(que|los|las|una|del|est[a@]s?|hay|puedes)\b/g), enWords = count(/\b(the|and|you|there|is|are|with)\b/g);
  const spanish = esWords > enWords || (esWords === enWords && (inWord > 8 || / que | los | una /.test(tokens.join('|'))));

  // Juego de caracteres y caracteres gráficos (©, UDG y bloques: 127 a 163;
  // el bloque vacío, 128, pasa a espacio duro).
  // DAAD solo imprime los códigos 16 a 127, así que los gráficos van a los
  // huecos 16-31 (las letras del castellano) que el juego no use.
  // Al empezar, PAW usa la fuente 0 de la base de datos (si tiene alguna) o la de la ROM
  const font = hasHeader ? (m[MT + 329] > 0 ? w(MT + 330) : 0x3d00) : chars + 256;
  const ownFont = font >= 0x5b00 && font !== 0x3d00;
  const graphicUse = new Map();
  for (const tx of Object.values(texts).flat()) {
    for (let i = 0; i < tx.length; i++) {
      const c = tx.charCodeAt(i);
      if (c >= 16 && c <= 21) { i++; continue; }
      if (c === 22 || c === 23) { i += 2; continue; }
      if ((c > 128 && c < 164) || c === 127) graphicUse.set(c, (graphicUse.get(c) || 0) + 1);
    }
  }
  const usedLetters = new Set();
  const esChars = spanish ? Object.values(ES_MAP) : [];
  for (const ch of esChars) if (all.includes(Object.keys(ES_MAP).find((k) => ES_MAP[k] === ch))) usedLetters.add(ch);
  // primero los huecos de las letras que menos se escriben
  const freeSlots = [...'ªÇÜçüÑ«»¡¿ñáéíóú'].map((ch) => ({ ch, code: 16 + DAAD_ES.indexOf(ch) })).filter((x) => !usedLetters.has(x.ch));
  const graphicChar = new Map();
  let lostGraphics = 0;
  for (const [c] of [...graphicUse].sort((a, b) => b[1] - a[1])) {
    const slot = freeSlots.shift();
    if (slot) graphicChar.set(c, slot); else lostGraphics++;
  }
  let charset = null, narrowed = false;
  if (ownFont || graphicChar.size) {
    const cs = defaultCharset().slice();
    if (ownFont) {
      cs.set(m.subarray(font, font + 768), 32 * 8);
      // los símbolos que hacen de letras acentuadas, a su sitio en DAAD
      for (const [sym, ch] of Object.entries(spanish ? ES_MAP : {})) {
        const g = font + (sym.charCodeAt(0) - 32) * 8;
        cs.set(m.subarray(g, g + 8), charToDaad(ch) * 8);
      }
    }
    narrowed = fitFont42(cs);
    const udg = hasHeader ? MT : w(23675);          // los UDG de PAW van al principio de MainTop
    for (const [c, slot] of graphicChar) {
      let glyph;
      if (c === 127) glyph = ownFont ? m.subarray(font + 95 * 8, font + 96 * 8) : cs.slice(127 * 8, 128 * 8);   // ©
      else if (c >= 144) glyph = m.subarray(udg + (c - 144) * 8, udg + (c - 144) * 8 + 8);
      else {
        // bloques: 1 arriba derecha, 2 arriba izquierda, 4 abajo derecha, 8 abajo izquierda
        const b = c - 128, top = (b & 2 ? 0xf0 : 0) | (b & 1 ? 0x0f : 0), bot = (b & 8 ? 0xf0 : 0) | (b & 4 ? 0x0f : 0);
        glyph = [top, top, top, top, bot, bot, bot, bot];
      }
      cs.set(glyph, slot.code * 8);
    }
    charset = cs;
  }

  const clean = (tx) => {
    let s = '';
    for (let i = 0; i < tx.length; i++) {
      const c = tx.charCodeAt(i);
      if (c === 7 || c === 13) { s += '\n'; continue; }
      if (c >= 16 && c <= 21) { i++; continue; }          // INK, PAPER... con su valor
      if (c === 22 || c === 23) { i += 2; continue; }     // AT y TAB
      if (c < 32) continue;
      // el bloque vacío (128) es un espacio que no parte la línea: el duro de DAAD
      if (c === 128) { s += '\u00a0'; continue; }
      if ((c > 128 && c < 164) || c === 127) { s += graphicChar.get(c)?.ch ?? ' '; continue; }
      const ch = tx[i];
      s += spanish && ES_MAP[ch] ? ES_MAP[ch] : ch;
    }
    return s;
  };

  // Vocabulario
  const vocab = [];
  for (let a = P.voc; m[a] !== 0 && vocab.length < 2000; a += 7) {
    let word = '';
    for (let k = 0; k < 5; k++) { const ch = String.fromCharCode(m[a + k] ^ 0xff); word += spanish && ES_MAP[ch] ? ES_MAP[ch].toUpperCase() : ch; }
    const type = WORD_TYPES[m[a + 6]];
    word = word.trim();
    if (!type || !word) continue;
    if (!vocab.some((x) => x.word.slice(0, 5) === word.slice(0, 5))) vocab.push({ word, value: m[a + 5], type });
  }

  // Conexiones (en la página de su localidad), objetos
  const con = [];
  perPage(locPages, 0xffe3, (l, mem, a) => {
    const list = [];
    for (; mem[a] !== 0xff && list.length < 64; a += 2) list.push({ verb: mem[a], loc: mem[a + 1] });
    con[l] = list;
  });
  for (let l = 0; l < nLoc; l++) con[l] ??= [];
  const objs = [];
  for (let o = 0; o < nObj; o++) {
    const at = m[P.oattr + o];
    objs.push({ noun: m[P.owords + 2 * o], adj: m[P.owords + 2 * o + 1], loc: m[P.oloc + o],
      weight: at & 0x3f, container: !!(at & 0x40), wearable: !!(at & 0x80), attrs: 0 });
  }

  // Dibujos: tabla de cada página con punteros (FFF1h) y atributos (FFF3h);
  // bit 7 del atributo = dibujo de localidad, bits 0-5 = papel y tinta
  const lib = [], gattr = [];
  for (const d of locPages) {
    const mem = view(d.page), gp = w(0xfff1, mem), ga = w(0xfff3, mem);
    if (!(gp > 0x6000 && gp < 0xffd0)) continue;
    for (let n = d.from; n < d.to; n++) {
      const a = w(gp + 2 * (n - d.from), mem);
      gattr[n] = mem[ga + n - d.from];
      if (a >= 0x6000) lib[n] = { data: mem.subarray(a, Math.min(0x10000, a + 4000)) };
    }
  }
  // PICTURE de PAW pinta cualquier dibujo, sea o no de localidad; en DAAD
  // solo valen los de localidad, así que los demás se piden con otro número
  // (un dibujo que hace GOSUB al original)
  const picAlias = new Map();
  const picNumber = (n) => {
    if (!lib[n] || gattr[n] & 0x80) return n;
    if (!picAlias.has(n) && nLoc + picAlias.size < 256) picAlias.set(n, nLoc + picAlias.size);
    if (!picAlias.has(n)) return n;
    return picAlias.get(n);
  };

  // Procesos de PAW traducidos a condactos de DAAD
  let pictureRows = null;
  const dropped = new Map();
  const note = (n) => dropped.set(n, (dropped.get(n) || 0) + 1);
  const procs = [];
  for (let p = 0; p < nProc; p++) {
    const entries = [];
    for (let a = w(P.proc + 2 * p); m[a] !== 0 && entries.length < 2000; a += 4) {
      // En PAW el 1 también vale como comodín en las entradas
      const wild = (v) => (v === 1 ? 255 : v);
      const e = { verb: wild(m[a]), noun: wild(m[a + 1]), condacts: [] };
      let c = w(a + 2);
      for (let k = 0; m[c] !== 0xff && k < 200; k++) {
        const op = m[c], def = PAW[op];
        if (!def) { note('?' + op); break; }
        const args = Array.from(m.subarray(c + 1, c + 1 + def[1]));
        c += 1 + def[1];
        e.condacts.push(...translate(def[0], args));
      }
      entries.push(e);
    }
    procs.push(entries);
  }
  // QUIT: en PAW, si no se contesta que sí, la entrada acaba como con DONE;
  // en DAAD se abandona y se pasa a la siguiente. Con una bandera que el juego
  // no use, una entrada más, igual a la de QUIT, hace ese DONE.
  const usedNums = new Set();
  for (const entries of procs) for (const e of entries) for (const c of e.condacts) for (const v of c.args) usedNums.add(v);
  let quitFlag = -1;
  for (let n = 254; n >= 64 && quitFlag < 0; n--) if (!usedNums.has(n)) quitFlag = n;
  if (quitFlag >= 0) {
    const C = (n, ...args) => ({ name: n, args });
    for (const entries of procs) for (let i = 0; i < entries.length; i++) {
      const e = entries[i], k = e.condacts.findIndex((c) => c.name === 'QUIT');
      if (k < 0) continue;
      e.condacts.splice(k, 1, C('LET', quitFlag, 1), C('QUIT'), C('CLEAR', quitFlag));
      entries.splice(++i, 0, { verb: e.verb, noun: e.noun, condacts: [C('NOTZERO', quitFlag), C('CLEAR', quitFlag), C('DONE')] });
    }
  }
  // PRINTAT de PAW cuenta desde arriba de la pantalla; en DAAD, desde la
  // ventana. Encima del texto se escribe en la ventana 2 (toda la pantalla)
  // y el turno vuelve luego a la ventana 1.
  const textTop = Math.min(20, pictureRows ?? 12);
  for (const entries of procs) for (const e of entries) {
    e.condacts = e.condacts.flatMap((c) => {
      if (!c.pawAt) return [c];
      const [l, col] = c.args;
      return l < textTop ? [{ name: 'WINDOW', args: [2] }, { name: 'PRINTAT', args: [l, col] }]
        : [{ name: 'WINDOW', args: [1] }, { name: 'PRINTAT', args: [l - textTop, col] }];
    });
  }
  function translate(name, a) {
    const C = (n, ...args) => ({ name: n, args });
    switch (name) {
      // CLS en PAW borra toda la pantalla (la ventana 2 la ocupa entera)
      case 'CLS': return [C('WINDOW', 2), C('CLS'), C('WINDOW', 1), C('CLS')];
      case 'INVEN': return [C('SYSMESS', 9), C('LISTAT', 254), C('SYSMESS', 10), C('LISTAT', 253), C('DONE')];
      case 'DESC': return [C('RESTART')];
      case 'SAVE': return [C('SAVE', 0), C('RESTART')];
      case 'LOAD': return [C('LOAD', 0), C('RESTART')];
      case 'TURNS': return [C('SYSMESS', 17), C('DPRINT', 31), C('SYSMESS', 18), C('SYSMESS', 19), C('SYSMESS', 20)];
      case 'SCORE': return [C('SYSMESS', 21), C('PRINT', 30), C('SYSMESS', 22)];
      case 'TIMEOUT': return [C('HASAT', 87)];
      case 'EXTERN': note('EXTERN'); return [C('EXTERN', a[0], 0)];
      case 'PARSE': return [C('PARSE', 1)];
      case 'PICTURE': return [C('WINDOW', 0), C('PICTURE', picNumber(a[0])), C('DISPLAY', 0), C('WINDOW', 1)];
      case 'PRINTAT': return [{ ...C('PRINTAT', a[0], a[1]), pawAt: true }];
      case 'PROMPT': return [C('LET', 42, a[0])];
      case 'RESET': return [C('RESET'), C('GOTO', a[0])];
      case 'INPUT': return [C('INPUT', a[0], 0)];
      case 'MODE': note('MODE'); return [];
      case 'LINE': pictureRows ??= a[0]; return [];
      case 'CHARSET': case 'GRAPHIC': case 'PROTECT': note(name); return [];
      default: return [C(name, ...a)];
    }
  }

  // Modelo DAAD: tablas de PAW tal cual (se colocan en la plantilla después)
  const model = {
    format: 'daad-model', version: 1, language: spanish ? 'es' : 'en', machine: 1,
    vocab, sysmsgs: texts.sys.map(clean), msgs: texts.msg.map(clean), ltx: texts.loc.map(clean), otx: texts.obj.map(clean),
    con, objs, procs: procs.map((entries) => entries.map((e) => ({ ...e, condacts: e.condacts.map(toOp) }))),
    tokens: null, externs: [],
  };
  const imported = decompileModel(model, { title: name.replace(/\.(z80|sna|tap|tzx)$/i, '').replace(/_+/g, ' ').trim() });

  // Encaja las tablas en la plantilla de DAAD (en el idioma del juego)
  const lang = model.language;
  const T = (es, en) => (lang === 'en' ? en : es);
  const tpl = newProject(imported.meta.title, lang);
  const R = Object.fromEntries(['main', 'turn', 'not_understood', 'after_describe', 'each_turn', 'responses', 'init']
    .map((k, i) => [k, PROC_ROLES[lang][i]]));
  const project = { ...imported, processes: [] };
  const ren = new Map();
  const roles = { 0: `${R.responses}_paw`, 1: `${R.after_describe}_paw`, 2: `${R.each_turn}_paw` };
  imported.processes.forEach((pr, i) => ren.set(pr.id, roles[i] || T(`proceso${i}`, `process${i}`)));
  const renamed = imported.processes.map((pr) => ({ id: ren.get(pr.id), source: renameProcs(pr.source, ren) }));
  const find = (id) => tpl.processes.find((x) => x.id === id).source;
  const tplLight = tpl.objects[0].id;
  project.processes = [
    { id: R.main, source: find(R.main).replace(`ABSENT ${tplLight}`, `ABSENT ${imported.objects[0]?.id ?? '0'}`).replace('AT intro', `AT ${imported.locations[0].id}`)
      // PAW borra toda la pantalla cuando pinta el dibujo de una localidad
      .replace(/(\n {4}PICTURE @fPlayer[^\n]*\n)/, `$1    WINDOW 1\n    CLS                    ; ${T('como PAW: con dibujo se borra toda la pantalla', 'as in PAW: a picture clears the whole screen')}\n    WINDOW 0\n`)
      // al describir bajan la bandera 2, la 3 a oscuras y la 4 si además no hay luz
      .replace(/\n> _ _\n {4}PICTURE @fPlayer/, `\n> _ _\n    MINUS 2 1              ; ${T('como PAW: al describir', 'as in PAW: on describing')}\n> _ _\n    NOTZERO fDark\n    MINUS 3 1\n> _ _\n    NOTZERO fDarkF\n    MINUS 4 1\n> _ _\n    PICTURE @fPlayer`) },
    { id: R.turn, source: find(R.turn).replace('> _ _', '> _ _\n    WINDOW 1\n> _ _') },
    { id: R.not_understood, source: find(R.not_understood) },
    { id: R.after_describe, source: T('; Como en PAW: el proceso 1 del juego original (que lista los objetos).',
      '; As in PAW: process 1 of the original game (which lists the objects).') + `\n> _ _\n    PROCESS ${roles[1]}\n` },
    { id: R.each_turn, source: T(`; Como en PAW: el proceso 2 original y luego las banderas que bajan solas
; cada turno (5 a 8; a oscuras la 9, y la 10 si además no hay luz).`,
      `; As in PAW: the original process 2, then the flags that count down every
; turn (5 to 8; in the dark 9, and 10 if there is no light either).`) +
      `\n> _ _\n    PROCESS ${roles[2]}\n> _ _\n    MINUS 5 1\n    MINUS 6 1\n    MINUS 7 1\n    MINUS 8 1\n> _ _\n    NOTZERO fDark\n    MINUS 9 1\n> _ _\n    NOTZERO fDarkF\n    MINUS 10 1\n` },
    { id: R.responses, source: T('; Respuestas: la tabla de respuestas del juego original.', '; Responses: the response table of the original game.') +
      `\n> _ _\n    PROCESS ${roles[0]}\n    ISDONE\n    DONE\n> _ _\n    NOTDONE\n` },
    { id: R.init, source: T(`; Preparación de la partida. Como en PAW, se empieza en la localidad 0 y el
; proceso 1 del juego original hace la presentación.`, `; Game setup. As in PAW, the game starts at location 0 and process 1 of
; the original game shows the title screen.`) + `
> _ _
    WINDOW 2
    WINAT 0 0
    WINSIZE 24 42
    WINDOW 1
    WINAT ${textTop} 0
    WINSIZE ${24 - textTop} 42
    CLS
    SET 255
> _ _
    MINUS 255 1
    NOTEQ 255 fGFlags
    CLEAR @255
> _ _
    NOTZERO 255
    SKIP -2
> _ _
    RESET
    LET fStrength 10
    LET fMaxCarr 4
    SET fCPronounNoun
    SET fCPronounAdject
` },
    ...renamed,
  ];
  // Mensajes del sistema que DAAD tiene y PAW no
  for (let i = project.sysmsgs.length; i < tpl.sysmsgs.length; i++) project.sysmsgs.push(tpl.sysmsgs[i]);
  project.settings = { machine: '128', textTop };

  // Dibujos vectoriales de PAW
  let pics = 0, cut = 0, lostGlyphs = 0;
  if (lib.length) {
    // Los dibujos de PAW pasan a cadenas de DAAD (casi el mismo formato):
    //  - LINE no tiene forma corta en PAW: se quita el bit 5
    //  - SHADE usa en PAW dos de sus 16 tramas (un nibble cada una); en DAAD la
    //    trama es un carácter, así que cada combinación va a un carácter libre
    //  - TEXT lleva en PAW la fuente en los bits 5-7 (0 = la de la ROM,
    //    n = fuente n-1 de la base de datos); si la letra no es la del juego
    //    de caracteres del proyecto, también va a un carácter libre
    //  - GOSUB: sin bits de espejo
    // Los caracteres libres son del 164 al 255, que el texto no usa.
    const pi = hasHeader ? MT + 152 : findPatterns(m);
    const patterns = pi >= 0 ? m.subarray(pi, pi + 128) : null;
    charset ??= defaultCharset().slice();
    const plain = defaultCharset();
    const nFonts = hasHeader ? m[MT + 329] : 0, fonts = nFonts ? w(MT + 330) : 0;
    const udg = hasHeader ? MT : w(23675);          // los UDG de PAW van al principio de MainTop
    const slots = new Map();
    let nextSlot = 164;
    const same = (code, g) => g.every((v, k) => charset[code * 8 + k] === v);
    const slot = (g) => {
      const key = g.join(',');
      if (!slots.has(key)) {
        if (nextSlot > 255) { slots.set(key, -1); lostGlyphs++; } else { charset.set(g, nextSlot * 8); slots.set(key, nextSlot++); }
      }
      return slots.get(key);
    };
    const glyph = (font, ch) => {
      if (ch >= 144 && ch < 164) return [...m.subarray(udg + (ch - 144) * 8, udg + (ch - 144) * 8 + 8)];
      if (ch >= 128 && ch < 144) {
        // bloques: 1 arriba derecha, 2 arriba izquierda, 4 abajo derecha, 8 abajo izquierda
        const b = ch - 128, top = (b & 2 ? 0xf0 : 0) | (b & 1 ? 0x0f : 0), bot = (b & 8 ? 0xf0 : 0) | (b & 4 ? 0x0f : 0);
        return [top, top, top, top, bot, bot, bot, bot];
      }
      if (ch < 32 || ch > 127 || !hasHeader) return null;          // se deja tal cual
      if (font === 0 || !nFonts) return [...plain.subarray(ch * 8, ch * 8 + 8)];
      const a = fonts + Math.min(font - 1, nFonts - 1) * 768 + (ch - 32) * 8;
      return [...m.subarray(a, a + 8)];
    };
    const convert = (data) => {
      const out = [];
      for (let i = 0; i < data.length;) {
        const c = data[i], op = c & 7;
        if (op === 0) { out.push(c, data[i + 1], data[i + 2]); i += 3; }
        else if (op === 1) { out.push(c & ~0x20, data[i + 1], data[i + 2]); i += 3; }
        else if (op === 2) {
          if (c === 0x12) { out.push(...data.subarray(i, i + 5)); i += 5; }
          else if (c & 0x20) {
            const pb = data[i + 3];
            let code = -1;
            if (patterns) {
              const a = patterns.subarray((pb & 15) * 8, (pb & 15) * 8 + 8), b = patterns.subarray((pb >> 4) * 8, (pb >> 4) * 8 + 8);
              code = slot(Array.from(a, (v, k) => v | b[k]));
            }
            if (code >= 0) out.push(c, data[i + 1], data[i + 2], code);
            else out.push(c & ~0x30, data[i + 1], data[i + 2]);     // sin sitio: relleno normal
            i += 4;
          } else { out.push(c, data[i + 1], data[i + 2]); i += 3; }
        } else if (op === 3) { out.push(c & 0x3f, data[i + 1]); i += 2; }
        else if (op === 4) {
          const ch = data[i + 1], g = glyph(c >> 5, ch);
          let code = ch;
          if (g && !same(ch, g)) code = ch >= 128 && ch < 164 ? (charset.set(g, ch * 8), ch) : slot(g);
          if (code < 0) code = ch;
          out.push(c & 0x1f, code, data[i + 2], data[i + 3]); i += 4;
        } else if (op === 5 || op === 6) { out.push(c); i += 1; }
        else { out.push(7); break; }
      }
      if (out[out.length - 1] !== 7) out.push(7);
      return out;
    };
    const rows = textTop;
    const conv = [];
    for (let n = 0; n < nLoc; n++) if (lib[n]) conv[n] = { data: convert(lib[n].data) };
    // Si un dibujo se sale de la pantalla, la ROM da el error B y PAW lo deja
    // a medias; DAAD pararía la partida, así que se corta donde PAW: hasta la
    // orden que se sale, con los GOSUB de por medio copiados (a su escala) y
    // la última línea hasta el último punto que llegó a pintar.
    const upTo = (d, path, k, scale, e, out) => {
      const sc = (v) => (scale ? (v * scale) >> 3 : v);
      for (let i = 0; i < path[k]; i += opLen(d, i)) {
        const c = d[i], op = c & 7;
        if (op === 1 || (op === 2 && c !== 0x12)) out.push(c, sc(d[i + 1]), sc(d[i + 2]), ...d.slice(i + 3, i + opLen(d, i)));
        else out.push(...d.slice(i, i + opLen(d, i)));
      }
      const i = path[k], c = d[i];
      if (k + 1 < path.length) upTo(conv[d[i + 1]].data, path, k + 1, (c >> 3) & 7, e, out);
      else if ((c & 7) === 1 && (e.x !== e.sx || e.y !== e.sy)) {
        const dx = e.x - e.sx, dy = e.y - e.sy;
        out.push((c & 0x18) | 1 | (dx < 0 ? 0x40 : 0) | (dy < 0 ? 0x80 : 0), Math.abs(dx), Math.abs(dy));
      }
      return out;
    };
    for (let n = 0; n < nLoc; n++) {
      if (!conv[n] || !(gattr[n] & 0x80)) continue;
      const p = new Painter(new Uint8Array(6912), conv, { kind: 'daad', charset });
      p.strict = true;
      try { p.run(n); } catch (e) {
        if (!(e instanceof OffScreen)) throw e;
        conv[n] = { data: [...upTo(conv[n].data, e.path, 0, 0, e, []), 7] };
        cut++;
      }
    }
    project.pictures = [];
    for (let n = 0; n < nLoc; n++) {
      if (!conv[n]) continue;
      // atributo: bit 7 = dibujo de localidad, bits 0-5 = papel y tinta
      const attr = gattr[n] ?? 0;
      const isLoc = !!(attr & 0x80);
      const draw = conv[n].data;
      if (!isLoc && draw.length === 1) continue;                     // vacío y sin usar como localidad
      const id = `${T('dibujo', 'picture')}_${imported.locations[n].id}`.slice(0, 40);
      project.pictures.push({
        id, number: n, drawstring: draw, location: isLoc,
        line: 0, col: 0, height: rows, width: 42, paper: (attr >> 3) & 7, ink: attr & 7,
      });
      if (isLoc) { project.locations[n].picture = id; pics++; }
    }
    for (const [n, k] of picAlias) {
      const attr = gattr[n] ?? 0;
      project.pictures.push({
        id: `${T('dibujo', 'picture')}_${n}_${T('aparte', 'extra')}`, number: k, drawstring: [3, n, 7], location: true,
        line: 0, col: 0, height: rows, width: 42, paper: (attr >> 3) & 7, ink: attr & 7,
      });
    }
    if (charset.every((v, k) => v === plain[k])) charset = null;
  }

  if (charset) project.settings.charset = b64(charset);

  const lost = [...dropped.entries()].map(([k, v]) => `${k} (${v})`).join(', ');
  const report = t('Importado: {loc} localidades, {obj} objetos, {msg} mensajes, {proc} procesos', { loc: nLoc, obj: nObj, msg: nMsg, proc: nProc }) +
    (pics ? t(', {n} dibujos', { n: pics }) : '') + (spanish ? t('. Acentos convertidos.') : '.') +
    (ownFont ? t(' Con su juego de caracteres.') : '') +
    (narrowed ? t(' Las letras se han corrido un punto a la izquierda para que se lean bien a 42 columnas.') : '') +
    (graphicChar.size === 1 ? t(' Un carácter gráfico en el hueco de una letra del castellano.') : '') +
    (graphicChar.size > 1 ? t(' {n} caracteres gráficos en los huecos de las letras del castellano.', { n: graphicChar.size }) : '') +
    (lostGraphics === 1 ? t(' Un carácter gráfico no cabe y sale como espacio.') : '') +
    (lostGraphics > 1 ? t(' {n} caracteres gráficos no caben y salen como espacios.', { n: lostGraphics }) : '') +
    (cut ? t(' {n} dibujos se salen de la pantalla y se cortan donde PAW daba error.', { n: cut }) : '') +
    (lostGlyphs ? t(' {n} tramas o letras de los dibujos no caben en el juego de caracteres.', { n: lostGlyphs }) : '') +
    (lost ? t(' Sin equivalente en DAAD: {list}.', { list: lost }) : '') +
    '';
  // seed: la semilla del azar (SEED de la ROM, 23670) en la instantánea, para
  // que las pruebas den los mismos números que el original
  return { project, report, seed: m[23670] | (m[23671] << 8) };
}

import { BY_NAME } from '../daad/condacts.js';
function toOp(c) {
  const d = BY_NAME[c.name];
  const args = c.args.slice(0, d.params);
  while (args.length < d.params) args.push(0);
  return { op: d.code, args };
}
function renameProcs(src, ren) {
  return src.replace(/(PROCESS\s+)(p\d+)/g, (_, a, id) => a + (ren.get(id) || id));
}
function findPatterns(m) {
  for (let i = 0x5c00; i < 0xffe0; i++) {
    if (m[i] === 0xd5 && m[i + 1] === 0x5f && m[i + 2] === 0x16 && m[i + 3] === 0x00 && m[i + 4] === 0x21) return m[i + 5] | (m[i + 6] << 8);
  }
  return -1;
}
const b64 = (u) => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };


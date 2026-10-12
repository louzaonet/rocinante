// Exportación para Spectrum 128K: los mensajes y las descripciones de las
// localidades van a los bancos 1,3,4,6,7 y se imprimen con la extensión
// xbank (z80/xbank.asm), llamada con EXTERN.

import { writeDDB, chooseTokens, applyTokens } from './ddb-write.js';
import { charToDaad } from './charset.js';

import { XBANK_ES, XBANK_EN, XBANK_PIC48_ES, XBANK_PIC48_EN } from './xbank-bin.js';
import { packBitmap } from '../gfx/zxpack.js';
import { buildSDG } from '../spectrum/zxexport.js';
import { t } from '../i18n.js';

const BANKS = [1, 3, 4, 6, 7];
const DIR_SIZE = 3 * 256 * 3;     // mensajes, localidades, dibujos
// El banco 1 empieza con 200h bytes del intérprete (RAMSAVE guarda ahí las
// banderas y los objetos en un 128K) y luego el directorio
const DIR_AT = 0x200;

export function export128(model, opts = {}) {
  const enc = (t) => Array.from(t, charToDaad);
  // Tokens comunes a lo que queda en el DDB y a lo que va a los bancos
  const tokens = chooseTokens([...model.sysmsgs, ...model.msgs, ...model.ltx].map(enc), 128);
  const tk = tokens.map(enc);
  const pack = (t) => [...applyTokens(enc(t), tk).map((c) => c ^ 0xff), 0x0a ^ 0xff];

  // Reparto de textos en bancos
  const banks = new Map(BANKS.map((b) => [b, []]));
  const dir = new Uint8Array(DIR_SIZE).fill(0xff);
  let bi = 0, used = DIR_AT + DIR_SIZE;  // el banco 1 empieza con el directorio
  let longest = 0;
  const place = (bytes) => {
    while (used + bytes.length > 0x4000) {
      bi++; used = 0;
      if (bi >= BANKS.length) throw new Error(t('Los textos no caben en los bancos del 128K'));
    }
    const b = BANKS[bi], addr = 0xc000 + used;
    banks.get(b).push(...bytes);
    used += bytes.length;
    longest = Math.max(longest, bytes.length);
    return [b, addr];
  };
  if (bi === 0) banks.get(1).push(...new Array(DIR_AT + DIR_SIZE).fill(0xff));
  const setDir = (table, n, [b, addr]) => {
    const o = table * 768 + 3 * n;
    dir[o] = b; dir[o + 1] = addr & 255; dir[o + 2] = addr >> 8;
  };
  model.msgs.forEach((t, n) => setDir(0, n, place(pack(t))));
  model.ltx.forEach((t, n) => setDir(1, n, place(pack(t))));
  // Dibujos en mapa de bits
  const pics = model.pictures || [];
  let hasBitmaps = false;
  Array.from({ length: pics.length }, (_, i) => pics[i]).forEach((p, n) => {
    if (!p || !p.zx) return;
    hasBitmaps = true;
    setDir(2, n, place([...packBitmap(p.zx, p.zx.cx, p.zx.cy)]));
  });
  banks.get(1).splice(DIR_AT, DIR_SIZE, ...dir);

  // Condactos: MES/MESSAGE/DESC pasan a EXTERN n función
  const procs = toExtern(model.procs, { 77: 0, 38: 1, 19: 2, ...(hasBitmaps ? { 28: 3 } : {}) });
  const slim = { ...model, procs, msgs: model.msgs.map(() => ''), ltx: model.ltx.map(() => '') };
  const externCode = [...(model.language === 'en' ? XBANK_EN : XBANK_ES), ...new Array(longest).fill(0)];
  const ddb = writeDDB(slim, { tokens, externCode });
  // los gráficos van al final de la memoria; si no caben por encima de C000h,
  // siguen por debajo (en el banco 2, que no cambia), hasta el DDB
  const sdg = buildSDG(sdgPictures(pics), opts.charset, 0x8400 + ddb.length);
  const bankData = {};
  for (const [b, bytes] of banks) if (bytes.length) bankData[b] = Uint8Array.from(bytes);
  return { ddb, sdg, banks: bankData, tokens, stats: { longest, used: [...banks].map(([b, x]) => [b, x.length]) } };
}

// Entradas del SDG: para los dibujos en mapa de bits basta una cadena vacía
// (END) con su ventana, para que PICTURE funcione como siempre.
export function sdgPictures(pics) {
  return Array.from({ length: pics.length }, (_, i) => pics[i]).map((p) => p ? {
    data: p.drawstring ?? [7], location: p.location !== false,
    paper: p.paper ?? 0, ink: p.ink ?? 7,
    line: p.line ?? 0, col: p.col ?? 0, height: p.height ?? 12, width: p.width ?? 42,
  } : { data: [7], location: false, paper: 0, ink: 7, line: 0, col: 0, height: 1, width: 1 });
}

// Cambia condactos por EXTERN valor función (map: código de condacto -> función)
function toExtern(procs, map) {
  return procs.map((entries) => entries.map((e) => ({
    ...e,
    condacts: e.condacts.map((ca) => {
      const fn = map[ca.op];
      if (fn === undefined) return ca;
      return { op: 61, args: [ca.args[0], fn], ...(ca.ind ? { ind: true } : {}) };
    }),
  })));
}

// Exportación para Spectrum 48K. Los textos se quedan en el DDB. Los dibujos
// en mapa de bits van, comprimidos, detrás de la extensión xbank en modo 48K
// (DISPLAY pasa a EXTERN v 3), por orden de número mientras quepan; los que no
// caben se quedan sin dibujo. Devuelve { ddb, sdg, free, included, lost }.
export function export48(model, opts = {}) {
  const pics = Array.from({ length: (model.pictures || []).length }, (_, i) => model.pictures[i]);
  const bitmaps = pics.map((p, n) => (p && p.zx ? { n, data: packBitmap(p.zx, p.zx.cx, p.zx.cy) } : null)).filter(Boolean);
  if (!bitmaps.length) {
    const vector = pics.map((x) => (x && x.drawstring ? x : null));
    const ddb = writeDDB(model);
    const sdg = buildSDG(sdgPictures(vector), opts.charset, 0x8400);
    return { ddb, sdg, free: 0x10000 - sdg.length - 0x8400 - ddb.length, included: 0, lost: 0 };
  }
  const sdg = buildSDG(sdgPictures(pics), opts.charset, 0x8400);
  const code = model.language === 'en' ? XBANK_PIC48_EN : XBANK_PIC48_ES;
  const slim = { ...model, procs: toExtern(model.procs, { 28: 3 }) };
  const tableLen = 2 * pics.length;
  const sdgStart = 0x10000 - sdg.length;
  const bare = writeDDB(slim, { externCode: [...code, ...new Array(tableLen).fill(0)] });
  let room = sdgStart - 0x8400 - bare.length;
  const table = new Array(tableLen).fill(0), data = [];
  let addr = 0x843c + code.length + tableLen, included = 0;
  for (const b of bitmaps) {
    if (b.data.length > room) continue;
    table[2 * b.n] = addr & 255; table[2 * b.n + 1] = addr >> 8;
    data.push(...b.data);
    addr += b.data.length; room -= b.data.length; included++;
  }
  const ddb = writeDDB(slim, { externCode: [...code, ...table, ...data] });
  return { ddb, sdg, free: sdgStart - 0x8400 - ddb.length, included, lost: bitmaps.length - included };
}

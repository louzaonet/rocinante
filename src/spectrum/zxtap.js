// Cintas para Spectrum 48K y 128K: un programa BASIC que carga el cargador
// en código máquina (z80/tapload.asm) y, detrás, los bloques sin cabecera que
// lee ese cargador: intérprete, base de datos, SDG y, en 128K, los bancos de
// datos. Sale en .tap; tapToTzx y tapToWav la pasan a .tzx y a audio.

import { BASES } from './daadbase.js';
import { TAPLOAD, TAPLOAD_ORG } from './tapload-bin.js';
import { t } from '../i18n.js';

const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const INTERP = 0x6000, INTERP_END = 0x8400;

// Bloque de cinta: longitud, marca, datos y suma de comprobación (XOR)
function block(flag, data) {
  const out = new Uint8Array(data.length + 4);
  const len = data.length + 2;
  out[0] = len & 255; out[1] = len >> 8; out[2] = flag;
  out.set(data, 3);
  let x = flag;
  for (const b of data) x ^= b;
  out[out.length - 1] = x;
  return out;
}

// Cabecera de 17 bytes: tipo, nombre (10), longitud, parámetro 1 y 2
function header(type, name, length, p1, p2) {
  const h = new Uint8Array(17);
  h[0] = type;
  const n = (name.normalize('NFD').replace(/[^\x20-\x7e]/g, '') + '          ').slice(0, 10);
  for (let i = 0; i < 10; i++) h[1 + i] = n.charCodeAt(i);
  h[11] = length & 255; h[12] = length >> 8;
  h[13] = p1 & 255; h[14] = p1 >> 8;
  h[15] = p2 & 255; h[16] = p2 >> 8;
  return h;
}

// 10 CLEAR VAL "24063": LOAD ""CODE : RANDOMIZE USR VAL "24064"
// (con VAL no hacen falta los números en formato de 5 bytes)
function basicLoader() {
  const T = { CLEAR: 0xfd, VAL: 0xb0, LOAD: 0xef, CODE: 0xaf, RANDOMIZE: 0xf9, USR: 0xc0 };
  const str = (s) => [...s].map((c) => c.charCodeAt(0));
  const q = (s) => [0x22, ...str(s), 0x22];
  const body = [
    T.CLEAR, T.VAL, ...q(String(TAPLOAD_ORG - 1)), 0x3a,
    T.LOAD, ...q(''), T.CODE, 0x3a,
    T.RANDOMIZE, T.USR, T.VAL, ...q(String(TAPLOAD_ORG)), 0x0d,
  ];
  return Uint8Array.from([0, 10, body.length & 255, body.length >> 8, ...body]);
}

// pieces: [{ bank, addr, data }]; final7ffd: paginación con la que arranca
function tape(name, pieces, final7ffd) {
  const table = [];
  for (const p of pieces) table.push(p.bank, p.addr & 255, p.addr >> 8, p.data.length & 255, p.data.length >> 8);
  table.push(0xff, final7ffd);
  const loader = Uint8Array.from([...TAPLOAD, ...table]);
  const prog = basicLoader();
  const parts = [
    block(0x00, header(0, name, prog.length, 10, prog.length)),
    block(0xff, prog),
    block(0x00, header(3, 'loader', loader.length, TAPLOAD_ORG, 32768)),
    block(0xff, loader),
    ...pieces.map((p) => block(0xff, p.data)),
  ];
  const out = new Uint8Array(parts.reduce((a, b) => a + b.length, 0));
  let o = 0;
  for (const b of parts) { out.set(b, o); o += b.length; }
  return out;
}

function mainPieces(ddb, sdg, lang) {
  const base = BASES[lang === 'en' ? 'en' : 'es'].b48;
  const ram = fromB64(base.data);
  const interp = ram.slice(INTERP - base.from, INTERP_END - base.from);
  const sdgStart = 0x10000 - sdg.length;
  if (0x8400 + ddb.length > sdgStart) throw new Error(t('No cabe: faltan {n} bytes', { n: 0x8400 + ddb.length - sdgStart }));
  return [
    { bank: 0, addr: INTERP, data: interp },
    { bank: 0, addr: 0x8400, data: ddb },
    { bank: 0, addr: sdgStart, data: sdg },
  ];
}

export function tape48(name, ddb, sdg, lang = 'es') {
  return tape(name, mainPieces(ddb, sdg, lang), 0x10);
}

export function tape128(name, ddb, sdg, banks = {}, lang = 'es') {
  const pieces = mainPieces(ddb, sdg, lang);
  for (const [n, data] of Object.entries(banks)) {
    if (['0', '2', '5'].includes(String(n))) throw new Error(t('El banco {n} no se puede usar para datos', { n }));
    if (data.length) pieces.push({ bank: +n, addr: 0xc000, data });
  }
  return tape(name, pieces, BASES[lang === 'en' ? 'en' : 'es'].b128.out7ffd);
}

// ------------------------------------------------------------------ .tzx
// Los mismos bloques como "bloques de velocidad normal" (ID 10h) y, delante,
// un bloque de información (ID 32h) con el título y el autor.
const ascii = (s) => Array.from(String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?').slice(0, 255), (c) => c.charCodeAt(0));
export function tapBlocks(tap) {
  const out = [];
  for (let i = 0; i + 2 <= tap.length;) {
    const len = tap[i] | (tap[i + 1] << 8);
    out.push(tap.subarray(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return out;
}
export function tapToTzx(tap, { title = '', author = '', year = '' } = {}) {
  const bytes = [...ascii('ZXTape!'), 0x1a, 1, 20];
  const info = [[0x00, title], [0x02, author], [0x03, year], [0xff, 'Rocinante']].filter(([, v]) => v);
  if (info.length) {
    const body = [info.length];
    for (const [id, v] of info) { const a = ascii(v); body.push(id, a.length, ...a); }
    bytes.push(0x32, body.length & 255, body.length >> 8, ...body);
  }
  for (const b of tapBlocks(tap)) bytes.push(0x10, 1000 & 255, 1000 >> 8, b.length & 255, b.length >> 8, ...b);
  return Uint8Array.from(bytes);
}

// ------------------------------------------------------------------ .wav
// La cinta como sonido, con los tiempos de la rutina de grabación de la ROM
// (en estados T a 3,5 MHz): tono guía de 2168, sincronismo de 667 y 735,
// bits de 855 (0) o 1710 (1) por medio ciclo, y un segundo de pausa entre
// bloques. PCM de 8 bits, mono.
const CLOCK = 3500000;
export function tapToWav(tap, rate = 44100) {
  // dos pasadas: la primera solo cuenta el tiempo, para reservar la memoria
  const blocks = tapBlocks(tap);
  const walk = (pulse, pause) => {
    pause(500);
    for (const b of blocks) {
      for (let k = b[0] < 128 ? 8063 : 3223; k > 0; k--) pulse(2168);
      pulse(667); pulse(735);
      for (const byte of b) for (let bit = 7; bit >= 0; bit--) { const l = byte >> bit & 1 ? 1710 : 855; pulse(l); pulse(l); }
      pause(1000);
    }
  };
  let total = 0;
  walk((len) => { total += len; }, (ms) => { total += ms * CLOCK / 1000; });
  const n = Math.floor(total * rate / CLOCK);
  const w = new Uint8Array(44 + n), v = new DataView(w.buffer);
  let level = false, t = 0, done = 0;      // t: estados T desde el principio
  const until = () => { const end = Math.min(n, Math.floor(t * rate / CLOCK)); w.fill(level ? 0xd0 : 0x30, 44 + done, 44 + end); done = Math.max(done, end); };
  // en la pausa, el nivel que dejó el último pulso dura 1 ms (así hay flanco
  // al final del último bit) y luego la señal queda baja, como pide el .tzx
  walk((len) => { t += len; until(); level = !level; }, (ms) => { t += CLOCK / 1000; until(); level = false; t += (ms - 1) * CLOCK / 1000; until(); });
  w.set(ascii('RIFF'), 0); v.setUint32(4, 36 + n, true); w.set(ascii('WAVEfmt '), 8);
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w.set(ascii('data'), 36); v.setUint32(40, n, true);
  return w;
}

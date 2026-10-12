// Cintas del Amstrad CPC: .cdt (el formato TZX con bloques 11h "turbo", que es
// como se guardan las cintas del CPC) y su audio en .wav.
//
// Formato del firmware (manual SOFT968, sección 8): cada fichero va en bloques
// de 2K; cada bloque son dos registros, cabecera (byte de sincronía 2Ch, un
// segmento) y datos (16h, hasta 8 segmentos). Registro: 2048 bits a 1, un bit
// a 0, el byte de sincronía, segmentos de 256 bytes con su CRC (CCITT,
// x^16+x^12+x^5+1, semilla FFFFh, negado, el byte alto primero) y 32 bits a 1.
// A 1000 baudios, medio periodo de un 0 dura 333 µs y el de un 1, el doble.

const CLOCK = 3500000;                  // los tiempos del TZX van en estados T a 3,5 MHz
const ZERO = 1167, ONE = 2333;          // 333 y 667 µs

function crc16(bytes) {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return ~crc & 0xffff;
}

// Registro: byte de sincronía, segmentos de 256 con CRC y la cola de unos
function record(sync, data) {
  const segs = Math.max(1, Math.ceil(data.length / 256));
  const out = [sync];
  for (let s = 0; s < segs; s++) {
    const seg = new Uint8Array(256);
    seg.set(data.subarray(s * 256, s * 256 + 256));
    out.push(...seg);
    const c = crc16(seg);
    out.push(c >> 8, c & 255);
  }
  out.push(0xff, 0xff, 0xff, 0xff);
  return Uint8Array.from(out);
}

// Bloque TZX 11h con los tiempos del CPC
function turbo(data, pauseMs) {
  const h = [ONE, ZERO, ZERO, ZERO, ONE, 4096].flatMap((v) => [v & 255, v >> 8]);
  return [0x11, ...h, 8, pauseMs & 255, pauseMs >> 8, data.length & 255, (data.length >> 8) & 255, data.length >> 16, ...data];
}

// files: [{ name, type (0 BASIC, 2 binario), load, exec, data }]
export function cdt(files, { title = '', author = '' } = {}) {
  const out = [...'ZXTape!'].map((c) => c.charCodeAt(0));
  out.push(0x1a, 1, 20);
  const info = [[0, title], [2, author]].filter(([, s]) => s);
  if (info.length) {
    const enc = (s) => [...s.normalize('NFD').replace(/[^\x20-\x7e]/g, '')].slice(0, 255).map((c) => c.charCodeAt(0));
    const body = [info.length];
    for (const [id, s] of info) { const e = enc(s); body.push(id, e.length, ...e); }
    out.push(0x32, body.length & 255, body.length >> 8, ...body);
  }
  for (const f of files) {
    const nblocks = Math.max(1, Math.ceil(f.data.length / 2048));
    for (let b = 0; b < nblocks; b++) {
      const part = f.data.subarray(b * 2048, b * 2048 + 2048);
      const hd = new Uint8Array(64);
      const name = f.name.toUpperCase().slice(0, 16);
      for (let i = 0; i < name.length; i++) hd[i] = name.charCodeAt(i);
      hd[16] = b + 1;
      hd[17] = b === nblocks - 1 ? 0xff : 0;
      hd[18] = f.type ?? 2;
      hd[19] = part.length & 255; hd[20] = part.length >> 8;
      const at = (f.load ?? 0) + b * 2048;
      hd[21] = at & 255; hd[22] = (at >> 8) & 255;
      hd[23] = b === 0 ? 0xff : 0;
      hd[24] = f.data.length & 255; hd[25] = (f.data.length >> 8) & 255;
      hd[26] = (f.exec ?? 0) & 255; hd[27] = (f.exec ?? 0) >> 8;
      out.push(...turbo(record(0x2c, hd), 20));
      out.push(...turbo(record(0x16, part), b === nblocks - 1 ? 2000 : 1000));
    }
  }
  return Uint8Array.from(out);
}

// Lee los bloques 11h de un .cdt (para las pruebas y el audio)
export function cdtBlocks(t) {
  const out = [];
  let i = 10;
  while (i < t.length) {
    const id = t[i++];
    if (id === 0x11) {
      const w = (k) => t[i + k] | (t[i + k + 1] << 8);
      const len = t[i + 15] | (t[i + 16] << 8) | (t[i + 17] << 16);
      out.push({ pilot: w(0), sync1: w(2), sync2: w(4), zero: w(6), one: w(8), pilotLen: w(10), pause: w(13), data: t.subarray(i + 18, i + 18 + len) });
      i += 18 + len;
    } else if (id === 0x32) i += 2 + (t[i] | (t[i + 1] << 8));
    else if (id === 0x30) i += 1 + t[i];
    else throw new Error('bloque TZX no esperado: ' + id.toString(16));
  }
  return out;
}

// Audio de la cinta, 8 bits mono
export function cdtToWav(t, rate = 44100) {
  const blocks = cdtBlocks(t);
  const walk = (pulse, pause) => {
    pause(500);
    for (const b of blocks) {
      for (let k = 0; k < b.pilotLen; k++) pulse(b.pilot);
      pulse(b.sync1); pulse(b.sync2);
      for (const byte of b.data) for (let bit = 7; bit >= 0; bit--) { const l = (byte >> bit) & 1 ? b.one : b.zero; pulse(l); pulse(l); }
      pause(b.pause);
    }
  };
  let total = 0;
  walk((len) => { total += len; }, (ms) => { total += ms * CLOCK / 1000; });
  const n = Math.floor(total * rate / CLOCK);
  const w = new Uint8Array(44 + n), v = new DataView(w.buffer);
  let level = false, tt = 0, done = 0;
  const until = () => { const end = Math.min(n, Math.floor(tt * rate / CLOCK)); w.fill(level ? 0xd0 : 0x30, 44 + done, 44 + end); done = Math.max(done, end); };
  walk((len) => { tt += len; until(); level = !level; }, (ms) => { tt += ms * CLOCK / 1000; until(); });
  w.fill(0x80, 44 + done);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) w[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true);
  return w;
}

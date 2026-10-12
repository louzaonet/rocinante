// Lectura de instantáneas .z80 (versiones 1, 2 y 3) y .sna de 48K (y, por
// tapread.js, de cintas .tap y .tzx).
// Devuelve { machine: '48'|'128', ram: Uint8Array(65536) con 4000h-FFFFh,
//            banks: [8 x Uint8Array(16384)] (128K), regs }.
import { readTape } from './tapread.js';

export function readSnapshot(bytes, name = '') {
  if (/\.(tap|tzx)$/i.test(name) || String.fromCharCode(...bytes.subarray(0, 7)) === 'ZXTape!') return readTape(bytes, name);
  if (/\.sna$/i.test(name) || bytes.length === 49179) return readSNA(bytes);
  return readZ80(bytes);
}

function readSNA(b) {
  const ram = new Uint8Array(65536);
  ram.set(b.subarray(27, 27 + 49152), 0x4000);
  return { machine: '48', ram, banks: null };
}

function unpack(src, len) {
  const out = new Uint8Array(len);
  let i = 0, o = 0;
  while (o < len && i < src.length) {
    if (src[i] === 0xed && src[i + 1] === 0xed) {
      const n = src[i + 2], v = src[i + 3];
      out.fill(v, o, o + n); o += n; i += 4;
    } else out[o++] = src[i++];
  }
  return out;
}

function readZ80(b) {
  const pc = b[6] | (b[7] << 8);
  const ram = new Uint8Array(65536);
  if (pc !== 0) {
    // versión 1: 48K, comprimida si el bit 5 del byte 12 está puesto
    const data = b.subarray(30);
    const compressed = b[12] & 0x20;
    const mem = compressed ? unpack(data, 49152) : data.subarray(0, 49152);
    ram.set(mem, 0x4000);
    return { machine: '48', ram, banks: null };
  }
  const extra = b[30] | (b[31] << 8);
  const hw = b[34];
  const v3 = extra >= 54;
  const is128 = v3 ? hw >= 4 && hw <= 6 || hw === 12 || hw === 13 : hw === 3 || hw === 4;
  let p = 32 + extra;
  const banks = Array.from({ length: 8 }, () => new Uint8Array(16384));
  const pages48 = {};
  while (p + 3 <= b.length) {
    const len = b[p] | (b[p + 1] << 8), page = b[p + 2];
    p += 3;
    const raw = len === 0xffff ? b.subarray(p, p + 16384) : unpack(b.subarray(p, p + len), 16384);
    p += len === 0xffff ? 16384 : len;
    if (is128) { if (page >= 3 && page <= 10) banks[page - 3] = raw; }
    else pages48[page] = raw;
  }
  if (is128) {
    const out7ffd = b[35];
    ram.set(banks[5], 0x4000); ram.set(banks[2], 0x8000); ram.set(banks[out7ffd & 7], 0xc000);
    return { machine: '128', ram, banks, out7ffd };
  }
  if (pages48[8]) ram.set(pages48[8], 0x4000);
  if (pages48[4]) ram.set(pages48[4], 0x8000);
  if (pages48[5]) ram.set(pages48[5], 0xc000);
  return { machine: '48', ram, banks: null };
}

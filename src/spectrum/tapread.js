// Lectura de cintas .tap y .tzx para importar juegos: deja la memoria como la
// dejaría la carga, en el mismo formato que readSnapshot ({ machine, ram,
// banks }).
//
// Solo hace falta saber dónde va cada bloque. Los bloques de código llevan
// delante su cabecera con la dirección de carga. En 128K, el banco de cada
// bloque se saca del programa BASIC: los OUT 32765,n (o POKE 23388,n) que van
// antes de cada LOAD ""CODE. Los bloques sin cabecera (cargadores propios,
// turbo, protecciones) no se pueden colocar: se cuentan y la importación
// avisa.
import { t } from '../i18n.js';

// Bloques de datos de la cinta: [{ flag, data }] (data sin la marca ni la suma)
export function tapeBlocks(bytes, name = '') {
  const raw = isTzx(bytes) ? tzxBlocks(bytes) : tapRaw(bytes);
  return raw.filter((b) => b.length >= 2).map((b) => ({ flag: b[0], data: b.subarray(1, b.length - 1) }));
}
const isTzx = (b) => String.fromCharCode(...b.subarray(0, 7)) === 'ZXTape!';

function tapRaw(b) {
  const out = [];
  for (let i = 0; i + 2 <= b.length;) {
    const len = b[i] | (b[i + 1] << 8);
    out.push(b.subarray(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return out;
}

// Bloques del .tzx: se quedan los que llevan datos con forma de bloque de la
// ROM (normales, turbo y "datos puros"); los demás se saltan por su longitud
function tzxBlocks(b) {
  const out = [];
  const w = (i) => b[i] | (b[i + 1] << 8), w3 = (i) => w(i) | (b[i + 2] << 16), w4 = (i) => w(i) | (w(i + 2) << 16);
  for (let i = 10; i < b.length;) {
    const id = b[i++];
    switch (id) {
      case 0x10: { const n = w(i + 2); out.push(b.subarray(i + 4, i + 4 + n)); i += 4 + n; break; }
      case 0x11: { const n = w3(i + 15); out.push(b.subarray(i + 18, i + 18 + n)); i += 18 + n; break; }
      case 0x14: { const n = w3(i + 7); out.push(b.subarray(i + 10, i + 10 + n)); i += 10 + n; break; }
      case 0x12: i += 4; break;
      case 0x13: i += 1 + 2 * b[i]; break;
      case 0x15: i += 8 + w3(i + 5); break;
      case 0x18: case 0x19: i += 4 + w4(i); break;
      case 0x20: case 0x23: case 0x24: i += 2; break;
      case 0x21: case 0x30: i += 1 + b[i]; break;
      case 0x22: case 0x25: case 0x27: break;
      case 0x26: i += 2 + 2 * w(i); break;
      case 0x28: case 0x32: i += 2 + w(i); break;
      case 0x2a: i += 4; break;
      case 0x2b: i += 5; break;
      case 0x31: i += 2 + b[i + 1]; break;
      case 0x33: i += 1 + 3 * b[i]; break;
      case 0x35: i += 20 + w4(i + 16); break;
      case 0x5a: i += 9; break;
      default: throw new Error(t('Bloque de cinta desconocido ({id}h)', { id: id.toString(16) }));
    }
  }
  return out;
}

// Valores de los OUT al puerto 7FFDh (o POKE 23388) de un programa BASIC, en
// el orden en que se hacen respecto a cada LOAD ""CODE: devuelve para cada
// LOAD la paginación vigente (o null)
const TOK = { OUT: 0xdf, POKE: 0xf4, LOAD: 0xef, CODE: 0xaf, VAL: 0xb0 };
export function basicPaging(prog) {
  const res = [];
  let page = null;
  // números: texto ASCII seguido de 0Eh y 5 bytes; o VAL "texto"
  const numberAt = (line, i) => {
    while (i < line.length && line[i] === 0x20) i++;
    if (line[i] === TOK.VAL && line[i + 1] === 0x22) {
      let j = i + 2, s = '';
      while (j < line.length && line[j] !== 0x22) s += String.fromCharCode(line[j++]);
      return [Number(s), j + 1];
    }
    let j = i, s = '';
    while (j < line.length && line[j] >= 0x30 && line[j] <= 0x39) s += String.fromCharCode(line[j++]);
    if (!s) return [NaN, i];
    if (line[j] === 0x0e) j += 6;
    return [Number(s), j];
  };
  for (let i = 0; i + 4 <= prog.length;) {
    const len = prog[i + 2] | (prog[i + 3] << 8);
    const line = prog.subarray(i + 4, i + 4 + len);
    for (let k = 0; k < line.length; k++) {
      const c = line[k];
      if (c === 0x0e) { k += 5; continue; }
      if (c === TOK.OUT || c === TOK.POKE) {
        const [a, j] = numberAt(line, k + 1);
        if (line[j] === 0x2c) {
          const [v] = numberAt(line, j + 1);
          if ((c === TOK.OUT && a === 0x7ffd) || (c === TOK.POKE && a === 23388)) page = v & 7;
        }
      } else if (c === TOK.LOAD) {
        let j = k + 1;
        while (j < line.length && line[j] !== 0x3a && line[j] !== 0x0d && line[j] !== TOK.CODE) j++;
        if (line[j] === TOK.CODE) res.push(page);
      }
    }
    i += 4 + len;
  }
  return res;
}

export function readTape(bytes, name = '') {
  const blocks = tapeBlocks(bytes, name);
  const ram = new Uint8Array(65536);
  // variables del sistema que mira el importador, con su valor al encender
  ram[23606] = 0x00; ram[23607] = 0x3c;           // CHARS
  ram[23675] = 0x58; ram[23676] = 0xff;           // UDG
  const banks = Array.from({ length: 8 }, () => new Uint8Array(16384));
  let paging = [], loadIx = 0, used128 = false, unplaced = 0;
  for (let i = 0; i < blocks.length; i++) {
    const h = blocks[i];
    if (h.flag !== 0 || h.data.length !== 17) {
      if (h.flag === 0xff) unplaced++;                 // datos sin cabecera
      continue;
    }
    const type = h.data[0], len = h.data[11] | (h.data[12] << 8), start = h.data[13] | (h.data[14] << 8);
    const d = blocks[i + 1];
    if (!d || d.flag !== 0xff) continue;
    i++;
    if (type === 0) { paging = basicPaging(d.data); loadIx = 0; continue; }
    if (type !== 3) continue;
    const page = paging[loadIx++] ?? null;
    const data = d.data.subarray(0, Math.min(len, d.data.length));
    // en 128K, lo que cae en C000h va al banco paginado en ese momento
    for (let k = 0; k < data.length; k++) {
      const a = start + k;
      if (a > 0xffff) break;
      if (a >= 0xc000 && page !== null && page !== 0) { banks[page][a - 0xc000] = data[k]; used128 = true; }
      else ram[a] = data[k];
    }
  }
  if (used128) {
    banks[0].set(ram.subarray(0xc000));
    banks[5].set(ram.subarray(0x4000, 0x8000));
    banks[2].set(ram.subarray(0x8000, 0xc000));
    return { machine: '128', ram, banks, out7ffd: 0x10, unplaced };
  }
  return { machine: '48', ram, banks: null, unplaced };
}

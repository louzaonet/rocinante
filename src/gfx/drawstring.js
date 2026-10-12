// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)
// Dibujos vectoriales de PAW y DAAD (cadenas de órdenes PLOT, LINE, FILL...).
// Se pintan sobre una pantalla de Spectrum (6144 bytes de píxeles + 768 de
// atributos). Las líneas usan el mismo algoritmo que la ROM del Spectrum; el
// relleno es un relleno por inundación normal, así que algún detalle puede
// variar respecto al original.
//
// Formato de cada orden (bits 0-2 = tipo):
//   0 PLOT x y            bits 3/4: OVER/INVERSE (los dos: mover sin pintar)
//   1 LINE dx dy          bit 6/7: signo de x/y; bits 3+4: mover relativo
//                         (DAAD: con el bit 5, dx y dy van en un solo byte)
//   2 FILL dx dy          SHADE (bit 5) con un byte más de trama; BLOCK (12h)
//   3 GOSUB n             escala en los bits 3-5 (octavos); DAAD: espejo en 6-7
//   4 TEXT car col fila
//   5 PAPER (bit 7: BRIGHT)   6 INK (bit 7: FLASH)   7 END

import { ZX_PALETTE } from '../web/view.js';

const rowAddr = (y) => ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);
// PIXEL-ADD de la ROM (22AAh): coordenadas de PLOT (y hacia arriba) -> byte
const pixAddr = (x, y) => rowAddr(175 - y) + (x >> 3);

// Relleno de DAAD, traducido instrucción a instrucción de la rutina del
// intérprete (DS48IS 7C8Bh): rellenos por tramos horizontales, primero hacia
// abajo desde el punto y luego hacia arriba desde el de encima, con una pila
// de semillas limitada (como mucho 29 pendientes; si se llena, se deja esa
// dirección) y una tabla con el último tramo de cada fila. Por eso deja sin
// rellenar zonas que un relleno por inundación sí cubriría, igual que el
// original. pat: las 8 filas de la trama (ya invertidas si es SHADE inverso);
// attr(dirección): pone el atributo de la celda de ese byte.
export function daadFill(mem, sx, sy, pat, attr) {
  const rd = (a) => (a >= 0 && a < 6144 ? mem[a] : 0xff);
  const T = new Int16Array(178).fill(0);   // T[1 + y]; los extremos valen FFh como en la pila
  T[0] = 0xff; T[177] = 0xff;
  const stack = [0xffff];
  let B = sy, C = sx, D = 0, E = 0, HL = 0, HL_ = -1, C_ = 0, D_ = 0, cnt = 0, cy = 0;
  let st = 'start';
  for (let guard = 0; guard < 5e6; guard++) {
    switch (st) {
      case 'start':                                      // 7CDB
        if (B >= 176) return;
        HL = pixAddr(C, B); E = 0x80 >> (C & 7);
        if (mem[HL] & E) return;
        cnt = 0x1e;
        stack.push(0xffff);
        st = 'row'; break;
      case 'row':                                        // 7CEA
        D &= 0xfc;
        if (B >= 176) return;                            // (en la ROM, error B)
        HL = pixAddr(C, B); E = 0x80 >> (C & 7);
        cy = B;
        B = D & 0x80 ? (B + 1) & 255 : (B - 1) & 255;
        D_ = pat[7 - (cy & 7)];
        if (B < 0xb0) HL_ = pixAddr(C, B);               // la fila vecina (si no, se queda la de antes)
        C_ = T[1 + cy + (D & 0x80 ? 1 : -1)];
        for (;;) {                                       // 7D27: hasta el borde derecho
          const carry = E & 1;
          E >>= 1;
          if (carry) { E = 0x80; HL++; HL_++; }
          C = (C + 1) & 255;
          if (C === 0) break;
          if (mem[HL] & E) break;
        }
        C = (C - 1) & 255;
        T[1 + cy] = C;
        st = 'left'; break;
      case 'left': {                                     // 7D85
        const out = E & 0x80;
        E = (E << 1) & 255;
        st = out ? 'byte1' : 'pix'; break;
      }
      case 'pix':                                        // 7D3F
        if (mem[HL] & E) { st = 'end'; break; }
        mem[HL] |= D_ & E;
        attr(HL);
        if (C === 0) { st = 'end'; break; }
        if (!(D & 2)) {
          if (C_ !== 0 && C_ >= C) D |= 3;
          else {
            const clear = !(rd(HL_) & E);
            if (D & 1) { if (!clear) D &= ~1; }
            else if (clear) {
              cnt = (cnt - 1) & 255;
              if (cnt === 0) { st = 'next'; break; }
              stack.push((B << 8) | C);
              D |= 1;
            }
          }
        }
        C = (C - 1) & 255;
        st = 'left'; break;
      case 'byte1': E = 1; st = 'byte'; break;           // 7D8A
      case 'byte': {                                     // 7D8C: byte a byte hacia la izquierda
        HL--; HL_--;
        if (mem[HL] !== 0) { st = 'pix'; break; }
        if (!(D & 2) && (rd(HL_) !== 0 || !(D & 1))) { st = 'pix'; break; }
        mem[HL] = D_;                                    // 7DA2: el byte entero
        attr(HL);
        const c = C - 8;
        C = c & 255;
        st = c < 0 ? 'end' : 'byte'; break;
      }
      case 'end': {                                      // 7DB5: siguiente semilla
        cnt = (cnt + 1) & 255;
        const v = stack.pop() ?? 0xffff;
        B = v >> 8; C = v & 255;
        st = B !== 0xff ? 'row' : 'next'; break;
      }
      case 'next':                                       // 7DBE: la otra dirección
        B = sy; C = sx;
        if (D & 0x80) return;
        D |= 0x80;
        B = (B + 1) & 255;
        if (B >= 0xb0) return;
        st = 'start'; break;
    }
  }
}

// La ROM da el error B al pintar un punto fuera de los 256x176 de arriba;
// en DAAD y en PAW el dibujo se corta ahí.
// path: posición de la orden en cada nivel de GOSUB; x, y: último punto
// pintado; sx, sy: donde empezaba la orden que se sale
export class OffScreen extends Error {
  constructor(path, x, y, sx, sy) { super('off screen'); Object.assign(this, { path, x, y, sx, sy }); }
}

export class Painter {
  // pics: lista de { data, attr? } por número; kind: 'paw' | 'daad'
  constructor(mem, pics, { kind = 'paw', patterns = null, charset = null } = {}) {
    this.mem = mem; this.pics = pics; this.kind = kind;
    this.patterns = patterns;          // PAW: 16 tramas de 8 bytes
    this.charset = charset;            // DAAD/TEXT: juego de caracteres (2048)
    this.x = 0; this.y = 0;
    this.attr = 0x38; this.mask = 0;   // colores temporales como la ROM
    this.over = false; this.inverse = false;
    this.depth = 0;
    this.strict = false;               // true: punto fuera de pantalla = error B de la ROM
    this.path = [];                    // posición de la orden en curso en cada nivel
  }
  setColours(attr) { this.attr = attr; this.mask = 0; }

  plot(x, y) {
    if (x < 0 || x > 255 || y < 0 || y > 175) {
      if (this.strict) throw new OffScreen(this.path.slice(0, this.depth), this.x, this.y, this.sx, this.sy);
      this.x = x; this.y = y;
      return;
    }
    this.x = x; this.y = y;
    const sy = 175 - y, a = rowAddr(sy) + (x >> 3), bit = 0x80 >> (x & 7);
    let v = this.mem[a];
    if (!this.over) v &= ~bit;
    if (!this.inverse) v ^= bit;
    this.mem[a] = v;
    this.setAttr(sy >> 3, x >> 3);
  }
  setAttr(row, col) {
    const i = 6144 + row * 32 + col;
    this.mem[i] = ((this.mem[i] ^ this.attr) & this.mask) ^ this.attr;
  }
  // DRAW-LINE de la ROM (24BAh)
  line(dx, dy) {
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
    let ax = Math.abs(dx), ay = Math.abs(dy);
    let big, small, diag = [sx, sy], axis;
    if (ax >= ay) { if (!ax) return; big = ax; small = ay; axis = [sx, 0]; } else { big = ay; small = ax; axis = [0, sy]; }
    let a = big >> 1;
    for (let i = 0; i < big; i++) {
      a += small;
      let step;
      if (a > 255 || a >= big) { a -= big; step = diag; } else step = axis;
      a &= 255;
      this.plot(this.x + step[0], this.y + step[1]);
    }
  }
  // DAAD: coordenadas relativas como 7C06h (x da la vuelta en 256, y en 176)
  wrapX(x) { return x & 255; }
  wrapY(y) { return this.kind === 'daad' ? ((y % 176) + 176) % 176 : y; }
  fill(x, y, pattern) {
    if (this.kind === 'daad') {
      daadFill(this.mem, x & 255, this.wrapY(y), pattern, (a) => {
        const row = ((a >> 8) & 7) | ((a >> 2) & 0x38) | ((a >> 5) & 0xc0);
        this.setAttr(row >> 3, a & 31);
      });
      return;
    }
    if (x < 0 || x > 255 || y < 0 || y > 175) return;
    const sy0 = 175 - y;
    const on = (px, py) => this.mem[rowAddr(py) + (px >> 3)] & (0x80 >> (px & 7));
    if (on(x, sy0)) return;
    const seen = new Uint8Array(256 * 176);
    const stack = [[x, sy0]];
    const cells = new Set();
    while (stack.length) {
      let [px, py] = stack.pop();
      if (seen[py * 256 + px]) continue;
      let l = px; while (l > 0 && !on(l - 1, py) && !seen[py * 256 + l - 1]) l--;
      let r = px; while (r < 255 && !on(r + 1, py) && !seen[py * 256 + r + 1]) r++;
      for (let i = l; i <= r; i++) {
        seen[py * 256 + i] = 1;
        cells.add((py >> 3) * 32 + (i >> 3));
        for (const ny of [py - 1, py + 1]) if (ny >= 0 && ny < 176 && !seen[ny * 256 + i] && !on(i, ny)) stack.push([i, ny]);
      }
    }
    for (let i = 0; i < 256 * 176; i++) {
      if (!seen[i]) continue;
      const px = i & 255, py = i >> 8;
      if (pattern[py & 7] & (0x80 >> (px & 7))) this.mem[rowAddr(py) + (px >> 3)] |= 0x80 >> (px & 7);
    }
    for (const c of cells) this.setAttr(c >> 5, c & 31);
  }
  colour(kind, v) {
    // PAPER/INK 0-7, 8 transparente; BRIGHT/FLASH 0-1, 8 transparente
    const set = (bits, shift, val) => {
      if (val === 8) { this.mask |= bits; return; }
      this.mask &= ~bits;
      this.attr = (this.attr & ~bits) | ((val << shift) & bits);
    };
    if (kind === 'paper') set(0x38, 3, v & 15);
    else if (kind === 'ink') set(0x07, 0, v & 15);
    else if (kind === 'bright') set(0x40, 6, v & 15);
    else if (kind === 'flash') set(0x80, 7, v & 15);
  }

  run(n, scale = 0, flip = 0) {
    const pic = this.pics[n];
    if (!pic || !pic.data || this.depth > 10) return;
    this.depth++;
    const d = pic.data;
    const sc = (v) => (scale ? (v * scale) >> 3 : v);
    let i = 0;
    while (i < d.length) {
      this.path[this.depth - 1] = i;
      this.sx = this.x; this.sy = this.y;   // donde empieza la orden
      const c = d[i], op = c & 7;
      const fl = (c ^ flip);
      const neg = (v, bit) => (fl & bit ? -v : v);
      if (op === 0) {
        this.over = !!(c & 8); this.inverse = !!(c & 16);
        if (this.over && this.inverse) {
          // mover sin pintar: PLOT con OVER 1 e INVERSE 1, que en DAAD pone el atributo
          if (this.strict && d[i + 2] > 175) throw new OffScreen(this.path.slice(0, this.depth), this.x, this.y, this.sx, this.sy);
          this.x = d[i + 1]; this.y = d[i + 2];
          if (this.kind === 'daad' && this.x <= 255 && this.y <= 175) this.setAttr((175 - this.y) >> 3, this.x >> 3);
        } else this.plot(d[i + 1], d[i + 2]);
        i += 3;
      } else if (op === 1) {
        let dx, dy, len = 3;
        if (this.kind === 'daad' && (c & 0x20)) { dx = d[i + 1] >> 4; dy = d[i + 1] & 15; len = 2; } else { dx = d[i + 1]; dy = d[i + 2]; }
        dx = neg(sc(dx), 0x40); dy = neg(sc(dy), 0x80);
        if ((c & 0x18) === 0x18) { this.x = (this.x + dx) & 255; this.y = this.wrapY(this.y + dy); }
        else { this.over = !!(c & 8); this.inverse = !!(c & 16); this.line(dx, dy); }
        i += len;
      } else if (op === 2) {
        if (c === 0x12) {
          const rows = d[i + 1], cols = d[i + 2], col = d[i + 3], row = d[i + 4];
          for (let r = row; r <= row + rows && r < 24; r++) for (let k = col; k <= col + cols && k < 32; k++) this.setAttr(r, k);
          i += 5;
        } else {
          const dx = neg(sc(d[i + 1]), 0x40), dy = neg(sc(d[i + 2]), 0x80);
          let pat = [255, 255, 255, 255, 255, 255, 255, 255];
          let len = 3;
          if (c & 0x20) {
            const pb = d[i + 3];
            if (this.kind === 'paw' && this.patterns) {
              const a = this.patterns.subarray((pb & 15) * 8, (pb & 15) * 8 + 8), b = this.patterns.subarray((pb >> 4) * 8, (pb >> 4) * 8 + 8);
              pat = Array.from(a, (v, k) => v | b[k]);
            } else if (this.charset) pat = Array.from(this.charset.subarray(pb * 8, pb * 8 + 8));
            if (c & 0x10) pat = pat.map((v) => 255 - v);
            len = 4;
          }
          this.fill(this.wrapX(this.x + dx), this.wrapY(this.y + dy), pat);
          i += len;
        }
      } else if (op === 3) {
        const sub = d[i + 1], s = (c >> 3) & 7, f = this.kind === 'daad' ? (c & 0xc0) ^ flip : flip;
        this.run(sub, s, f);
        i += 2;
      } else if (op === 4) {
        this.over = !!(c & 8); this.inverse = !!(c & 16);
        this.text(d[i + 1], d[i + 2], d[i + 3]);
        i += 4;
      } else if (op === 5) {
        this.colour(c & 0x80 ? 'bright' : 'paper', (c >> 3) & 15);
        i += 1;
      } else if (op === 6) {
        this.colour(c & 0x80 ? 'flash' : 'ink', (c >> 3) & 15);
        i += 1;
      } else break;
    }
    this.depth--;
  }
  text(ch, col, row) {
    if (!this.charset || row > 23 || col > 31) return;
    for (let r = 0; r < 8; r++) {
      const a = rowAddr(row * 8 + r) + col;
      const g = this.charset[ch * 8 + r] ^ (this.inverse ? 0xff : 0);
      this.mem[a] = this.over ? this.mem[a] ^ g : g;
    }
    this.setAttr(row, col);
  }
}

// La pantalla (6912 bytes) en RGBA de 256x192
export function memToRGBA(mem) {
  const out = new Uint8ClampedArray(256 * 192 * 4);
  for (let y = 0; y < 192; y++) {
    const a = rowAddr(y);
    for (let x = 0; x < 256; x++) {
      const at = mem[6144 + (y >> 3) * 32 + (x >> 3)];
      const pal = at & 0x40 ? ZX_PALETTE.bright : ZX_PALETTE.normal;
      const c = pal[mem[a + (x >> 3)] & (0x80 >> (x & 7)) ? at & 7 : (at >> 3) & 7];
      const i = (y * 256 + x) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
  }
  return out;
}

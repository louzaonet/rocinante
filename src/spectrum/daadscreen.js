// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)
// Pantalla de texto de DAAD en Spectrum, reproducida al byte.
//
// Sigue la lógica del intérprete DS48IS: 24 líneas de 42 columnas de 6 píxeles,
// 8 ventanas, ajuste de palabras, "Hay más..." y el editor de la línea de
// órdenes. Trabaja sobre una copia de la memoria de pantalla (6912 bytes, en
// el orden del Spectrum) para poder compararla con el intérprete original.
// No toca el DOM: la parte del navegador va aparte.
//
// Entre paréntesis, la rutina del intérprete que imita cada método.

const COLS = 42, LINES = 24;

const rowAddr = (y) => ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);
const lineAddr = (line) => rowAddr(line * 8);

function newWindow() {
  return { saveCol: 0, saveLine: 0, attr: 0x07, more: LINES - 1, width: COLS, hm1: LINES - 1,
    top: 0, left: 0, col: 0, line: 0, flags: 0x40 };
}

// Máscaras y desplazamientos para dibujar un carácter de 6 píxeles según la
// posición de la columna dentro de su grupo de 4 (3 bytes de pantalla).
const GLYPH = [
  { inc: 0, keep: [0x03, 0xff], hl: (g) => [g, 0] },
  { inc: 0, keep: [0xfc, 0x0f], hl: (g) => [g >> 6, (g << 2) & 255] },
  { inc: 1, keep: [0xf0, 0x3f], hl: (g) => [g >> 4, (g << 4) & 255] },
  { inc: 1, keep: [0xff, 0xc0], hl: (g) => [0, g >> 2] },
];

export class DaadScreen {
  constructor({ charset, colourMap = [0, 1, 2, 3, 4, 5, 6, 7], sysmsg = () => '', getKey = null } = {}) {
    this.mem = new Uint8Array(6912);
    this.charset = charset;
    this.colourMap = colourMap;
    this.sysmsg = sysmsg;          // n -> texto del mensaje del sistema
    this.getKey = getKey;          // (motivo) -> Promise<código de tecla>
    this.borderColour = 0;
    this.onChange = null;
    this.reset();
  }

  // El intérprete arranca con la pantalla en negro y atributos 41h (tinta azul
  // con brillo); las ventanas usan su propio color (07h por defecto).
  reset(attr = 0x41) {
    this.mem.fill(0, 0, 6144);
    this.mem.fill(attr, 6144);
    this.windows = Array.from({ length: 8 }, newWindow);
    // MASK_T de la ROM: los dibujos vectoriales con tinta o papel 8
    // (transparente) lo dejan puesto y el texto lo respeta hasta el siguiente
    // dibujo, como en el intérprete
    this.maskT = 0;
    this.cur = 0;
    this.w = this.windows[0];
    this.word = [];               // palabra en espera de imprimir
    this.skipSpace = false;       // la palabra llenó la línea justa: se come el espacio
    this.wrapped = false;         // se acaba de saltar de línea por el margen
    this.cursorOn = false;
    this.xorMode = false;
    this.upper = false;           // #g: mitad alta del juego de caracteres
    this.hires = null;            // dibujo en alta resolución visible (web)
    this.changed();
  }
  changed() { this.onChange?.(); }

  // ------------------------------------------------------------ ventanas
  async window(n) {                                   // (7432)
    if (n === this.cur) return;
    await this.flushWord();
    this.cur = n;
    this.w = this.windows[n];
  }
  async winat(line, col) {                            // (6EFD)
    await this.flushWord();
    const w = this.w;
    w.top = line < LINES ? line : 0;
    w.left = col < COLS ? col : 0;
    this.clip();
    this.home();
  }
  async winsize(h, wd) {                              // (6F19)
    await this.flushWord();
    const w = this.w;
    w.hm1 = (h - 1) & 255;
    w.width = wd;
    this.clip();
    this.home();
  }
  clip() {                                            // (74C9)
    const w = this.w;
    if (w.top + w.hm1 >= LINES) w.hm1 = LINES - 1 - w.top;
    if (w.left + w.width > COLS) w.width = COLS - w.left;
  }
  async centre() {                                    // (6EED)
    await this.flushWord();
    const w = this.w;
    w.left = 21 - (w.width >> 1);
    this.clip();
    this.home();
  }
  home() {                                            // (747D)
    const w = this.w;
    w.line = w.top; w.col = w.left; w.more = w.hm1;
  }
  // ------------------------------------------------------------- dibujos
  // pic: dibujo del modelo ({ zx, drawstring, line, col, height, width, paper, ink })
  async display(pic, value) {
    await this.flushWord();
    if (!pic) return;
    if (pic.zx) {
      // Como la extensión xbank: el mapa de bits ocupa su propio rectángulo
      const { cx, cy, cw, ch } = pic.zx;
      if (value) {
        for (let y = cy * 8; y < (cy + ch) * 8; y++) this.mem.fill(0, rowAddr(y) + cx, rowAddr(y) + cx + cw);
        for (let r = cy; r < cy + ch; r++) this.mem.fill(0, 6144 + r * 32 + cx, 6144 + r * 32 + cx + cw);
        this.hires = null;
      } else {
        for (let y = 0; y < ch * 8; y++) this.mem.set(pic.zx.pixels.subarray(y * cw, (y + 1) * cw), rowAddr(cy * 8 + y) + cx);
        for (let r = 0; r < ch; r++) this.mem.set(pic.zx.attrs.subarray(r * cw, (r + 1) * cw), 6144 + (cy + r) * 32 + cx);
        this.hires = pic.image ? { image: pic.image, x: cx * 8, y: cy * 8, w: cw * 8, h: ch * 8, top: cy, bottom: cy + ch - 1 } : null;
      }
      this.changed();
      return;
    }
    // Dibujo vectorial: la ventana actual toma la del dibujo y se borra (7918)
    if (pic.location !== false) {
      const w = this.w;
      w.top = pic.line; w.left = pic.col; w.hm1 = pic.height - 1; w.width = pic.width;
      this.clip();
      this.home();
      const saved = w.attr;
      w.attr = ((pic.paper & 7) << 3) | (pic.ink & 7);
      for (let l = w.top; l <= w.top + w.hm1; l++) this.clearLine(l);
      w.attr = saved;
      this.hires = null;
    }
    if (!value && pic.drawstring && this.drawstring) this.drawstring(pic);
    this.changed();
  }
  hiresHit(top, bottom) {
    if (this.hires && !(bottom < this.hires.top || top > this.hires.bottom)) this.hires = null;
  }

  async cls() {                                       // (746D)
    await this.flushWord();
    this.skipSpace = false;
    this.home();
    const w = this.w;
    for (let l = w.top; l <= w.top + w.hm1; l++) this.clearLine(l);
    this.hiresHit(w.top, w.top + w.hm1);
    this.changed();
  }
  async printat(line, col) { await this.flushWord(); this.moveTo(this.w.top + line, this.w.left + col); }
  async tab(col) { await this.flushWord(); this.moveTo(this.w.line, this.w.left + col); }
  moveTo(line, col) {                                 // (7496)
    const w = this.w;
    if (line < w.top || line > w.top + w.hm1 || col < w.left || col > w.left + w.width - 1) {
      line = w.top; col = w.left;
    }
    w.col = col; w.line = line;
    this.skipSpace = false; this.wrapped = false;
  }
  async saveat() { await this.flushWord(); this.w.saveCol = this.w.col; this.w.saveLine = this.w.line; }
  async backat() { await this.flushWord(); this.moveTo(this.w.saveLine, this.w.saveCol); }
  colour(c) { return this.colourMap[c & 7] | (c & 8); }       // (70C4)
  async paper(c) { this.w.attr = (this.w.attr & 0x87) | ((this.colour(c) << 3) & 0x78); }
  async ink(c) { this.w.attr = (this.w.attr & 0x78) | ((this.colour(c) + 0x78) & 0x87); }
  async mode(m) { this.w.flags = (this.w.flags & 0xf8) | (m & 7); }
  async border(c) { this.borderColour = this.colour(c) & 7; this.changed(); }

  // Pone a cero los contadores de "Hay más..." de todas las ventanas (7415)
  resetMore(current = this.w.hm1) {
    for (const w of this.windows) w.more = w.hm1;
    this.w.more = current;
  }

  // ------------------------------------------------------- memoria de vídeo
  byteRange(w = this.w) {                             // (78AA)
    const first = (w.left * 6) >> 3, last = ((w.left + w.width) * 6 - 1) >> 3;
    return [first, last - first + 1];
  }
  clearLine(line) {
    const [first, n] = this.byteRange();
    const base = lineAddr(line);
    for (let r = 0; r < 8; r++) this.mem.fill(0, base + (r << 8) + first, base + (r << 8) + first + n);
    this.mem.fill(this.w.attr, 6144 + line * 32 + first, 6144 + line * 32 + first + n);
  }
  scroll() {                                          // (77C6)
    const w = this.w, [first, n] = this.byteRange();
    this.hiresHit(w.top, w.top + w.hm1);
    for (let l = w.top; l < w.top + w.hm1; l++) {
      const dst = lineAddr(l), src = lineAddr(l + 1);
      for (let r = 0; r < 8; r++) {
        const o = r << 8;
        this.mem.copyWithin(dst + o + first, src + o + first, src + o + first + n);
      }
      this.mem.copyWithin(6144 + l * 32 + first, 6144 + (l + 1) * 32 + first, 6144 + (l + 1) * 32 + first + n);
    }
    this.clearLine(w.top + w.hm1);
  }

  glyph(c) {                                          // (7710)
    const w = this.w;
    if (w.col === w.left + w.width) this.newline();
    const k = w.col & 3;
    const G = GLYPH[k];
    const base = lineAddr(w.line) + ((w.col >> 2) * 3) + G.inc;
    const [b0, b1] = this.xorMode ? [0xff, 0xff] : G.keep;
    const ch = (this.upper || (w.flags & 1) ? c | 0x80 : c) & 255;
    for (let r = 0; r < 8; r++) {
      const [h, l] = G.hl(this.charset[ch * 8 + r]);
      const a = base + (r << 8);
      this.mem[a] = (this.mem[a] & b0) ^ h;
      this.mem[a + 1] = (this.mem[a + 1] & b1) ^ l;
    }
    const at = 6144 + w.line * 32 + (base & 31);
    const m = this.maskT;                               // PO-ATTR con ATTR_T y MASK_T
    this.mem[at] = ((this.mem[at] ^ w.attr) & m) ^ w.attr;
    this.mem[at + 1] = ((this.mem[at + 1] ^ w.attr) & m) ^ w.attr;
    w.col++;
  }
  newline() {                                         // (76DF)
    const w = this.w;
    while (w.col !== w.left + w.width) this.glyph(32);
    if (w.line === w.top + w.hm1) this.scroll();
    else w.line++;
    w.col = w.left;
  }
  out(c) {                                            // (7685)
    this.drawCursor();
    if (c === 8) this.backspace();
    else if (c === 13) this.newline();
    else if (c) this.glyph(c);
    this.drawCursor();
  }
  backspace() {                                       // (76B4)
    const w = this.w;
    if (w.col !== w.left) { w.col--; return; }
    if (w.line === w.top) return;
    w.line--;
    w.col = w.left + w.width - 1;
  }
  drawCursor() {                                      // (76A2) en XOR: pintar dos veces lo borra
    if (!this.cursorOn) return;
    this.xorMode = true;
    this.glyph(0x5f);
    this.xorMode = false;
    this.backspace();      // como el original: si el cursor no cabía, ya saltó de línea
  }

  // Un carácter ya decidido; cuenta la línea si ha saltado (760F)
  async put(c) {
    this.out(c);
    this.wrapped = false;
    const w = this.w;
    if (w.col !== w.left) return;
    if (c === 32 && (w.flags & 0x40)) this.skipSpace = true;
    await this.countLine();
    this.wrapped = true;
  }
  async newlineCounted() { this.out(13); await this.countLine(); }   // (75AF)

  async countLine() {                                 // (75B4)
    const w = this.w;
    w.more = (w.more - 1) & 255;
    if (w.more !== 0) return;
    w.more = w.hm1;
    this.resetMore(w.hm1);
    if (w.flags & 2) return;
    // "Hay más...": se imprime sin ajuste de palabras, se espera y se borra
    const saved = w.flags;
    w.flags = 2;
    for (const ch of this.sysmsg(32)) await this.printChar(ch);
    w.flags = saved;
    await this.waitKey('more');
    while (w.col !== w.left) { this.out(8); this.out(32); this.out(8); }
  }

  async flushWord() {                                 // (7637)
    const w = this.w;
    if (!(w.flags & 0x40) || !this.word.length) return;
    const room = w.left + w.width - w.col;
    if (room === this.word.length) this.skipSpace = true;
    else if (room < this.word.length && w.col !== w.left) await this.newlineCounted();
    const word = this.word;
    this.word = [];
    for (const c of word) await this.put(c);
  }

  async printChar(ch) {                               // (74EF)
    const c = typeof ch === 'number' ? ch : daadCode(ch);
    const w = this.w;
    if (c === 13) {
      await this.flushWord();
      const was = this.wrapped;
      this.wrapped = false;
      if (!was) await this.newlineCounted();
      return;
    }
    if (c < 16) {
      if (c === 0x0b) await this.cls();
      else if (c === 0x0c) { await this.flushWord(); await this.waitKey('key'); }
      else if (c === 0x0e) this.upper = true;
      else if (c === 0x0f) this.upper = false;
      return;
    }
    if (!(w.flags & 0x40)) { await this.put(c); return; }
    if (c !== 32 && c !== 0xa0) {
      if (this.word.length === 40) await this.flushWord();
      this.skipSpace = false;
      this.word.push(c);
      return;
    }
    if (this.skipSpace) return;
    await this.flushWord();
    if (this.skipSpace) return;
    await this.put(c);
  }
  async print(s) { for (const ch of s) await this.printChar(ch); this.changed(); }

  // ------------------------------------------------------------ teclado
  async waitKey(reason) {
    this.changed();
    return this.getKey ? this.getKey(reason) : 32;
  }
  // ANYKEY: el texto (SM16) lo imprime el motor; aquí la espera (73B7)
  async anykey() {
    await this.flushWord();
    this.resetMore(this.w.hm1 + 1);
    await this.waitKey('anykey');
  }
  // Línea de órdenes (7100): eco en la ventana actual y cursor "_"
  // La rutina de entrada pone el contador de "Hay más..." a 80h antes de
  // escribir la señal (SM33): el salto de línea de "#n>" ya no cuenta.
  async promptStart() {
    await this.flushWord();
    this.w.more = 0x80;
    this.prompted = true;
  }
  async input(maxLen = 120) {
    if (!this.prompted) await this.promptStart();
    else await this.flushWord();
    this.prompted = false;
    let line = '';
    this.cursorOn = true;
    this.drawCursor();
    this.changed();
    for (;;) {
      const k = await this.waitKey('input');
      if (k === 13) { if (line.length) break; continue; }
      if (k === 12 || k === 8) {
        if (!line.length) continue;
        line = line.slice(0, -1);
        this.out(8); this.out(32); this.out(8);
      } else if (k >= 32 && line.length < maxLen) {
        line += String.fromCharCode(k);
        this.out(k);
      }
      this.changed();
    }
    this.drawCursor();
    // El original salta de línea con el cursor todavía puesto: el cursor se
    // pinta y se borra al principio de la línea siguiente y deja allí el
    // atributo del texto (el salto en sí lo escribe luego el motor)
    const w = this.w;
    if (w.line < w.top + w.hm1) {
      const [l0, c0] = [w.line, w.col];
      w.line++; w.col = w.left;
      this.drawCursor(); this.drawCursor();
      w.line = l0; w.col = c0;
    }
    this.cursorOn = false;
    this.resetMore(this.w.hm1);
    return line;
  }
}

const ES = 'ª¡¿«»áéíóúñÑçÇüÜ';
export function daadCode(ch) {
  const i = ES.indexOf(ch);
  if (i >= 0) return 16 + i;
  if (ch === '\n') return 13;
  if (ch === ' ') return 0x7f;
  const c = ch.charCodeAt(0);
  return c < 256 ? c : 63;
}

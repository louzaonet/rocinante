// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)
// Vista en el navegador de la pantalla de DAAD (DaadScreen): dibuja la memoria
// de vídeo del Spectrum en un canvas y lleva el teclado (también en móvil, con
// un campo de texto invisible encima de la pantalla).

const PAL = [[0, 0, 0], [0, 0, 0xd7], [0xd7, 0, 0], [0xd7, 0, 0xd7], [0, 0xd7, 0], [0, 0xd7, 0xd7], [0xd7, 0xd7, 0], [0xd7, 0xd7, 0xd7]];
const PALB = [[0, 0, 0], [0, 0, 0xff], [0xff, 0, 0], [0xff, 0, 0xff], [0, 0xff, 0], [0, 0xff, 0xff], [0xff, 0xff, 0], [0xff, 0xff, 0xff]];
export const ZX_PALETTE = { normal: PAL, bright: PALB };
const ES = 'ª¡¿«»áéíóúñÑçÇüÜ';

export class Stopped extends Error {}

export class ScreenView {
  // canvas: <canvas width=256 height=192>; frame: elemento del borde;
  // input: <input> invisible para el teclado del móvil
  constructor(screen, { canvas, frame, input, overlay }) {
    this.s = screen;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.img = this.ctx.createImageData(256, 192);
    this.frame = frame;
    this.input = input;
    this.overlay = overlay;          // canvas para dibujos en alta resolución (opcional)
    this.keys = [];                  // teclas pendientes
    this.waiter = null;
    this.flash = 0;
    this.dirty = true;
    this.hires = null;               // { image, rect } dibujo en alta resolución visible
    screen.onChange = () => { this.dirty = true; };
    screen.getKey = (why) => this.nextKey(why);
    this.bindKeys();
    this.alive = true;
    const tick = () => {
      if (!this.alive) return;
      this.flash++;
      if (this.flash % 16 === 0) this.dirty = true;
      if (this.dirty) this.render();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  destroy() {
    this.alive = false;
    this.unbind?.();
    if (this.rejecter) { const r = this.rejecter; this.waiter = this.rejecter = null; r(new Stopped()); }
  }

  render() {
    const m = this.s.mem, d = this.img.data, fl = (this.flash >> 4) & 1;
    for (let y = 0; y < 192; y++) {
      const a = ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);
      for (let cx = 0; cx < 32; cx++) {
        const at = m[6144 + (y >> 3) * 32 + cx];
        let b = m[a + cx];
        if (at & 0x80 && fl) b ^= 255;
        const pal = at & 0x40 ? PALB : PAL;
        const ink = pal[at & 7], pap = pal[(at >> 3) & 7];
        let i = (y * 256 + cx * 8) * 4;
        for (let bit = 0; bit < 8; bit++, i += 4) {
          const c = b & (0x80 >> bit) ? ink : pap;
          d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
        }
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
    // cursor parpadeante mientras se espera una orden (el original no lo dibuja)
    if (this.waiting === 'input' && fl === 0) {
      const w = this.s.w;
      this.ctx.fillStyle = '#d7d7d7';
      this.ctx.fillRect(w.col * 6, w.line * 8 + 7, 6, 1);
    }
    if (this.frame) this.frame.style.backgroundColor = `rgb(${PAL[this.s.borderColour & 7].join(',')})`;
    this.renderOverlay();
    this.dirty = false;
  }
  // Dibujo en alta resolución encima de la zona del dibujo de la localidad
  renderOverlay() {
    const o = this.overlay;
    if (!o) return;
    const ctx = o.getContext('2d');
    ctx.clearRect(0, 0, o.width, o.height);
    const h = this.s.hires;
    if (!h || !h.image) return;
    const sx = o.width / 256, sy = o.height / 192;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(h.image, h.x * sx, h.y * sy, h.w * sx, h.h * sy);
  }

  // ------------------------------------------------------------ teclado
  bindKeys() {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      let k = null;
      if (e.key === 'Enter') k = 13;
      else if (e.key === 'Backspace') k = 12;
      else if (e.key.length === 1) {
        const i = ES.indexOf(e.key);
        k = i >= 0 ? 16 + i : e.key.charCodeAt(0);
        if (k > 255) k = null;
      }
      if (k == null) return;
      e.preventDefault();
      this.push(k);
    };
    const target = this.input || this.canvas;
    target.addEventListener('keydown', onKey);
    // Teclados de móvil que no mandan keydown útiles: miramos el texto
    const onInput = () => {
      const v = this.input.value;
      this.input.value = '';
      for (const ch of v) {
        const i = ES.indexOf(ch);
        const k = i >= 0 ? 16 + i : ch.charCodeAt(0);
        if (k < 256) this.push(k);
      }
    };
    this.input?.addEventListener('input', onInput);
    const focus = () => (this.input || this.canvas).focus();
    this.canvas.parentElement?.addEventListener('click', focus);
    this.unbind = () => {
      target.removeEventListener('keydown', onKey);
      this.input?.removeEventListener('input', onInput);
      this.canvas.parentElement?.removeEventListener('click', focus);
    };
  }
  push(k) {
    if (this.waiter) { const w = this.waiter; this.waiter = null; w(k); }
    else this.keys.push(k);
  }
  // Teclas que se mandan solas (para "pegar" órdenes desde fuera)
  type(text) {
    for (const ch of text) { const i = ES.indexOf(ch); this.push(i >= 0 ? 16 + i : ch.charCodeAt(0)); }
    this.push(13);
  }
  nextKey(why) {
    this.dirty = true;
    this.waiting = why;
    if (!this.alive) return Promise.reject(new Stopped());
    if (this.keys.length) return Promise.resolve(this.keys.shift());
    return new Promise((res, rej) => {
      this.rejecter = rej;
      this.waiter = (k) => { this.waiting = null; this.rejecter = null; res(k); };
    });
  }
}

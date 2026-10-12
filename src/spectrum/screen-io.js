// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)
// Adaptador entre el motor DAAD y la pantalla de Spectrum (DaadScreen).
import { Painter } from '../gfx/drawstring.js';

export class ScreenIO {
  // pictures: dibujos del modelo por número (model.pictures)
  constructor(screen, pictures = []) {
    this.s = screen; this.pictures = pictures; this.last = null;
    // Dibujos vectoriales (cadenas de DAAD): se pintan con los colores de su
    // ventana; GOSUB llama a otros dibujos por número y TEXT y SHADE usan el
    // juego de caracteres
    const lib = Array.from({ length: pictures.length }, (_, i) => (pictures[i]?.drawstring ? { data: pictures[i].drawstring } : null));
    screen.drawstring = (pic) => {
      const n = pictures.indexOf(pic);
      const p = new Painter(screen.mem, lib, { kind: 'daad', charset: screen.charset });
      p.setColours(((pic.paper & 7) << 3) | (pic.ink & 7));
      p.run(n);
      screen.maskT = p.mask;
    };
  }
  picture(n) {
    const p = this.pictures[n];
    if (!p || p.location === false) return false;
    this.last = p;
    return true;
  }
  display(v) { return this.s.display(this.last, v); }
  print(t) { return this.s.print(t); }
  cls() { return this.s.cls(); }
  window(n) { return this.s.window(n); }
  winat(l, c) { return this.s.winat(l, c); }
  winsize(h, w) { return this.s.winsize(h, w); }
  centre() { return this.s.centre(); }
  printat(l, c) { return this.s.printat(l, c); }
  tab(c) { return this.s.tab(c); }
  saveat() { return this.s.saveat(); }
  backat() { return this.s.backat(); }
  paper(c) { return this.s.paper(c); }
  ink(c) { return this.s.ink(c); }
  border(c) { return this.s.border(c); }
  mode(m) { return this.s.mode(m); }
  prompt() { return this.s.promptStart(); }
  input() { return this.s.input(); }
  anykey() { return this.s.anykey(); }
}

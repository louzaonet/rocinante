// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)
// E/S del motor en el navegador: pantalla del Spectrum (ScreenIO) más partidas
// guardadas en localStorage, pausas, sonido y teclas sin esperar.
import { ScreenIO } from '../spectrum/screen-io.js';

export class WebIO extends ScreenIO {
  constructor(screen, pictures, view, { gameId = 'rocinante', onEnd } = {}) {
    super(screen, pictures);
    this.view = view;
    this.gameId = gameId;
    this.onEnd = onEnd;
    this.audio = null;
  }
  key(name) { return `rocinante:${this.gameId}:${name.toLowerCase()}`; }
  async save(name, state) {
    try { localStorage.setItem(this.key(name), JSON.stringify(state)); return true; } catch { return false; }
  }
  async load(name) {
    try { const v = localStorage.getItem(this.key(name)); return v ? JSON.parse(v) : null; } catch { return null; }
  }
  pause(ticks) { return new Promise((r) => setTimeout(r, ticks * 20)); }
  inkey() {
    const k = this.view.keys.shift();
    return k ?? null;
  }
  // BEEP duración(1/50 s) tono: el tono 48..238 son semitonos de dos en dos
  async beep(dur, tone) {
    try {
      this.audio ||= new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.audio;
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 65.4 * Math.pow(2, (tone - 48) / 24);
      g.gain.value = 0.05;
      osc.connect(g); g.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + dur / 50);
    } catch { /* sin sonido */ }
    await this.pause(dur);
  }
  async end() { this.onEnd?.(); }
}

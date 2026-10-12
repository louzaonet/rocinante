// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)
// Arranca una partida en un elemento de la página. Lo usan el editor (para
// probar) y las partidas publicadas.
import { Engine } from '../daad/engine.js';
import { DaadScreen } from '../spectrum/daadscreen.js';
import { ScreenView, Stopped } from '../web/view.js';
import { WebIO } from '../web/web-io.js';

const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// El modelo viaja en JSON: los mapas de bits en base64 y la imagen maestra
// como data URL.
export function serializeModel(model) {
  const b64 = (u) => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
  return {
    ...model,
    pictures: Array.from({ length: (model.pictures || []).length }, (_, i) => model.pictures[i]).map((p) => p && {
      ...p, image: undefined,
      zx: p.zx && { ...p.zx, pixels: b64(p.zx.pixels), attrs: b64(p.zx.attrs) },
    }),
  };
}
export function deserializeModel(m) {
  return {
    ...m,
    pictures: (m.pictures || []).map((p) => p && {
      ...p,
      zx: p.zx && { ...p.zx, pixels: typeof p.zx.pixels === 'string' ? fromB64(p.zx.pixels) : p.zx.pixels, attrs: typeof p.zx.attrs === 'string' ? fromB64(p.zx.attrs) : p.zx.attrs },
    }),
  };
}

export function startGame(root, model, { charset, hires = true, gameId = 'rocinante', trace, onTurn } = {}) {
  root.innerHTML = '';
  const frame = document.createElement('div');
  frame.className = 'zx-frame';
  const box = document.createElement('div');
  box.className = 'zx-screen';
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 192;
  canvas.className = 'zx-canvas';
  const overlay = document.createElement('canvas');
  overlay.width = 1024; overlay.height = 768;
  overlay.className = 'zx-overlay';
  const input = document.createElement('input');
  input.className = 'zx-input';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('autocapitalize', 'off');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('aria-label', model.language === 'en' ? 'Type your commands here' : 'Escribe aquí tus órdenes');
  box.append(canvas, overlay, input);
  frame.append(box);
  root.append(frame);

  // Imágenes maestras para la alta resolución
  for (const p of model.pictures || []) {
    if (p && p.master && hires) { const img = new Image(); img.src = p.master; p.image = img; img.onload = () => { view.dirty = true; }; }
    else if (p) p.image = null;
  }
  const screen = new DaadScreen({ charset, sysmsg: (n) => model.sysmsgs[n] ?? '' });
  const view = new ScreenView(screen, { canvas, frame, input, overlay: hires ? overlay : null });
  const io = new WebIO(screen, model.pictures || [], view, { gameId });
  const engine = new Engine(model, io, { trace });
  if (onTurn) {
    const orig = io.input.bind(io);
    io.input = async () => { onTurn(engine); const r = await orig(); return r; };
  }
  const ctl = { engine, screen, view, io, stopped: false, error: null };
  (async () => {
    for (;;) {
      try {
        await engine.run();
        // Fin de la partida: espera una tecla y vuelve a empezar
        screen.reset();
        await screen.print('\n');
        await view.nextKey('end');
      } catch (e) {
        if (e instanceof Stopped) return;
        ctl.error = e;
        console.error(e);
        try { await screen.print(`\n\n${e.message}\n`); } catch { /* nada */ }
        return;
      }
    }
  })();
  ctl.stop = () => { ctl.stopped = true; view.destroy(); };
  setTimeout(() => input.focus(), 50);
  return ctl;
}

// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)
// Página de una partida publicada: lee el juego de la propia página y lo arranca.
import { startGame, deserializeModel } from './run.js';

const data = JSON.parse(document.getElementById('juego').textContent);
const model = deserializeModel(data.model);
const charset = Uint8Array.from(atob(data.charset), (c) => c.charCodeAt(0));
const host = document.getElementById('pantalla');
const hiresBox = document.getElementById('alta');
let ctl = null;
function start() {
  ctl?.stop();
  ctl = startGame(host, model, { charset, hires: hiresBox ? hiresBox.checked : true, gameId: data.id });
}
hiresBox?.addEventListener('change', () => {
  try { localStorage.setItem('rocinante:' + data.id + ':alta', hiresBox.checked ? '1' : '0'); } catch { /* nada */ }
  start();
});
try { const v = localStorage.getItem('rocinante:' + data.id + ':alta'); if (v && hiresBox) hiresBox.checked = v === '1'; } catch { /* nada */ }
document.getElementById('reiniciar')?.addEventListener('click', start);
start();

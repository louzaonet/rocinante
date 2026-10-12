// Dibujos en mapa de bits: la plantilla con dos dibujos, en el motor JS y en
// el Spectrum 128K exportado (test/pictures.py compara las pantallas).
import fs from 'fs';
import { newProject } from '../src/project/template.js';
import { compileProject } from '../src/project/compile.js';
import { export128, export48 } from '../src/daad/export128.js';
import { snapshot128, snapshot48 } from '../src/spectrum/zxexport.js';
import { Engine } from '../src/daad/engine.js';
import { DaadScreen } from '../src/spectrum/daadscreen.js';
import { ScreenIO } from '../src/spectrum/screen-io.js';
import { defaultCharset } from '../src/spectrum/zxexport.js';
import { convertToZX } from '../src/gfx/zxconvert.js';

class End extends Error {}
const b64 = (u) => Buffer.from(u).toString('base64');
function synth(seed) {
  const W = 256, H = 96, d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4, r = Math.hypot(x - 80 - seed * 60, y - 50);
    d[i] = r < 30 ? 240 : (x * seed) & 255; d[i + 1] = y * 2; d[i + 2] = r < 30 ? 40 : 160; d[i + 3] = 255;
  }
  const zx = convertToZX(d, 32, 12);
  return { cx: 0, cy: 0, cw: 32, ch: 12, pixels: b64(zx.pixels), attrs: b64(zx.attrs) };
}
for (const lang of ['es', 'en']) {
const p = newProject('Dibujos', lang);
p.pictures = [{ id: 'dib_entrada', zx: synth(1) }, { id: 'dib_pasillo', zx: synth(2) }];
p.locations[1].picture = 'dib_entrada';
p.locations[2].picture = 'dib_pasillo';
fs.writeFileSync(`test/pic/proyecto${lang === 'es' ? '' : '_en'}.json`, JSON.stringify(p));
const { model, errors } = compileProject(p);
if (errors.length) { console.log(errors); process.exit(1); }
const cmds = lang === 'es' ? ['n', 'coger linterna', 's', 'n'] : ['n', 'get torch', 's', 'n'];
const n = lang === 'es' ? '' : '_en';
const x = export128(model);
fs.mkdirSync('test/pic', { recursive: true });
fs.writeFileSync(`test/pic/p128${n}.z80`, snapshot128(x.ddb, x.sdg, x.banks, model.language));
const y = export48(model);
if (y.included !== 2) throw new Error('48K: caben ' + y.included + ' dibujos');
fs.writeFileSync(`test/pic/p48${n}.z80`, snapshot48(y.ddb, y.sdg, model.language));
fs.writeFileSync(`test/pic/cmds${n}.txt`, cmds.join('\n') + '\n');
let cmd = null;
const screen = new DaadScreen({
  charset: defaultCharset(), sysmsg: (n) => model.sysmsgs[n] ?? '',
  getKey: async (why) => {
    if (why !== 'input') return 32;
    if (cmd === null) { if (!cmds.length) throw new End(); cmd = [...cmds.shift()].map((c) => c.charCodeAt(0)).concat([13]); }
    const k = cmd.shift(); if (!cmd.length) cmd = null; return k;
  },
});
try { await new Engine(model, new ScreenIO(screen, model.pictures)).run(); } catch (e) { if (!(e instanceof End)) throw e; }
fs.writeFileSync(`test/pic/js${n}.bin`, screen.mem);
console.log('DDB', x.ddb.length, 'bancos', JSON.stringify(x.stats.used));
}

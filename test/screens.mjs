// Compara la pantalla de nuestro motor (DaadScreen) con la del intérprete
// original: en cada espera de tecla que no sea la línea de órdenes y al final.
// Las pantallas del original las genera test/screens.py en test/scr/.
import fs from 'fs';
import path from 'path';
import { readDDB } from '../src/daad/ddb.js';
import { Engine } from '../src/daad/engine.js';
import { DaadScreen } from '../src/spectrum/daadscreen.js';
import { ScreenIO } from '../src/spectrum/screen-io.js';
import { defaultCharset } from '../src/spectrum/zxexport.js';

const dir = path.dirname(new URL(import.meta.url).pathname);
class End extends Error {}
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(path.join(dir, 'ref')).map((f) => f.replace('.txt', ''));
let bad = 0;
for (const name of names) {
  const model = readDDB(fs.readFileSync(path.join(dir, 'cases', name + '.ddb')));
  const cmds = fs.readFileSync(path.join(dir, 'cases', name + '.cmd'), 'utf8').split('\n').slice(0, -1);
  const shots = [];
  let cmd = null;
  const screen = new DaadScreen({
    charset: defaultCharset(),
    sysmsg: (n) => model.sysmsgs[n] ?? '',
    getKey: async (why) => {
      if (why !== 'input') { shots.push(screen.mem.slice()); return 32; }
      if (cmd === null) {
        if (!cmds.length) { shots.push(screen.mem.slice()); throw new End(); }
        cmd = [...cmds.shift()].map((c) => daad(c)).concat([13]);
      }
      const k = cmd.shift();
      if (!cmd.length) cmd = null;
      return k;
    },
  });
  const eng = new Engine(model, new ScreenIO(screen), { random: () => 50 });
  try { await eng.run(); } catch (e) { if (!(e instanceof End)) { console.log(name, e); } }
  const want = fs.readFileSync(path.join(dir, 'scr', name + '.bin'));
  const n = want.length / 6912;
  let firstBad = -1;
  for (let i = 0; i < Math.max(n, shots.length); i++) {
    const a = shots[i], b = want.subarray(i * 6912, (i + 1) * 6912);
    if (!a || b.length < 6912 || Buffer.compare(Buffer.from(a), Buffer.from(b)) !== 0) { firstBad = i; break; }
  }
  if (firstBad < 0) console.log('ok  ', name, shots.length, 'pantallas');
  else {
    bad++;
    console.log('FAIL', name, 'pantalla', firstBad, 'de', n, '(nuestras:', shots.length + ')');
    fs.writeFileSync(`/tmp/${name}.got.bin`, shots[firstBad] ?? new Uint8Array(6912));
    fs.writeFileSync(`/tmp/${name}.want.bin`, want.subarray(firstBad * 6912, (firstBad + 1) * 6912));
  }
}
function daad(ch) { const i = 'ª¡¿«»áéíóúñÑçÇüÜ'.indexOf(ch); return i >= 0 ? 16 + i : ch.charCodeAt(0); }
process.exit(bad ? 1 : 0);

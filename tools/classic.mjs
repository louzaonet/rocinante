// Importa un juego clásico y lo deja listo para compararlo con el original en
// el emulador (test/classic.py). Por cada parte del fichero escribe en la
// carpeta de salida:
//   N.mem     la memoria del original (64K)       N.ddb, N.sdg  la exportación a 48K
//   N.cmds    las órdenes (las de juego.txt junto al juego, si lo hay; si no,
//             órdenes al azar con su vocabulario)
//   N.js.txt  lo que sale con el motor JS         N.json        { version, report, free }
// Uso: node tools/classic.mjs juego.tzx carpeta [semilla de las órdenes al azar]
import fs from 'fs';
import { importClassic } from '../src/import/classic.js';
import { compileProject } from '../src/project/compile.js';
import { export48 } from '../src/daad/export128.js';
import { defaultCharset } from '../src/spectrum/zxexport.js';
import { Engine, spectrumRandom } from '../src/daad/engine.js';
import { TextIO, EndOfScript } from '../src/daad/io-text.js';

const [file, dir, seedArg] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const parts = await importClassic(new Uint8Array(fs.readFileSync(file)), file);
// órdenes al azar, siempre las mismas para el mismo juego
let seed = +(seedArg || 12345);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const own = file.replace(/\.[^.]+$/, '.txt');
for (const [k, part] of parts.entries()) {
  const { project, report, seed: seed0 = 0 } = await part.load();
  const { model, errors } = compileProject(project);
  if (errors.length) throw new Error('No compila: ' + errors[0].msg);
  const cs = project.settings.charset ? Uint8Array.from(atob(project.settings.charset), (c) => c.charCodeAt(0)) : defaultCharset();
  const x = export48(model, { charset: cs });
  let cmds;
  if (fs.existsSync(own)) cmds = fs.readFileSync(own, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  else {
    // se evitan las órdenes de grabar y cargar (piden un nombre) o acabar
    const skip = /^(GRABA|CARGA|SAVE|LOAD|FIN|RAM|ABAND|RINDO|QUIT|HELP|END)/;
    const verbs = project.vocab.filter((w) => w.type === 'verb' && w.value >= 14 && !skip.test(w.word)).map((w) => w.word.toLowerCase());
    const nouns = project.vocab.filter((w) => w.type === 'noun' && w.value >= 14).map((w) => w.word.toLowerCase());
    const dirs = project.vocab.filter((w) => w.value < 14 && (w.type === 'verb' || w.type === 'noun')).map((w) => w.word.toLowerCase());
    cmds = Array.from({ length: 150 }, () => (rnd() < 0.45 || !verbs.length ? pick(dirs) : `${pick(verbs)} ${pick(nouns)}`));
  }
  const io = new TextIO(cmds);
  // el mismo azar que el intérprete del emulador (SEED a 0; en una instantánea
  // de PAW, la que tenga)
  try { await new Engine(model, io, { random: spectrumRandom(seed0) }).run(); } catch (e) { if (!(e instanceof EndOfScript)) io.out += `\n{error ${e.message}}`; }
  if (part.mem) fs.writeFileSync(`${dir}/${k}.mem`, part.mem);     // (los de PAW no la traen)
  fs.writeFileSync(`${dir}/${k}.ddb`, x.ddb);
  fs.writeFileSync(`${dir}/${k}.sdg`, x.sdg);
  fs.writeFileSync(`${dir}/${k}.cmds`, cmds.join('\n') + '\n');
  fs.writeFileSync(`${dir}/${k}.js.txt`, io.out);
  // (prompts: los mensajes del sistema 2 a 5 y el 33, la línea de órdenes, para
  // quitarlos al comparar textos)
  fs.writeFileSync(`${dir}/${k}.json`, JSON.stringify({ version: part.version, label: part.label, report, free: x.free, prompts: [...model.sysmsgs.slice(2, 6), model.sysmsgs[33] ?? ''] }));
}
console.log(parts.length);

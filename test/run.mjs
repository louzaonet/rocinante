// Ejecuta los casos de test/cases con el motor JS y compara con test/ref.
// Uso: node test/run.mjs [caso ...] [-v]
import fs from 'fs';
import path from 'path';
import { readDDB } from '../src/daad/ddb.js';
import { Engine } from '../src/daad/engine.js';
import { TextIO, EndOfScript } from '../src/daad/io-text.js';

const dir = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const verbose = args.includes('-v');
let names = args.filter((a) => !a.startsWith('-'));
if (!names.length) names = fs.readdirSync(path.join(dir, 'ref')).map((f) => f.replace(/\.txt$/, ''));

// "Hay más..." depende de la geometría de la pantalla; se compara aparte.
// En inglés la petición de orden sale al azar entre cuatro (SM2 a SM5).
const norm = (s) => s.replace(/(Hay más|More)\.\.\.\{key\}/g, '').replace(/What (now|next|should I do now|should I do next)\?/g, '{prompt}');

let fails = 0;
for (const name of names) {
  const ddb = fs.readFileSync(path.join(dir, 'cases', name + '.ddb'));
  const cmds = fs.readFileSync(path.join(dir, 'cases', name + '.cmd'), 'utf8').split('\n').slice(0, -1);
  const io = new TextIO(cmds);
  const eng = new Engine(readDDB(ddb), io, { random: () => 50 });
  try { await eng.run(); } catch (e) { if (!(e instanceof EndOfScript)) { io.out += `\n{error ${e.message}}`; if (verbose) console.error(e); } }
  const got = norm(io.out), want = norm(fs.readFileSync(path.join(dir, 'ref', name + '.txt'), 'utf8'));
  if (got === want) { console.log('ok  ', name); continue; }
  fails++;
  // primera diferencia, con contexto
  let i = 0; while (i < got.length && got[i] === want[i]) i++;
  const lineStart = want.lastIndexOf('«', i);
  console.log('FAIL', name, 'en', i);
  console.log('--- esperado:\n' + want.slice(Math.max(0, lineStart), i + 200));
  console.log('--- obtenido:\n' + got.slice(Math.max(0, lineStart), i + 200));
  if (verbose) fs.writeFileSync(`/tmp/${name}.got.txt`, io.out);
}
process.exit(fails ? 1 : 0);

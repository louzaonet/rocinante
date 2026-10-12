// La plantilla de juego nuevo (castellano e inglés): compilar, jugar con el
// motor JS y exportar a .z80 (48K y 128K) para comparar con el intérprete
// original (test/template.py).
import fs from 'fs';
import { newProject } from '../src/project/template.js';
import { compileProject } from '../src/project/compile.js';
import { writeDDB } from '../src/daad/ddb-write.js';
import { export128 } from '../src/daad/export128.js';
import { snapshot48, snapshot128, buildSDG } from '../src/spectrum/zxexport.js';
import { Engine } from '../src/daad/engine.js';
import { TextIO, EndOfScript } from '../src/daad/io-text.js';
const CMDS = {
  es: ['mirar', 'i', 'coger linterna', 'n', 'coger linterna', 'cogela', 'i', 'dejar todo', 'coger todo y s', 'ex linterna',
    'punto', 'turno', 'xyzzy', 'o', 'ponerse linterna', 'abrir puerta', 'n. s. n. s', 'fin', 'n'],
  en: ['look', 'i', 'get torch', 'n', 'get torch', 'get it', 'i', 'drop all', 'get all and s', 'x torch',
    'score', 'turns', 'xyzzy', 'w', 'wear torch', 'open door', 'n. s. n. s', 'put torch in torch', 'quit', 'n'],
};
fs.mkdirSync('test/tpl', { recursive: true });
for (const lang of ['es', 'en']) {
  const cmds = CMDS[lang];
  const { model, errors } = compileProject(newProject(lang === 'es' ? 'Prueba' : 'Test', lang));
  if (errors.length) { console.log(errors); process.exit(1); }
  const io = new TextIO(cmds);
  try { await new Engine(model, io, { random: () => 0 }).run(); } catch (e) { if (!(e instanceof EndOfScript)) throw e; }
  const n = lang === 'es' ? '' : '_en';
  fs.writeFileSync(`test/tpl/js${n}.txt`, io.out);
  fs.writeFileSync(`test/tpl/cmds${n}.txt`, cmds.join('\n') + '\n');
  fs.writeFileSync(`test/tpl/t48${n}.z80`, snapshot48(writeDDB(model), buildSDG(), model.language));
  const x = export128(model);
  fs.writeFileSync(`test/tpl/t128${n}.z80`, snapshot128(x.ddb, buildSDG(), x.banks, model.language));
  console.log(io.out);
}

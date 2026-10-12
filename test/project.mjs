// Ida y vuelta: DDB -> modelo -> proyecto -> modelo. Los modelos deben coincidir.
import fs from 'fs';
import path from 'path';
import { readDDB } from '../src/daad/ddb.js';
import { decompileModel } from '../src/project/decompile.js';
import { compileProject } from '../src/project/compile.js';
const dir = path.dirname(new URL(import.meta.url).pathname);
let bad = 0;
for (const f of fs.readdirSync(path.join(dir, 'cases')).filter((f) => f.endsWith('.ddb'))) {
  const m = readDDB(fs.readFileSync(path.join(dir, 'cases', f)));
  const p = decompileModel(m);
  const { model, errors } = compileProject(p);
  const strip = (x) => JSON.stringify({ ...x, tokens: null, externs: null, machine: null, pictures: null });
  if (errors.length) { bad++; console.log('FAIL', f, errors.slice(0, 5)); continue; }
  if (strip(model) !== strip(m)) {
    bad++;
    for (const k of Object.keys(m)) if (JSON.stringify(m[k]) !== JSON.stringify(model[k])) console.log('FAIL', f, 'difiere', k, JSON.stringify(m[k]).slice(0, 200), '\n   ', JSON.stringify(model[k]).slice(0, 200));
    continue;
  }
  console.log('ok  ', f);
  if (f === 'objetos.ddb') fs.writeFileSync('/tmp/objetos.proyecto.json', JSON.stringify(p, null, 1));
}
process.exit(bad ? 1 : 0);

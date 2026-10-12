// Lee cada DDB de prueba (compilado con DRC), lo vuelve a escribir con
// nuestro generador y lo deja en test/rt/ para ejecutarlo en el intérprete
// original (test/roundtrip.py compara con las referencias).
import fs from 'fs';
import path from 'path';
import { readDDB } from '../src/daad/ddb.js';
import { writeDDB } from '../src/daad/ddb-write.js';
const dir = path.dirname(new URL(import.meta.url).pathname);
for (const f of fs.readdirSync(path.join(dir, 'cases')).filter((f) => f.endsWith('.ddb'))) {
  const orig = fs.readFileSync(path.join(dir, 'cases', f));
  const model = readDDB(orig);
  const t0 = Date.now();
  const out = writeDDB(model);
  fs.writeFileSync(path.join(dir, 'rt', f), out);
  // releer y comparar el modelo
  const again = readDDB(out);
  const strip = (m) => JSON.stringify({ ...m, tokens: null });
  console.log(f, orig.length, '->', out.length, 'bytes', Date.now() - t0, 'ms', strip(model) === strip(again) ? 'modelo igual' : 'MODELO DISTINTO');
}

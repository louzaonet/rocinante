// Exporta los casos de prueba en modo 128K (textos en bancos) a test/x128/
import fs from 'fs';
import path from 'path';
import { readDDB } from '../src/daad/ddb.js';
import { export128 } from '../src/daad/export128.js';
const dir = path.dirname(new URL(import.meta.url).pathname);
fs.mkdirSync(path.join(dir, 'x128'), { recursive: true });
for (const f of fs.readdirSync(path.join(dir, 'cases')).filter((f) => f.endsWith('.ddb'))) {
  const r = export128(readDDB(fs.readFileSync(path.join(dir, 'cases', f))));
  const n = f.replace(/\.ddb$/, '');
  fs.writeFileSync(path.join(dir, 'x128', n + '.ddb'), r.ddb);
  for (const [b, data] of Object.entries(r.banks)) fs.writeFileSync(path.join(dir, 'x128', `${n}.bank${b}`), data);
  console.log(n, 'DDB', r.ddb.length, 'bancos', JSON.stringify(r.stats.used), 'texto más largo', r.stats.longest);
}

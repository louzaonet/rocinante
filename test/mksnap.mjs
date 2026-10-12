// Genera instantáneas .z80 (48K y 128K) de los casos de prueba.
import fs from 'fs';
import path from 'path';
import { readDDB } from '../src/daad/ddb.js';
import { writeDDB } from '../src/daad/ddb-write.js';
import { export128 } from '../src/daad/export128.js';
import { snapshot48, snapshot128, buildSDG } from '../src/spectrum/zxexport.js';
const dir = path.dirname(new URL(import.meta.url).pathname);
for (const f of fs.readdirSync(path.join(dir, 'cases')).filter((f) => f.endsWith('.ddb'))) {
  const n = f.replace(/\.ddb$/, '');
  const model = readDDB(fs.readFileSync(path.join(dir, 'cases', f)));
  fs.writeFileSync(path.join(dir, 'z80', n + '_48.z80'), snapshot48(writeDDB(model), buildSDG(), model.language));
  const x = export128(model);
  fs.writeFileSync(path.join(dir, 'z80', n + '_128.z80'), snapshot128(x.ddb, buildSDG(), x.banks, model.language));
  console.log(n);
}

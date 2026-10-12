// Cintas .tap de la plantilla (castellano e inglés, 48K y 128K) y del caso de
// dibujos (128K con bancos). test/tapes.py las carga en el emulador y compara
// con lo que da el motor JS (test/tpl y test/pic).
import fs from 'fs';
import { newProject } from '../src/project/template.js';
import { compileProject } from '../src/project/compile.js';
import { writeDDB } from '../src/daad/ddb-write.js';
import { export128, export48 } from '../src/daad/export128.js';
import { buildSDG } from '../src/spectrum/zxexport.js';
import { tape48, tape128, tapToTzx, tapToWav } from '../src/spectrum/zxtap.js';
import os from 'os';
import path from 'path';
fs.mkdirSync('test/tap', { recursive: true });
for (const lang of ['es', 'en']) {
  const { model } = compileProject(newProject(lang === 'es' ? 'Prueba' : 'Test', lang));
  const n = lang === 'es' ? '' : '_en';
  fs.writeFileSync(`test/tap/t48${n}.tap`, tape48('Prueba', writeDDB(model), buildSDG(), lang));
  const x = export128(model);
  fs.writeFileSync(`test/tap/t128${n}.tap`, tape128('Prueba', x.ddb, buildSDG(), x.banks, lang));
}
// el caso de dibujos: reutiliza el proyecto que guarda test/pictures.mjs
for (const n of ['', '_en']) {
  const p = JSON.parse(fs.readFileSync(`test/pic/proyecto${n}.json`, 'utf8'));
  const { model } = compileProject(p);
  const x = export128(model);
  fs.writeFileSync(`test/tap/p128${n}.tap`, tape128('Dibujos', x.ddb, x.sdg, x.banks, model.language));
  const y = export48(model);
  fs.writeFileSync(`test/tap/p48${n}.tap`, tape48('Dibujos', y.ddb, y.sdg, model.language));
}
// .tzx de todas, y .wav (en una carpeta temporal: son varios MB) de dos
for (const f of fs.readdirSync('test/tap').filter((f) => f.endsWith('.tap'))) {
  const tap = new Uint8Array(fs.readFileSync(`test/tap/${f}`));
  fs.writeFileSync(`test/tap/${f.replace('.tap', '.tzx')}`, tapToTzx(tap, { title: 'Prueba', author: 'Rocinante' }));
}
const wavDir = path.join(os.tmpdir(), 'rocinante-wav');
fs.mkdirSync(wavDir, { recursive: true });
for (const f of ['t48', 'p128_en']) fs.writeFileSync(path.join(wavDir, `${f}.wav`), tapToWav(new Uint8Array(fs.readFileSync(`test/tap/${f}.tap`))));
console.log('cintas:', fs.readdirSync('test/tap').join(' '), '| audio en', wavDir);

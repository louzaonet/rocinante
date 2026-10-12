// Importa un juego de PAW y pinta cada dibujo de localidad ya convertido a
// DAAD (como lo pinta la versión web y el intérprete). Lo usa pawcheck.py.
// Uso: node tools/pawrender.mjs juego.z80 carpeta
import fs from 'fs';
import { importPAW } from '../src/paw/import.js';
import { numberPictures } from '../src/project/compile.js';
import { paint } from '../src/gfx/vector.js';
import { defaultCharset } from '../src/spectrum/zxexport.js';

const [file, dir] = process.argv.slice(2);
const { project, report } = importPAW(new Uint8Array(fs.readFileSync(file)), file);
const cs = project.settings.charset ? Uint8Array.from(atob(project.settings.charset), (c) => c.charCodeAt(0)) : defaultCharset();
const { slots } = numberPictures(project);
const lib = slots.map((x) => (x?.drawstring ? { data: x.drawstring } : null));
fs.mkdirSync(dir, { recursive: true });
const done = [];
for (const pic of project.pictures || []) {
  if (!pic.location || !Number.isInteger(pic.number) || pic.number >= project.locations.length) continue;
  const { mem } = paint(lib, pic.number, { ...pic, line: 0, height: 24 }, { charset: cs });
  fs.writeFileSync(`${dir}/daad_${pic.number}.scr`, mem);
  done.push(pic.number);
}
console.log(JSON.stringify({ report, pictures: done, rows: project.settings.textTop }));

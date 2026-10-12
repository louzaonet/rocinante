// Genera src/c64/c64base.js a partir de ref/c64: el cargador (boot.prg), los
// intérpretes DAAD de Commodore 64 (sdi64 en español, edi64 en inglés; dominio
// público, del repositorio github.com/daad-adventure-writer/DAAD) y el juego
// de caracteres de su base de gráficos (apart1.prg). Los .prg van enteros, con
// su dirección de carga delante.
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const read = (f) => fs.readFileSync(root + 'ref/c64/' + f);
const b64 = (u) => Buffer.from(u).toString('base64');
const g = read('apart1.prg');
const org = g[0] | (g[1] << 8), at = (a) => g[2 + a - org], w = (a) => at(a) | (at(a + 1) << 8);
const cs = g.subarray(2 + w(0xcbf7) - org, 2 + w(0xcbf7) - org + 2048);
const out = `// Generado por tools/mkc64base.mjs. Cargador e intérpretes DAAD de Commodore 64
// (dominio público), como ficheros .prg, y el juego de caracteres de su base
// de gráficos.
export const C64_BOOT = '${b64(read('boot.prg'))}';
export const C64_INTERPRETER = { es: '${b64(read('sdi64.prg'))}', en: '${b64(read('edi64.prg'))}' };
export const C64_CHARSET = '${b64(cs)}';
`;
fs.writeFileSync(root + 'src/c64/c64base.js', out);
console.log('src/c64/c64base.js', out.length);

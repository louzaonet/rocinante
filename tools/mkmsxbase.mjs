// Genera src/msx/msxbase.js a partir de ref/msx: los intérpretes DAAD de MSX
// (MSXSDI.Z80 en español, MSXEDI.Z80 en inglés; dominio público, del
// repositorio github.com/daad-adventure-writer/DAAD), que se cargan en B000h.
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const b64 = (f) => fs.readFileSync(root + 'ref/msx/' + f).toString('base64');
const out = `// Generado por tools/mkmsxbase.mjs. Intérpretes DAAD de MSX (dominio público).
export const MSX_INTERPRETER = { es: '${b64('MSXSDI.Z80')}', en: '${b64('MSXEDI.Z80')}' };
`;
fs.writeFileSync(root + 'src/msx/msxbase.js', out);
console.log('src/msx/msxbase.js', out.length);

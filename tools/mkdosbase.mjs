// Genera src/dos/dosbase.js a partir de ref/dos: los intérpretes DAAD de PC
// (INTSM1.EXE en español, INTEM1.EXE en inglés; dominio público, del
// repositorio github.com/daad-adventure-writer/DAAD). Son los de dibujos de
// varias máquinas (PART1.DAT) y aceptan VGA, EGA y CGA.
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const b64 = (f) => fs.readFileSync(root + 'ref/dos/' + f).toString('base64');
const out = `// Generado por tools/mkdosbase.mjs. Intérpretes DAAD de PC (dominio público).
export const DOS_INTERPRETER = { es: '${b64('INTSM1.EXE')}', en: '${b64('INTEM1.EXE')}' };
`;
fs.writeFileSync(root + 'src/dos/dosbase.js', out);
console.log('src/dos/dosbase.js', out.length);

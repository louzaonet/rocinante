// Genera src/m68k/m68kbase.js a partir de ref/atari y ref/amiga: los
// intérpretes DAAD de Atari ST (SDI1.PRG en español, EDI1.PRG en inglés) y de
// Amiga (sdi1 y edi1), de dominio público, del repositorio
// github.com/daad-adventure-writer/DAAD, y la cabecera de 128 bytes de su
// juego de caracteres (PART1.CHR, el mismo en las dos máquinas).
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const read = (f) => fs.readFileSync(root + 'ref/' + f);
const b64 = (u) => Buffer.from(u).toString('base64');
const out = `// Generado por tools/mkm68kbase.mjs. Intérpretes DAAD de Atari ST y Amiga
// (dominio público) y la cabecera de su juego de caracteres (PART1.CHR).
export const ST_INTERPRETER = { es: '${b64(read('atari/SDI1.PRG'))}', en: '${b64(read('atari/EDI1.PRG'))}' };
export const AMIGA_INTERPRETER = { es: '${b64(read('amiga/sdi1'))}', en: '${b64(read('amiga/edi1'))}' };
export const CHR_HEADER = '${b64(read('atari/PART1.CHR').subarray(0, 128))}';
`;
fs.writeFileSync(root + 'src/m68k/m68kbase.js', out);
console.log('src/m68k/m68kbase.js', out.length);

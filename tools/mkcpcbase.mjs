// Genera src/cpc/cpcbase.js a partir de ref/cpc: los intérpretes DAAD de CPC
// (DCPCIS en español, DCPCIE en inglés; dominio público, del repositorio
// github.com/daad-adventure-writer/DAAD) y el juego de caracteres de su base
// de gráficos vacía (GFX.BIN). Se guardan sin la cabecera AMSDOS.
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const body = (f) => fs.readFileSync(root + 'ref/cpc/' + f).subarray(128);
const b64 = (u) => Buffer.from(u).toString('base64');
const gfx = body('GFX.BIN');
const out = `// Generado por tools/mkcpcbase.mjs. Intérpretes DAAD de Amstrad CPC (dominio
// público): se cargan en 0840h. Juego de caracteres de su base de gráficos.
export const CPC_INTERPRETER = { es: '${b64(body('DCPCIS.Z80'))}', en: '${b64(body('DCPCIE.Z80'))}' };
export const CPC_CHARSET = '${b64(gfx.subarray(48, 48 + 2048))}';
`;
fs.writeFileSync(root + 'src/cpc/cpcbase.js', out);
console.log('src/cpc/cpcbase.js', out.length);

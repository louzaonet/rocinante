// Lista los textos de la interfaz que no tienen traducción en src/i18n-en.js.
// Uso: node tools/i18n-check.mjs
import fs from 'fs';
import path from 'path';
const root = new URL('../src/', import.meta.url).pathname;
const files = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(js|jsx)$/.test(f)) files.push(p); } };
walk(root);
const keys = new Set();
const lit = /\bt\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(lit)) keys.add(eval(m[1]));
}
// Textos que se traducen a través de una tabla
const { DYNAMIC } = await import(new URL('../src/i18n-en.js', import.meta.url));
for (const k of DYNAMIC || []) keys.add(k);
const { EN } = await import(new URL('../src/i18n-en.js', import.meta.url));
const missing = [...keys].filter((k) => !(k in EN));
const unused = Object.keys(EN).filter((k) => !keys.has(k));
console.log(JSON.stringify(missing, null, 1));
if (unused.length) console.log('sin usar:', JSON.stringify(unused, null, 1));
console.log(keys.size, 'textos,', missing.length, 'sin traducir');
process.exit(missing.length ? 1 : 0);

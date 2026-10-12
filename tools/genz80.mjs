// Ensambla con pasmo las rutinas en Z80 y las pasa a módulos JS:
//   z80/xbank.asm   -> src/daad/xbank-bin.js (una versión por intérprete)
//   z80/tapload.asm -> src/spectrum/tapload-bin.js
//   z80/msxcart.asm, msxmover.asm, msxhooks.asm -> src/msx/msxload-bin.js
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
const dir = new URL('../z80/', import.meta.url).pathname;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'z80-'));
const asm = (src, equ = []) => {
  const bin = path.join(tmp, 'out.bin');
  execFileSync('pasmo', [...equ.flatMap((e) => ['--equ', e]), dir + src, bin]);
  return fs.readFileSync(bin);
};
const js = (b) => `Uint8Array.from([${[...b].join(',')}])`;

const xb = {
  ES: asm('xbank.asm', ['LANG_EN=0', 'MODE48=0']), EN: asm('xbank.asm', ['LANG_EN=1', 'MODE48=0']),
  PIC48_ES: asm('xbank.asm', ['LANG_EN=0', 'MODE48=1']), PIC48_EN: asm('xbank.asm', ['LANG_EN=1', 'MODE48=1']),
};
fs.writeFileSync(new URL('../src/daad/xbank-bin.js', import.meta.url),
  '// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)\n' +
  '// Generado por tools/genz80.mjs a partir de z80/xbank.asm (ensamblado en 843Ch).\n' +
  '// XBANK_*: 128K (textos y dibujos en bancos); XBANK_PIC48_*: 48K (solo dibujos).\n' +
  Object.entries(xb).map(([n, b]) => `export const XBANK_${n} = ${js(b)};\n`).join(''));
const tl = asm('tapload.asm');
fs.writeFileSync(new URL('../src/spectrum/tapload-bin.js', import.meta.url),
  '// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)\n' +
  '// Generado por tools/genz80.mjs a partir de z80/tapload.asm (ensamblado en 5E00h).\n' +
  `export const TAPLOAD_ORG = 0x5e00;\nexport const TAPLOAD = ${js(tl)};\n`);
const mover = asm('msxmover.asm');
if (mover.length > 0x100) throw new Error('msxmover no cabe antes de 0100h');
const cart = asm('msxcart.asm', [`MOVERLEN=${mover.length}`]);
// los ganchos se ensamblan en 0000h y en 0100h: los bytes que cambian son los
// altos de las direcciones que hay que recolocar
const hookAsm = (flag, org) => asm('msxhooks.asm', [`FLAG=${flag}`, `BASE=${org}`]);
const hooks = { es: hookAsm('0D053h', 0), en: hookAsm('0CFBEh', 0) };
const moved = hookAsm('0D053h', 256);
const reloc = [...hooks.es].flatMap((b, i) => (moved[i] !== b ? [i - 1] : []));
// el segundo gancho empieza en el segundo push hl, push de, push bc; la
// interrupción, en el tercero
const toram = hooks.es.indexOf(Buffer.from([0xe5, 0xd5, 0xc5]), 1);
const irq = hooks.es.indexOf(Buffer.from([0xf5, 0xc5, 0xd5, 0xe5]));
fs.mkdirSync(new URL('../src/msx/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../src/msx/msxload-bin.js', import.meta.url),
  '// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)\n' +
  '// Generado por tools/genz80.mjs a partir de z80/msxcart.asm (4000h), msxmover.asm\n' +
  '// (va detrás del arranque en la ROM y se ejecuta en 0000h) y msxhooks.asm (los\n' +
  '// ganchos de la página 0, ensamblados en 0000h: MSX_HOOK_RAM y MSX_HOOK_IRQ son\n' +
  '// dónde empiezan el que pone la RAM y la interrupción, y MSX_HOOK_RELOC las\n' +
  '// direcciones de 2 bytes a las que hay que sumar dónde se copian).\n' +
  `export const MSX_CART = ${js(Buffer.concat([cart, mover]))};\n` +
  `export const MSX_HOOKS = { es: ${js(hooks.es)}, en: ${js(hooks.en)} };\n` +
  `export const MSX_HOOK_RAM = ${toram}, MSX_HOOK_IRQ = ${irq};\n` +
  `export const MSX_HOOK_RELOC = [${reloc.join(', ')}];\n`);
console.log('msx: arranque', cart.length, 'bytes, copiador', mover.length, 'bytes, ganchos', hooks.es.length, 'bytes');
fs.rmSync(tmp, { recursive: true });
console.log('xbank', xb.ES.length, 'bytes; xbank 48K', xb.PIC48_ES.length, 'bytes; tapload', tl.length, 'bytes');

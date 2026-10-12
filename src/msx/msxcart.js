// Cartucho de MSX (.rom, mapper ASCII16) con el intérprete DAAD original. El
// arranque (z80/msxcart.asm y msxmover.asm) hace lo que hacía LOADMSX1.COM
// bajo MSX-DOS, sin DOS: deja RAM en las cuatro páginas, copia todo a su sitio
// y arranca el intérprete. Memoria al empezar la partida:
//   0100h  base de datos (PART1.DDB)
//          ...
//          ganchos de cambio de slot (z80/msxhooks.asm)
//          512 bytes de trabajo del intérprete
//          base de gráficos (DAAD.MDG), que acaba en B000h
//   0038h  salto a la rutina de interrupción de los ganchos
//   B000h  intérprete, parcheado como lo parcheaba el cargador original:
//          llama a los ganchos para tener la BIOS en la página 0, usa el
//          modo de interrupción 1 y sabe dónde está la zona de trabajo
// Los dos intérpretes tienen las mismas rutinas en sitios distintos; el
// segundo byte (3Ah en el inglés) los distingue, como en el cargador.

import { MSX_CART, MSX_HOOKS, MSX_HOOK_RAM, MSX_HOOK_IRQ, MSX_HOOK_RELOC } from './msxload-bin.js';

const DDB_AT = 0x100, INTERP_AT = 0xb000, BANK = 0x4000, STACK = 0xf000;
const TABLE_MAX = 512;

const PATCHES = {
  es: { di: 0xcf8f, call1: 0xcf84, call2: 0xcf90, ei: 0xcf87, ret1: 0xcf88, ret2: 0xcf93, im: 0xd026, flag: 0xd053, entry: 0xcff3,
    work: [0xc453, 0xc465, 0xc50c, 0xc522, 0xc53b, 0xc54f, 0xc649, 0xccf7, 0xcd1b], work1: [0xc687] },
  en: { di: 0xcefa, call1: 0xceef, call2: 0xcefb, ei: 0xcef2, ret1: 0xcef3, ret2: 0xcefe, im: 0xcf91, flag: 0xcfbe, entry: 0xcf5e,
    work: [0xc3c0, 0xc3d2, 0xc479, 0xc48f, 0xc4a8, 0xc4bc, 0xc5b6, 0xcc64, 0xcc88], work1: [0xc5f4] },
};

// Espacio para la base de datos y los gráficos: devuelve las direcciones o
// lo que falta
export function msxLayout(ddbLen, mdgLen) {
  const mdg = INTERP_AT - mdgLen;
  const work = mdg - 0x200;
  const hooks = work - MSX_HOOKS.es.length;
  return { mdg, work, hooks, free: hooks - (DDB_AT + ddbLen) };
}

// interpreter: el de su idioma, tal cual (MSXSDI o MSXEDI)
export function buildCartridge({ interpreter, mdg, ddb }) {
  const lang = interpreter[1] === 0x3a ? 'en' : 'es';
  const P = PATCHES[lang];
  const L = msxLayout(ddb.length, mdg.length);
  if (L.free < 0) throw Object.assign(new Error('msx-full'), { missing: -L.free });
  // los ganchos, recolocados donde van
  const hooks = Uint8Array.from(MSX_HOOKS[lang]);
  for (const r of MSX_HOOK_RELOC) {
    const v = (hooks[r] | (hooks[r + 1] << 8)) + L.hooks;
    hooks[r] = v & 255; hooks[r + 1] = v >> 8;
  }
  const toBios = L.hooks, toRam = L.hooks + MSX_HOOK_RAM, irq = L.hooks + MSX_HOOK_IRQ;

  const it = Uint8Array.from(interpreter);
  const set = (a, v) => { it[a - INTERP_AT] = v; };
  const w16 = (a, v) => { set(a, v & 255); set(a + 1, v >> 8); };
  set(P.di, 0xf3); set(P.call1, 0xcd); set(P.call2, 0xcd); set(P.ei, 0xfb); set(P.ret1, 0xc9); set(P.ret2, 0xc9);
  w16(P.call1 + 1, toBios); w16(P.call2 + 1, toRam);
  set(P.im, 0x56);                       // IM 1 en lugar de IM 2
  for (const a of P.work) w16(a, L.work);
  // el relleno (FILL) prepara una tabla de líneas en la zona de trabajo y la
  // recorre desde su segundo byte; el cargador original no movía esa segunda
  // referencia, que se quedaba leyendo la tabla en su sitio de antes, sin
  // preparar (y el relleno se paraba en la primera línea)
  for (const a of P.work1) w16(a, L.work + 1);
  set(P.flag, 0xff);                     // al empezar, RAM en la página 0

  // datos en la ROM, detrás del arranque y la tabla
  const files = [
    { dest: INTERP_AT, data: it },
    { dest: L.mdg, data: mdg },
    { dest: DDB_AT, data: ddb },
    { dest: L.hooks, data: hooks },
  ];
  let at = MSX_CART.length + TABLE_MAX;
  const pieces = [];
  for (const f of files) {
    for (let i = 0; i < f.data.length;) {
      const src = at + i, dest = f.dest + i;
      // ningún trozo cruza un banco de la ROM ni una página de la RAM
      const n = Math.min(f.data.length - i, BANK - (src % BANK), BANK - (dest % BANK));
      pieces.push({ bank: Math.floor(src / BANK), src: src % BANK, dest, len: n });
      i += n;
    }
    f.at = at;
    at += f.data.length;
  }
  // 128 KB como mínimo, para que los emuladores reconozcan el mapper
  let size = 0x20000;
  while (size < at) size *= 2;
  const rom = new Uint8Array(size).fill(0xff);
  rom.set(MSX_CART, 0);
  const table = [P.entry & 255, P.entry >> 8, STACK & 255, STACK >> 8, irq & 255, irq >> 8];
  for (const p of pieces) table.push(p.bank, p.src & 255, p.src >> 8, p.dest & 255, p.dest >> 8, p.len & 255, p.len >> 8);
  table.push(0, 0, 0, 0, 0, 0, 0);
  if (table.length > TABLE_MAX) throw new Error('tabla de trozos demasiado larga');
  rom.set(table, MSX_CART.length);
  for (const f of files) rom.set(f.data, f.at);
  return { rom, layout: L, lang };
}

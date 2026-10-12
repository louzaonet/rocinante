// Escritura de instantáneas .z80 (versión 3) para Spectrum 48K y 128K.
//
// state = {
//   machine: '48' | '128',
//   regs: { a, f, bc, de, hl, a_, f_, bc_, de_, hl_, ix, iy, sp, pc, i, r, iff, im },
//   border: 0..7,
//   out7ffd: valor del puerto 7FFDh (128K),
//   ram48: Uint8Array(49152)           (48K: 4000h-FFFFh)
//   banks: [Uint8Array(16384) x 8]     (128K)
// }

export function writeZ80(st) {
  const r = st.regs;
  const h = new Uint8Array(30 + 2 + 54);
  const w16 = (o, v) => { h[o] = v & 255; h[o + 1] = (v >> 8) & 255; };
  h[0] = r.a; h[1] = r.f;
  w16(2, r.bc); w16(4, r.hl);
  w16(6, 0);                           // PC = 0: hay cabecera adicional
  w16(8, r.sp);
  h[10] = r.i; h[11] = r.r & 0x7f;
  h[12] = ((r.r >> 7) & 1) | ((st.border & 7) << 1);
  w16(13, r.de); w16(15, r.bc_); w16(17, r.de_); w16(19, r.hl_);
  h[21] = r.a_; h[22] = r.f_;
  w16(23, r.iy); w16(25, r.ix);
  h[27] = r.iff ? 1 : 0; h[28] = r.iff ? 1 : 0;
  h[29] = r.im & 3;
  w16(30, 54);
  w16(32, r.pc);
  h[34] = st.machine === '128' ? 4 : 0;
  h[35] = st.machine === '128' ? st.out7ffd ?? 0x10 : 0;
  h[38] = 0x0e;                        // último registro AY seleccionado
  // El resto de la cabecera adicional queda a cero (ROM normal, sin periféricos)

  const blocks = [];
  const page = (num, data) => {
    const c = compress(data);
    const hdr = new Uint8Array(3);
    if (c.length < 16384) { hdr[0] = c.length & 255; hdr[1] = c.length >> 8; blocks.push(hdr, c); }
    else { hdr[0] = 0xff; hdr[1] = 0xff; blocks.push(hdr, data); }
    hdr[2] = num;
  };
  if (st.machine === '128') {
    for (let b = 0; b < 8; b++) page(b + 3, st.banks[b]);
  } else {
    const m = st.ram48;
    page(8, m.subarray(0x0000, 0x4000));   // 4000h-7FFFh
    page(4, m.subarray(0x4000, 0x8000));   // 8000h-BFFFh
    page(5, m.subarray(0x8000, 0xc000));   // C000h-FFFFh
  }
  const total = h.length + blocks.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  out.set(h, 0);
  let o = h.length;
  for (const b of blocks) { out.set(b, o); o += b.length; }
  return out;
}

// Compresión del formato .z80: rachas de 5 o más bytes iguales (o de 2 o más
// EDh) como ED ED n b. Un byte que sigue a un ED suelto no se comprime.
function compress(data) {
  const out = [];
  let i = 0;
  while (i < data.length) {
    const b = data[i];
    let n = 1;
    while (i + n < data.length && data[i + n] === b && n < 255) n++;
    if ((n >= 5) || (b === 0xed && n >= 2)) {
      out.push(0xed, 0xed, n, b);
      i += n;
    } else {
      out.push(b);
      i++;
      if (b === 0xed && i < data.length) { out.push(data[i]); i++; }
    }
  }
  return Uint8Array.from(out);
}

// Disquetes con sistema de ficheros FAT12 (el de MS-DOS, que también lee el
// TOS del Atari ST). Solo ficheros en la raíz, con nombres 8.3.
//
// Sector 0: arranque con la tabla de parámetros del disco (BPB, con el byte
// bajo primero); luego dos copias de la FAT, el directorio raíz (entradas de
// 32 bytes) y los datos en grupos de sectores.

const BS = 512, RES = 1, NFATS = 2;
// Atari ST: doble cara, 80 pistas de 9 sectores (720K), grupos de 1 KB
export const ST_720K = { sectors: 1440, spc: 2, rootEntries: 112, spf: 3, spt: 9, media: 0xf9, atari: true };
// PC: 3,5" de alta densidad, 80 pistas de 18 sectores (1,44 MB)
export const PC_1440K = { sectors: 2880, spc: 1, rootEntries: 224, spf: 9, spt: 18, media: 0xf0 };

// Nombre de 8.3 en mayúsculas, rellenado con espacios
function name83(name) {
  const up = name.toUpperCase();
  const dot = up.lastIndexOf('.');
  const base = (dot < 0 ? up : up.slice(0, dot)).slice(0, 8).padEnd(8);
  const ext = (dot < 0 ? '' : up.slice(dot + 1)).slice(0, 3).padEnd(3);
  return Array.from(base + ext, (c) => c.charCodeAt(0));
}

// files: [{ name: 'PART1.DDB', data }]; g: geometría (ST_720K o PC_1440K)
export function writeFAT12(files, g, { label = 'DAAD', serial = 0x524f43 } = {}) {
  const { sectors: SECTORS, spc: SPC, rootEntries: ROOT_ENTRIES, spf: SPF, spt, media } = g;
  const ROOT_SECTORS = ROOT_ENTRIES * 32 / BS;
  const DATA_START = RES + NFATS * SPF + ROOT_SECTORS;
  const CLUSTERS = Math.floor((SECTORS - DATA_START) / SPC);
  if (files.length > ROOT_ENTRIES - 1) throw new Error('disk-full');
  const img = new Uint8Array(SECTORS * BS);
  const w16 = (o, v) => { img[o] = v & 255; img[o + 1] = (v >> 8) & 255; };
  // arranque: salto, nombre del formateador y BPB
  img.set(g.atari ? [0x60, 0x1c] : [0xeb, 0x3c, 0x90], 0);
  if (g.atari) {
    img.set(Array.from('Rocina', (c) => c.charCodeAt(0)), 2);
    img.set([serial & 255, (serial >> 8) & 255, (serial >> 16) & 255], 8);
  } else {
    img.set(Array.from('ROCINANT', (c) => c.charCodeAt(0)), 3);
  }
  w16(11, BS); img[13] = SPC; w16(14, RES); img[16] = NFATS; w16(17, ROOT_ENTRIES);
  w16(19, SECTORS); img[21] = media; w16(22, SPF); w16(24, spt); w16(26, 2); w16(28, 0);
  if (g.atari) {
    // que la suma del sector de arranque no sea 0x1234 (si no, el TOS lo
    // ejecutaría como código)
    let sum = 0;
    for (let i = 0; i < BS; i += 2) sum = (sum + ((img[i] << 8) | img[i + 1])) & 0xffff;
    if (sum === 0x1234) img[30] ^= 1;
  } else {
    // BPB ampliado de MS-DOS 4 (número de serie y etiqueta) y un arranque
    // que solo avisa de que el disco no es de sistema y espera una tecla
    img[36] = 0; img[38] = 0x29;
    img.set([serial & 255, (serial >> 8) & 255, (serial >> 16) & 255, 0x31], 39);
    img.set(Array.from((label || 'NO NAME').toUpperCase().slice(0, 11).padEnd(11), (c) => c.charCodeAt(0)), 43);
    img.set(Array.from('FAT12   ', (c) => c.charCodeAt(0)), 54);
    const msg = Array.from('Este disco no arranca: es de datos.\r\nNot a system disk.\r\n', (c) => c.charCodeAt(0));
    // en 3Eh: escribe el mensaje con la BIOS (INT 10h, AH=0Eh), espera una
    // tecla (INT 16h) y vuelve a arrancar (INT 19h)
    const code = [0xfa, 0x31, 0xc0, 0x8e, 0xd8, 0x8e, 0xd0, 0xbc, 0x00, 0x7c, 0xfb, 0xbe, 0x00, 0x00,
      0xac, 0x08, 0xc0, 0x74, 0x09, 0xb4, 0x0e, 0xbb, 0x07, 0x00, 0xcd, 0x10, 0xeb, 0xf2,
      0x31, 0xc0, 0xcd, 0x16, 0xcd, 0x19];
    const msgAt = 0x3e + code.length;
    code[12] = (0x7c00 + msgAt) & 255; code[13] = (0x7c00 + msgAt) >> 8;
    img.set(code, 0x3e); img.set([...msg, 0], msgAt);
    img[510] = 0x55; img[511] = 0xaa;
  }

  const fat = new Uint16Array(CLUSTERS + 2);
  fat[0] = 0xff9; fat[1] = 0xfff;
  let next = 2;
  const root = (RES + NFATS * SPF) * BS;
  let entry = 0;
  const dirent = (bytes, attr, cluster, size) => {
    const o = root + 32 * entry++;
    img.set(bytes, o);
    img[o + 11] = attr;
    // fecha fija: 1 de enero de 1990, 12:00
    w16(o + 22, 12 << 11); w16(o + 24, ((1990 - 1980) << 9) | (1 << 5) | 1);
    w16(o + 26, cluster); img.set([size & 255, (size >> 8) & 255, (size >> 16) & 255, size >>> 24], o + 28);
  };
  if (label) dirent(Array.from(label.toUpperCase().slice(0, 11).padEnd(11), (c) => c.charCodeAt(0)), 0x08, 0, 0);
  for (const f of files) {
    const n = Math.ceil(f.data.length / (SPC * BS));
    if (next + n > CLUSTERS + 2) throw new Error('disk-full');
    const first = n ? next : 0;
    for (let k = 0; k < n; k++) {
      const c = next++;
      fat[c] = k + 1 < n ? c + 1 : 0xfff;
      img.set(f.data.subarray(k * SPC * BS, (k + 1) * SPC * BS), (DATA_START + (c - 2) * SPC) * BS);
    }
    dirent(name83(f.name), 0, first, f.data.length);
  }
  // FAT12: dos entradas de 12 bits en cada 3 bytes
  for (let k = 0; k < NFATS; k++) {
    const o = (RES + k * SPF) * BS;
    for (let c = 0; c < fat.length; c += 2) {
      const a = fat[c], b = fat[c + 1] ?? 0, p = o + (c * 3 >> 1);
      img[p] = a & 255; img[p + 1] = (a >> 8) | ((b & 15) << 4); img[p + 2] = b >> 4;
    }
  }
  return img;
}

// Lee un disco FAT12 (cualquier geometría que describa su BPB): [{ name, data }]
export function readFAT12(img) {
  const r16 = (o) => img[o] | (img[o + 1] << 8);
  const bps = r16(11), spc = img[13], res = r16(14), nf = img[16], ne = r16(17), spf = r16(22);
  const fatO = res * bps, root = (res + nf * spf) * bps, data = root + ne * 32;
  const next = (c) => { const o = fatO + (c * 3 >> 1), v = img[o] | (img[o + 1] << 8); return c & 1 ? v >> 4 : v & 0xfff; };
  const out = [];
  for (let i = 0; i < ne; i++) {
    const e = root + 32 * i;
    if (img[e] === 0) break;
    if (img[e] === 0xe5 || img[e + 11] & 0x18) continue;
    const base = String.fromCharCode(...img.subarray(e, e + 8)).trimEnd();
    const ext = String.fromCharCode(...img.subarray(e + 8, e + 11)).trimEnd();
    const size = (img[e + 28] | (img[e + 29] << 8) | (img[e + 30] << 16)) + img[e + 31] * 0x1000000;
    const bytes = new Uint8Array(size);
    let got = 0;
    for (let c = r16(e + 26); c >= 2 && c < 0xff8 && got < size; c = next(c)) {
      const o = data + (c - 2) * spc * bps;
      const part = img.subarray(o, o + Math.min(spc * bps, size - got));
      bytes.set(part, got); got += part.length;
    }
    out.push({ name: ext ? `${base}.${ext}` : base, data: bytes });
  }
  return out;
}

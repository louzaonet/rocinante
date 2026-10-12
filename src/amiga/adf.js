// Discos .adf del Amiga (doble densidad, 880K) con el sistema de ficheros OFS
// de AmigaDOS: 1760 bloques de 512 bytes; arranque en los bloques 0 y 1, raíz
// en el 880. Todo en palabras largas con el byte alto primero.
//
// Bloques (los de cabecera, de tipo 2, con la suma de comprobación en el
// byte 20 para que la suma de todas las palabras largas dé 0):
//   raíz: tabla de 72 entradas por "hash" del nombre, mapa de bloques libres
//   directorio: igual, con padre y siguiente de su cadena de hash
//   fichero: 72 punteros a bloques de datos (al revés: el primero, al final),
//     tamaño, nombre; si tiene más, bloques de extensión (tipo 16)
//   datos (OFS): tipo 8, cabecera, número de orden, tamaño, siguiente y 488
//     bytes de datos

const BLOCKS = 1760, ROOT = 880, BS = 512, HT = 72, DATA = 488;
const T_HEADER = 2, T_DATA = 8, T_LIST = 16, ST_ROOT = 1, ST_DIR = 2, ST_FILE = -3;

// Bloque de arranque estándar de AmigaDOS (el que escribe INSTALL): busca
// dos.library y devuelve su inicialización para que arranque el disco.
const BOOT_CODE = [0x43, 0xfa, 0x00, 0x18, 0x4e, 0xae, 0xff, 0xa0, 0x4a, 0x80, 0x67, 0x0a, 0x20, 0x40, 0x20, 0x68,
  0x00, 0x16, 0x70, 0x00, 0x4e, 0x75, 0x70, 0xff, 0x60, 0xfa, ...Array.from('dos.library', (c) => c.charCodeAt(0)), 0];

function nameHash(name) {
  let h = name.length;
  for (const ch of name.toUpperCase()) h = ((h * 13) + ch.charCodeAt(0)) & 0x7ff;
  return h % HT;
}

// files: [{ path: 'S/Startup-Sequence', data }]; los directorios se crean solos
export function writeADF(files, { label = 'DAAD' } = {}) {
  const img = new Uint8Array(BLOCKS * BS);
  const dv = new DataView(img.buffer);
  const L = (b, off, v) => dv.setInt32(b * BS + off, v);
  const getL = (b, off) => dv.getInt32(b * BS + off);
  const bstr = (b, off, s, max) => { const t = s.slice(0, max); img[b * BS + off] = t.length; for (let i = 0; i < t.length; i++) img[b * BS + off + 1 + i] = t.charCodeAt(i); };
  const checksum = (b, off = 20) => {
    L(b, off, 0);
    let sum = 0;
    for (let i = 0; i < BS; i += 4) sum = (sum + dv.getUint32(b * BS + i)) >>> 0;
    L(b, off, -sum | 0);
  };
  const used = new Uint8Array(BLOCKS);
  used[0] = used[1] = used[ROOT] = 1;
  const BITMAP = ROOT + 1;
  used[BITMAP] = 1;
  // bloques libres: desde la raíz hacia fuera, como hace AmigaDOS
  let next = ROOT + 2;
  const alloc = () => {
    while (next < BLOCKS && used[next]) next++;
    if (next >= BLOCKS) { next = 2; while (next < ROOT && used[next]) next++; }
    if (next >= BLOCKS || used[next]) throw new Error('disk-full');
    used[next] = 1;
    return next++;
  };
  // enlaza un bloque de cabecera en la tabla de hash de su directorio
  const link = (dir, block, name) => {
    const slot = 24 + 4 * nameHash(name);
    const first = getL(dir, slot);
    if (!first) { L(dir, slot, block); return; }
    let b = first;
    while (getL(b, BS - 16)) b = getL(b, BS - 16);
    L(b, BS - 16, block);
  };
  const dirs = new Map([['', ROOT]]);
  const headers = [ROOT];
  const mkdir = (path) => {
    if (dirs.has(path)) return dirs.get(path);
    const cut = path.lastIndexOf('/');
    const parent = mkdir(cut < 0 ? '' : path.slice(0, cut));
    const name = path.slice(cut + 1);
    const b = alloc();
    L(b, 0, T_HEADER); L(b, 4, b);
    bstr(b, BS - 80, name, 30);
    L(b, BS - 12, parent); L(b, BS - 4, ST_DIR);
    link(parent, b, name);
    dirs.set(path, b); headers.push(b);
    return b;
  };
  for (const f of files) {
    const cut = f.path.lastIndexOf('/');
    const dir = mkdir(cut < 0 ? '' : f.path.slice(0, cut));
    const name = f.path.slice(cut + 1);
    const hdr = alloc();
    const n = Math.ceil(f.data.length / DATA);
    // bloques de datos y, si hacen falta, de extensión (72 punteros cada uno)
    const data = [];
    const ext = [];
    for (let i = 0; i < n; i++) {
      if (i && i % HT === 0) ext.push(alloc());
      data.push(alloc());
    }
    data.forEach((b, i) => {
      const part = f.data.subarray(i * DATA, i * DATA + DATA);
      L(b, 0, T_DATA); L(b, 4, hdr); L(b, 8, i + 1); L(b, 12, part.length);
      L(b, 16, i + 1 < n ? data[i + 1] : 0);
      img.set(part, b * BS + 24);
      checksum(b);
    });
    const fill = (b, list) => { L(b, 8, list.length); list.forEach((d, k) => L(b, 24 + 4 * (HT - 1 - k), d)); };
    L(hdr, 0, T_HEADER); L(hdr, 4, hdr);
    fill(hdr, data.slice(0, HT));
    L(hdr, 16, data[0] ?? 0);
    L(hdr, BS - 188, f.data.length);
    bstr(hdr, BS - 80, name, 30);
    L(hdr, BS - 12, dir); L(hdr, BS - 8, ext[0] ?? 0); L(hdr, BS - 4, ST_FILE);
    link(dir, hdr, name);
    headers.push(hdr);
    ext.forEach((e, k) => {
      L(e, 0, T_LIST); L(e, 4, e);
      fill(e, data.slice(HT * (k + 1), HT * (k + 2)));
      L(e, BS - 12, hdr); L(e, BS - 8, ext[k + 1] ?? 0); L(e, BS - 4, ST_FILE);
      checksum(e);
    });
  }
  // raíz
  L(ROOT, 0, T_HEADER); L(ROOT, 12, HT);
  L(ROOT, BS - 200, -1);                    // mapa de bloques válido
  L(ROOT, BS - 196, BITMAP);
  bstr(ROOT, BS - 80, label, 30);
  L(ROOT, BS - 4, ST_ROOT);
  // mapa de bloques: un bit por bloque desde el 2; 1 = libre
  for (let k = 2; k < BLOCKS; k++) if (!used[k]) img[BITMAP * BS + 4 + ((k - 2) >> 5) * 4 + 3 - (((k - 2) & 31) >> 3)] |= 1 << ((k - 2) & 7);
  checksum(BITMAP, 0);
  for (const h of headers) checksum(h);
  // arranque
  img.set([0x44, 0x4f, 0x53, 0x00], 0);
  dv.setUint32(8, ROOT);
  img.set(BOOT_CODE, 12);
  let sum = 0;
  for (let i = 0; i < 1024; i += 4) { sum += dv.getUint32(i); if (sum > 0xffffffff) sum -= 0xffffffff; }
  dv.setUint32(4, (~sum) >>> 0);
  return img;
}

// Lee un .adf OFS o FFS (byte 3 del arranque: bit 0): [{ path, data }]. Los
// bloques de datos salen de la tabla de la cabecera del fichero (y de sus
// bloques de extensión); en OFS llevan 24 bytes de cabecera, en FFS no.
export function readADF(img) {
  const dv = new DataView(img.buffer, img.byteOffset, img.byteLength);
  const L = (b, off) => dv.getInt32(b * BS + off);
  const ffs = (img[3] & 1) === 1;
  const name = (b) => { const o = b * BS + BS - 80; return String.fromCharCode(...img.subarray(o + 1, o + 1 + img[o])); };
  const out = [];
  const walk = (dir, prefix, depth = 0) => {
    if (depth > 8) return;
    for (let k = 0; k < HT; k++) {
      for (let b = L(dir, 24 + 4 * k), n = 0; b > 0 && b < BLOCKS && n < 1000; b = L(b, BS - 16), n++) {
        const path = prefix + name(b);
        if (L(b, BS - 4) === ST_DIR) { walk(b, path + '/', depth + 1); continue; }
        const size = L(b, BS - 188);
        const data = new Uint8Array(Math.max(0, size));
        let got = 0;
        // la tabla va al revés: el primer bloque, en la última entrada
        for (let h = b, ext = 0; h > 0 && h < BLOCKS && got < size && ext < 100; h = L(h, BS - 8), ext++) {
          for (let e = HT - 1; e >= 0 && got < size; e--) {
            const d = L(h, 24 + 4 * e);
            if (d <= 0 || d >= BLOCKS) break;
            const part = ffs ? img.subarray(d * BS, d * BS + Math.min(BS, size - got)) : img.subarray(d * BS + 24, d * BS + 24 + Math.min(L(d, 12), size - got));
            data.set(part, got); got += part.length;
          }
        }
        out.push({ path, data });
      }
    }
  };
  walk(ROOT, '');
  return out;
}

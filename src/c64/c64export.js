// Exportación para Commodore 64: un disco .d64 como los de DAAD, con el
// cargador original (boot.prg), la base de gráficos (APART1), el intérprete
// (SDI64 en español, EDI64 en inglés) y la base de datos (BPART1, en 3880h).
// Se arranca con LOAD"*",8 y RUN; los emuladores lo hacen solos.
//
// El cargador se configura en su línea BASIC (SYS ...:REM10E): parte (1),
// pantalla de carga (0 = ninguna) e intérprete (E inglés, S español).

import { writeDDB } from '../daad/ddb-write.js';
import { C64_BOOT, C64_INTERPRETER, C64_CHARSET } from './c64base.js';
import { buildC64Gfx } from './c64gfx.js';
import { writeD64 } from './d64.js';
import { t } from '../i18n.js';

const DDB_AT = 0x3880;
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const c64Charset = () => fromB64(C64_CHARSET);
const prg = (load, data) => { const f = new Uint8Array(data.length + 2); f[0] = load & 255; f[1] = load >> 8; f.set(data, 2); return f; };

// model: el modelo compilado; charset: el del proyecto si tiene uno propio
// (null = el del C64); zxCharset: con el que se pintan los dibujos en el
// Spectrum (para las tramas). Devuelve { d64, ddb (BPART1 con su dirección
// delante), gfx, free, converted, skipped }.
export function exportC64(model, { charset = null, zxCharset = null, title = '' } = {}) {
  const lang = model.language === 'en' ? 'en' : 'es';
  const ddb = writeDDB(model, { machine: 'c64' });
  const pics = Array.from({ length: (model.pictures || []).length }, (_, i) => model.pictures[i] || null);
  const cs = charset ?? c64Charset();
  const gfx = buildC64Gfx(pics, cs, zxCharset ?? cs);
  const free = gfx.load - (DDB_AT + ddb.length);
  if (free < 0) throw new Error(t('No cabe en el C64: faltan {n} bytes.', { n: -free }));
  const boot = fromB64(C64_BOOT);
  boot[0x17] = lang === 'en' ? 0x45 : 0x53;          // REM10E / REM10S
  const name = title.normalize('NFD').replace(/[^A-Za-z0-9 ]/g, '').trim().toUpperCase().slice(0, 16) || 'DAAD';
  const files = [
    { name, data: boot },
    { name: 'APART1', data: prg(gfx.load, gfx.bytes) },
    { name: lang === 'en' ? 'EDI64' : 'SDI64', data: fromB64(C64_INTERPRETER[lang]) },
    { name: 'BPART1', data: prg(DDB_AT, ddb) },
  ];
  const d64 = writeD64(files, { title: name });
  return { d64, ddb: prg(DDB_AT, ddb), gfx: gfx.bytes, free, converted: gfx.converted, skipped: gfx.skipped };
}

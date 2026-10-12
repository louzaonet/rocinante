// Exportación para Amstrad CPC (464, 664 y 6128 con disco): un solo binario
// con el intérprete DAAD original en 0840h, la base de datos en 2880h y la
// base de gráficos detrás (el intérprete la mueve al final, hasta A600h), como
// el MCRF de DAAD. Va en un disco .dsk como DISC.BIN (se arranca con RUN"DISC")
// o en una cinta .cdt (RUN""), que también vale para el 464 sin disco.

import { writeDDB } from '../daad/ddb-write.js';
import { CPC_INTERPRETER, CPC_CHARSET } from './cpcbase.js';
import { buildCpcGfx, CPC_END } from './cpcgfx.js';
import { amsdosFile, dataDisk } from './amsdos.js';
import { cdt } from './cpctape.js';
import { t } from '../i18n.js';

const INT_AT = 0x0840, DDB_AT = 0x2880, TOP = 0xa6fc;     // A6FCh: variables del firmware
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const cpcCharset = () => fromB64(CPC_CHARSET);

// model: el modelo compilado; charset: juego de caracteres (null = el del CPC).
// Devuelve { bin (DISC.BIN con cabecera AMSDOS), dsk, tape (.cdt), ddb, gfx, free,
// converted, skipped, previews }.
export function exportCPC(model, { charset = null, title = '', author = '' } = {}) {
  const interp = fromB64(CPC_INTERPRETER[model.language === 'en' ? 'en' : 'es']);
  const ddb = writeDDB(model, { machine: 'cpc' });
  const pics = Array.from({ length: (model.pictures || []).length }, (_, i) => model.pictures[i] || null);
  const gfx = buildCpcGfx(pics, charset ?? cpcCharset());
  const end = DDB_AT + ddb.length;
  const free = gfx.load - end;
  if (free < 0 || end + gfx.bytes.length > TOP) {
    throw new Error(t('No cabe en el CPC: faltan {n} bytes.', { n: Math.max(-free, end + gfx.bytes.length - TOP) }));
  }
  const body = new Uint8Array(end - INT_AT + gfx.bytes.length);
  body.set(interp, 0);
  body[3] = gfx.bytes.length & 255; body[4] = gfx.bytes.length >> 8;    // el intérprete lee aquí el tamaño de los gráficos
  body.set(ddb, DDB_AT - INT_AT);
  body.set(gfx.bytes, end - INT_AT);
  if (CPC_END - gfx.bytes.length !== gfx.load) throw new Error('base de gráficos de CPC mal colocada');
  const bin = amsdosFile({ name: 'DISC', ext: 'BIN', type: 2, load: INT_AT, exec: INT_AT }, body);
  const dsk = dataDisk([{ name: 'DISC.BIN', data: bin }]);
  const tapeName = title.normalize('NFD').replace(/[^A-Za-z0-9 ]/g, '').trim().toUpperCase().slice(0, 16) || 'DAAD';
  const tape = cdt([{ name: tapeName, type: 2, load: INT_AT, exec: INT_AT, data: body }], { title, author });
  return { bin, dsk, tape, ddb, gfx: gfx.bytes, free, converted: gfx.converted, skipped: gfx.skipped, previews: gfx.previews };
}

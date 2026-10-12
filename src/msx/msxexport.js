// Exportación para MSX: un cartucho (.rom, mapper ASCII16) con el intérprete
// DAAD original (MSXSDI en español, MSXEDI en inglés), la base de datos
// (PART1.DDB, en 0100h) y los gráficos (DAAD.MDG, que acaban en B000h). No
// necesita MSX-DOS ni las ROM originales del MSX: funciona también con C-BIOS.
// Hace falta un MSX con 64 KB de RAM.

import { writeDDB } from '../daad/ddb-write.js';
import { MSX_INTERPRETER } from './msxbase.js';
import { buildMDG } from './msxgfx.js';
import { buildCartridge } from './msxcart.js';
import { defaultCharset } from '../spectrum/zxexport.js';
import { t } from '../i18n.js';

const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

// charset: el del proyecto (null = el de DAAD). Devuelve { rom, ddb, mdg,
// free, converted, skipped }
export function exportMSX(model, { charset = null } = {}) {
  const lang = model.language === 'en' ? 'en' : 'es';
  const ddb = writeDDB(model, { machine: 'msx' });
  const pictures = Array.from({ length: (model.pictures || []).length }, (_, i) => model.pictures[i] || null);
  const mdg = buildMDG(pictures, charset ?? defaultCharset());
  let x;
  try {
    x = buildCartridge({ interpreter: fromB64(MSX_INTERPRETER[lang]), mdg: mdg.bytes, ddb });
  } catch (e) {
    if (e.message === 'msx-full') throw new Error(t('No cabe en el MSX: faltan {n} bytes.', { n: e.missing }));
    throw e;
  }
  return { rom: x.rom, ddb, mdg: mdg.bytes, free: x.layout.free, converted: mdg.converted, skipped: mdg.skipped };
}

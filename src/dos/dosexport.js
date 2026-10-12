// Exportación para PC (MS-DOS): el intérprete DAAD original (INTSM1 en
// español, INTEM1 en inglés) con la base de datos (PART1.DDB, con el byte bajo
// primero), los dibujos (PART1.DAT, el formato de varias máquinas del PC) y el
// juego de caracteres (PART1.CHR), más JUGAR.BAT (PLAY.BAT en inglés), que lo
// arranca en VGA (o EGA o CGA si no hay VGA), y unas instrucciones.
//   .zip: una carpeta para DOSBox (se arrastra JUGAR.BAT sobre DOSBox)
//   .img: disquete de 1,44 MB sin sistema, para emuladores de PC que arrancan
//         MS-DOS o FreeDOS de otro disco

import { DOS_INTERPRETER } from './dosbase.js';
import { parts } from '../m68k/export16.js';
import { writeFAT12, PC_1440K } from '../disk/fat12.js';
import { writeZip } from '../disk/zip.js';
import { t } from '../i18n.js';

const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const bytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

// Las instrucciones van en el idioma del juego, en ASCII y con fin de línea
// de MS-DOS
const README = {
  es: (bat, exe) => [
    'Para jugar en DOSBox, arrastra ' + bat + ' sobre DOSBox. O, dentro de',
    'DOSBox, monta esta carpeta (MOUNT C carpeta), pasa a ella (C:) y escribe',
    bat.replace('.BAT', '') + '.',
    '',
    'En un PC con MS-DOS basta con escribir ' + bat.replace('.BAT', '') + ' en esta carpeta.',
    'Usa VGA si la hay; si no, EGA o CGA. ' + exe + ' es el interprete DAAD original,',
    'de dominio publico.',
  ],
  en: (bat, exe) => [
    'To play in DOSBox, drag ' + bat + ' onto DOSBox. Or, inside DOSBox, mount',
    'this folder (MOUNT C folder), switch to it (C:) and type ' + bat.replace('.BAT', '') + '.',
    '',
    'On a PC with MS-DOS just type ' + bat.replace('.BAT', '') + ' in this folder.',
    'It uses VGA if available; otherwise EGA or CGA. ' + exe + ' is the original',
    'DAAD interpreter, in the public domain.',
  ],
};

const label = (title) => title.normalize('NFD').replace(/[^A-Za-z0-9 ]/g, '').trim().toUpperCase().slice(0, 11) || 'DAAD';
// Nombre de carpeta de MS-DOS (8 letras) a partir del título
export const dosName = (title) => title.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 8) || 'DAAD';

// Ficheros del juego para PC: [{ name, data }] y lo común de parts()
export async function dosFiles(model, { charset = null, decode = null } = {}) {
  const lang = model.language === 'en' ? 'en' : 'es';
  const p = await parts(model, 'pc', { charset, decode });
  const exe = lang === 'en' ? 'INTEM1.EXE' : 'INTSM1.EXE';
  const bat = lang === 'en' ? 'PLAY.BAT' : 'JUGAR.BAT';
  const files = [
    { name: bat, data: bytes('@ECHO OFF\r\n' + exe.replace('.EXE', '') + ' V\r\n') },
    { name: exe, data: fromB64(DOS_INTERPRETER[lang]) },
    { name: 'PART1.DDB', data: p.ddb },
    { name: 'PART1.DAT', data: p.dat },
    { name: 'PART1.CHR', data: p.chr },
    { name: lang === 'en' ? 'README.TXT' : 'LEEME.TXT', data: bytes(README[lang](bat, exe).join('\r\n') + '\r\n') },
  ];
  return { files, ...p };
}

// charset: el del proyecto (null = el de DAAD); decode: ver m68kgfx.js.
// Devuelve { zip, img, ddb, dat, converted, skipped }
export async function exportDOS(model, { charset = null, title = '', decode = null } = {}) {
  const x = await dosFiles(model, { charset, decode });
  const dir = dosName(title);
  const zip = writeZip(x.files.map((f) => ({ name: `${dir}/${f.name}`, data: f.data })));
  let img;
  try { img = writeFAT12(x.files, PC_1440K, { label: label(title) }); } catch (e) {
    if (e.message === 'disk-full') throw new Error(t('No cabe en el disco.'));
    throw e;
  }
  return { zip, img, ...x };
}

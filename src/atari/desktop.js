// Ficheros de configuración del escritorio que hacen que el disco arranque
// solo el intérprete al encender el ST (la línea #Z, "autoboot"):
//   DESKTOP.INF, el del TOS de Atari (lo usan desde la versión 1.04)
//   EMUDESK.INF, el de EmuTOS (el TOS libre de los emuladores)
// Con el TOS 1.00 y 1.02 hay que abrir el programa desde el escritorio.
// Las dos piden la baja resolución, la única en la que DAAD pinta dibujos.

const bytes = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));

export function desktopInf(prg) {
  return bytes([
    '#a000000', '#b000000',
    '#c7770007000600070055200505552220770557075055507703111103',
    '#d                                             ',
    `#Z 01 A:\\${prg}@`,
    '#E 98 01 ',
    '#W 00 00 02 06 26 0C 08 A:\\*.*@',
    '#W 00 00 02 08 26 0C 00 @',
    '#W 00 00 02 0A 26 0C 00 @',
    '#W 00 00 02 0D 26 0C 00 @',
    '#M 00 00 00 FF A FLOPPY DISK@ @',
    '#M 00 01 00 FF B FLOPPY DISK@ @',
    '#T 00 03 02 FF   TRASH@ @',
    '#F FF 04   @ *.*@',
    '#D FF 01   @ *.*@',
    '#G 03 FF   *.PRG@ @',
    '#F 03 04   *.TOS@ @',
    '#P 03 04   *.TTP@ @',
    '',
  ].join('\r\n') + '\x1a');
}

export function emudeskInf(prg) {
  return bytes([
    '#R 02',
    `#Z 01 A:\\${prg}@`,
    '#E 1A E0 00 00 60',
    '#W 00 00 02 06 26 0C 00 @',
    '#W 00 00 02 08 26 0C 00 @',
    '#W 00 00 02 0A 26 0C 00 @',
    '#W 00 00 02 0D 26 0C 00 @',
    '#M 00 00 01 FF A Floppy A@ @',
    '#M 01 00 01 FF B Floppy B@ @',
    '#F FF 07 @ *.*@',
    '#N FF 07 @ *.*@',
    '#D FF 02 @ *.*@',
    '#Y 06 FF *.GTP@ @',
    '#G 06 FF *.APP@ @',
    '#G 06 FF *.PRG@ @',
    '#P 06 FF *.TTP@ @',
    '#F 06 FF *.TOS@ @',
    '#T 00 03 03 FF   Trash@ @',
    '',
  ].join('\r\n'));
}

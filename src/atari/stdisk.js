// Discos .st del Atari ST: volcado de un disquete de doble cara y 720K con
// sistema de ficheros FAT12 (ver ../disk/fat12.js).
import { writeFAT12, readFAT12, ST_720K } from '../disk/fat12.js';

export const ST_SIZE = ST_720K.sectors * 512;
export const writeST = (files, opts) => writeFAT12(files, ST_720K, opts);
export const readST = readFAT12;

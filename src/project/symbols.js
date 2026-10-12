// Nombres predefinidos para el código de los procesos.

// Banderas del sistema (nombres de la plantilla de DRC, que es la que usa la
// comunidad de DAAD, y alias en castellano).
export const SYSTEM_FLAGS = {
  fDark: 0, fObjectsCarried: 1, fDarkF: 28, fGFlags: 29, fScore: 30, fTurns: 31, fTurnsHi: 32,
  fVerb: 33, fNoun: 34, fAdject1: 35, fAdverb: 36, fMaxCarr: 37, fPlayer: 38,
  fInStream: 41, fPrompt: 42, fPrep: 43, fNoun2: 44, fAdject2: 45, fCPronounNoun: 46,
  fCPronounAdject: 47, fTimeout: 48, fTimeoutFlags: 49, fDoallObjNo: 50, fRefObject: 51,
  fStrength: 52, fObjFlags: 53, fRefObjLoc: 54, fRefObjWeight: 55, fRefObjIsContainer: 56,
  fRefObjisWearable: 57, fRefObjAttr1: 58, fRefObjAttr2: 59, fInkeyKey1: 60, fInkeyKey2: 61,
  fScreenMode: 62, fCurrentWindow: 63,
  // alias
  oscuro: 0, llevados: 1, oscuroAqui: 28, puntos: 30, turnos: 31, turnosAlto: 32,
  verbo: 33, nombre: 34, adjetivo: 35, adverbio: 36, maxObjetos: 37, localidad: 38,
  preposicion: 43, nombre2: 44, adjetivo2: 45, objetoActual: 51, fuerza: 52,
};

// Constantes: atributos para HASAT/HASNAT y otras
export const CONSTANTS = {
  WEARABLE: 23, CONTAINER: 31, LISTED: 55, TIMEOUT: 87, GMODE: 247, MOUSE: 240,
};

// Localidades especiales
export const SPECIAL_LOCS = { NOTCREATED: 252, _: 252, WORN: 253, CARRIED: 254, HERE: 255 };
export const SPECIAL_LOC_NAMES = { 252: 'NOTCREATED', 253: 'WORN', 254: 'CARRIED', 255: 'HERE' };

export const FIRST_USER_FLAG = 64;

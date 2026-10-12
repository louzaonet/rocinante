// SPDX-License-Identifier: MIT-0 (va dentro de los juegos exportados; ver LICENSE)
// Tabla de condactos de DAAD v2 (numeración del manual de 1991, sección 4.3).
// Para cada código: nombre, número de parámetros, tipos de parámetro y si es
// condición. Los tipos sirven al editor y al compilador para validar y mostrar
// nombres simbólicos:
//   loc   localidad            loc+  localidad o 252..255 (_/WORN/CARRIED/HERE)
//   obj   objeto               flag  bandera 0..255
//   msg   mensaje de usuario   sys   mensaje del sistema
//   proc  proceso              val   valor 0..255
//   verb/noun/adj/adv/prep     palabra del vocabulario (255 = "_")
//   pct   porcentaje           skip  salto relativo con signo
//   win   ventana 0..7

export const CONDACTS = [];

function def(code, name, types, cond = false) {
  CONDACTS[code] = { code, name, params: types.length, types, cond };
}

def(0, 'AT', ['loc'], true);
def(1, 'NOTAT', ['loc'], true);
def(2, 'ATGT', ['loc'], true);
def(3, 'ATLT', ['loc'], true);
def(4, 'PRESENT', ['obj'], true);
def(5, 'ABSENT', ['obj'], true);
def(6, 'WORN', ['obj'], true);
def(7, 'NOTWORN', ['obj'], true);
def(8, 'CARRIED', ['obj'], true);
def(9, 'NOTCARR', ['obj'], true);
def(10, 'CHANCE', ['pct'], true);
def(11, 'ZERO', ['flag'], true);
def(12, 'NOTZERO', ['flag'], true);
def(13, 'EQ', ['flag', 'val'], true);
def(14, 'GT', ['flag', 'val'], true);
def(15, 'LT', ['flag', 'val'], true);
def(16, 'ADJECT1', ['adj'], true);
def(17, 'ADVERB', ['adv'], true);
def(18, 'SFX', ['val', 'val']);
def(19, 'DESC', ['loc']);
def(20, 'QUIT', [], true);
def(21, 'END', []);
def(22, 'DONE', []);
def(23, 'OK', []);
def(24, 'ANYKEY', []);
def(25, 'SAVE', ['val']);
def(26, 'LOAD', ['val']);
def(27, 'DPRINT', ['flag']);
def(28, 'DISPLAY', ['val']);
def(29, 'CLS', []);
def(30, 'DROPALL', []);
def(31, 'AUTOG', []);
def(32, 'AUTOD', []);
def(33, 'AUTOW', []);
def(34, 'AUTOR', []);
def(35, 'PAUSE', ['val']);
def(36, 'SYNONYM', ['verb', 'noun']);
def(37, 'GOTO', ['loc']);
def(38, 'MESSAGE', ['msg']);
def(39, 'REMOVE', ['obj']);
def(40, 'GET', ['obj']);
def(41, 'DROP', ['obj']);
def(42, 'WEAR', ['obj']);
def(43, 'DESTROY', ['obj']);
def(44, 'CREATE', ['obj']);
def(45, 'SWAP', ['obj', 'obj']);
def(46, 'PLACE', ['obj', 'loc+']);
def(47, 'SET', ['flag']);
def(48, 'CLEAR', ['flag']);
def(49, 'PLUS', ['flag', 'val']);
def(50, 'MINUS', ['flag', 'val']);
def(51, 'LET', ['flag', 'val']);
def(52, 'NEWLINE', []);
def(53, 'PRINT', ['flag']);
def(54, 'SYSMESS', ['sys']);
def(55, 'ISAT', ['obj', 'loc+'], true);
def(56, 'SETCO', ['obj']);
def(57, 'SPACE', []);
def(58, 'HASAT', ['val'], true);
def(59, 'HASNAT', ['val'], true);
def(60, 'LISTOBJ', []);
def(61, 'EXTERN', ['val', 'val']);
def(62, 'RAMSAVE', []);
def(63, 'RAMLOAD', ['flag']);
def(64, 'BEEP', ['val', 'val']);
def(65, 'PAPER', ['val']);
def(66, 'INK', ['val']);
def(67, 'BORDER', ['val']);
def(68, 'PREP', ['prep'], true);
def(69, 'NOUN2', ['noun'], true);
def(70, 'ADJECT2', ['adj'], true);
def(71, 'ADD', ['flag', 'flag']);
def(72, 'SUB', ['flag', 'flag']);
def(73, 'PARSE', ['val']);
def(74, 'LISTAT', ['loc+']);
def(75, 'PROCESS', ['proc']);
def(76, 'SAME', ['flag', 'flag'], true);
def(77, 'MES', ['msg']);
def(78, 'WINDOW', ['win']);
def(79, 'NOTEQ', ['flag', 'val'], true);
def(80, 'NOTSAME', ['flag', 'flag'], true);
def(81, 'MODE', ['val']);
def(82, 'WINAT', ['val', 'val']);
def(83, 'TIME', ['val', 'val']);
def(84, 'PICTURE', ['val']);
def(85, 'DOALL', ['loc+']);
def(86, 'MOUSE', ['val', 'val']);
def(87, 'GFX', ['val', 'val']);
def(88, 'ISNOTAT', ['obj', 'loc+'], true);
def(89, 'WEIGH', ['obj', 'flag']);
def(90, 'PUTIN', ['obj', 'loc']);
def(91, 'TAKEOUT', ['obj', 'loc']);
def(92, 'NEWTEXT', []);
def(93, 'ABILITY', ['val', 'val']);
def(94, 'WEIGHT', ['flag']);
def(95, 'RANDOM', ['flag']);
def(96, 'INPUT', ['val', 'val']);
def(97, 'SAVEAT', []);
def(98, 'BACKAT', []);
def(99, 'PRINTAT', ['val', 'val']);
def(100, 'WHATO', []);
def(101, 'CALL', ['val', 'val']);
def(102, 'PUTO', ['loc+']);
def(103, 'NOTDONE', []);
def(104, 'AUTOP', ['loc']);
def(105, 'AUTOT', ['loc']);
def(106, 'MOVE', ['flag']);
def(107, 'WINSIZE', ['val', 'val']);
def(108, 'REDO', []);
def(109, 'CENTRE', []);
def(110, 'EXIT', ['val']);
def(111, 'INKEY', [], true);
def(112, 'BIGGER', ['flag', 'flag'], true);
def(113, 'SMALLER', ['flag', 'flag'], true);
def(114, 'ISDONE', [], true);
def(115, 'ISNDONE', [], true);
def(116, 'SKIP', ['skip']);
def(117, 'RESTART', []);
def(118, 'TAB', ['val']);
def(119, 'COPYOF', ['obj', 'flag']);
def(121, 'COPYOO', ['obj', 'obj']);
def(123, 'COPYFO', ['flag', 'obj']);
def(125, 'COPYFF', ['flag', 'flag']);
def(126, 'COPYBF', ['flag', 'flag']);
def(127, 'RESET', []);

export const BY_NAME = {};
for (const c of CONDACTS) if (c) BY_NAME[c.name] = c;
// Alias habituales
BY_NAME.JUMP = BY_NAME.SKIP;

// Valores especiales de localidad
export const LOC = { NOTCREATED: 252, WORN: 253, CARRIED: 254, HERE: 255 };

// Banderas del sistema (sección 4.5 del manual)
export const F = {
  DARK: 0, CARRIED: 1, GFLAGS: 29, SCORE: 30, TURNS: 31, TURNS_HI: 32,
  VERB: 33, NOUN1: 34, ADJ1: 35, ADVERB: 36, MAXCARRY: 37, PLAYER: 38,
  INSTREAM: 41, PROMPT: 42, PREP: 43, NOUN2: 44, ADJ2: 45,
  PRONOUN_NOUN: 46, PRONOUN_ADJ: 47, TIMEOUT: 48, TIMEOUT_FLAGS: 49,
  DOALL_OBJ: 50, REFOBJ: 51, STRENGTH: 52, OBJFLAGS: 53,
  REFOBJ_LOC: 54, REFOBJ_WEIGHT: 55, REFOBJ_CONTAINER: 56, REFOBJ_WEARABLE: 57,
  REFOBJ_ATTR1: 58, REFOBJ_ATTR2: 59, KEY1: 60, KEY2: 61, SCREENMODE: 62,
  WINDOW: 63,
};

// Tipos de palabra del vocabulario (byte de tipo en el DDB)
export const WORDTYPE = ['verb', 'adverb', 'noun', 'adjective', 'preposition', 'conjunction', 'pronoun'];

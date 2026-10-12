// Bases de datos de la primera versión de DAAD (1989, versión 1 en la
// cabecera), como las de los primeros juegos de Aventuras AD.
//
// Diferencias con la versión 2 (sacadas del intérprete de Spectrum de La
// Aventura Original):
//   - Cabecera de 32 bytes: no hay atributos extra de los objetos ni vectores
//     de EXTERN, y la posición 30 es el final de la base de datos.
//   - Algunos condactos son los de PAW: INVEN, DESC, SAVE, LOAD, TURNS y SCORE
//     sin parámetros, TIMEOUT, COPYOF/COPYOO/COPYFO/COPYFF en 56-59, EXTERN con
//     un parámetro, PARSE sin parámetro, PROMPT, GRAPHIC y RESET locno.
//   - El bucle del juego va dentro del intérprete, como en PAW: describe la
//     localidad (con su dibujo), ejecuta el proceso 1, y en cada turno el
//     proceso 2, lee una orden, el proceso 0 (las respuestas) y, si nada hizo
//     algo, busca en las conexiones.
//
// Aquí se traducen los condactos a los de la versión 2. El bucle lo pone
// después la importación (src/import/daad1.js).

import { CONDACTS, BY_NAME } from './condacts.js';

// Código -> [nombre, nº de parámetros] donde la versión 1 cambia
const V1 = {
  18: ['INVEN', 0], 19: ['DESC', 0], 25: ['SAVE', 0], 26: ['LOAD', 0], 27: ['TURNS', 0], 28: ['SCORE', 0],
  36: ['TIMEOUT', 0], 56: ['COPYOF', 2], 57: ['COPYOO', 2], 58: ['COPYFO', 2], 59: ['COPYFF', 2],
  61: ['EXTERN', 1], 73: ['PARSE', 0], 86: ['PROMPT', 1], 87: ['GRAPHIC', 2], 101: ['RESET', 1],
  112: ['SMALLER', 2], 113: ['BIGGER', 2],
};

export function condactV1(op) {
  if (V1[op]) return { name: V1[op][0], params: V1[op][1] };
  const c = CONDACTS[op];
  return c ? { name: c.name, params: c.params } : null;
}

// Condactos de la versión 1 sin equivalente directo: se escriben con los de
// la versión 2. helper(nombre) devuelve el número de un proceso auxiliar que
// se añade a la base de datos (para TURNS e INVEN); note(nombre) apunta lo
// que no tiene equivalente. ind: el primer parámetro es indirecto (@).
export function translateV1(name, args, ind, helper, note) {
  const C = (n, ...a) => ({ name: n, args: a });
  // el condacto que lleva el parámetro original, con su indirección
  const O = (n, ...a) => (ind ? { name: n, args: a, ind: true } : { name: n, args: a });
  switch (name) {
    case 'INVEN': return [C('PROCESS', helper('INVEN')), C('DONE')];
    case 'DESC': return [C('RESTART')];
    case 'SAVE': return [C('SAVE', 0)];
    case 'LOAD': return [C('LOAD', 0)];
    case 'TURNS': return [C('PROCESS', helper('TURNS'))];
    case 'SCORE': return [C('SYSMESS', 21), C('PRINT', 30), C('SYSMESS', 22)];
    case 'TIMEOUT': return [C('HASAT', 87)];
    case 'EXTERN': note('EXTERN'); return [O('EXTERN', args[0], 0)];
    case 'PARSE': return [C('PARSE', 1)];
    case 'PROMPT': return [ind ? C('COPYFF', args[0], 42) : C('LET', 42, args[0])];
    case 'GRAPHIC': note('GRAPHIC'); return [];
    case 'RESET': return [C('RESET'), O('GOTO', args[0])];
    // PICTURE pinta en el acto; la bandera 40 dice si era de localidad
    case 'PICTURE': return [C('CLEAR', 40), O('PICTURE', args[0]), C('DISPLAY', 0), C('LET', 40, 255)];
    default: return [O(name, ...args)];
  }
}

// Procesos auxiliares: condactos de la versión 1 que en la 2 son varias
// entradas. Cada uno es una lista de entradas { verb, noun, condacts }.
// objs: los objetos de la base de datos (para INVEN, los que se pueden poner)
export function helperV1(name, objs = []) {
  const E = (...condacts) => ({ verb: 255, noun: 255, condacts });
  const C = (n, ...a) => ({ name: n, args: a });
  if (name === 'TURNS') {
    // "Has jugado n turno" + "s" si no es 1 + "."
    return [
      E(C('SYSMESS', 17), C('DPRINT', 31), C('SYSMESS', 18)),
      E(C('NOTZERO', 32), C('SYSMESS', 19)),
      E(C('ZERO', 32), C('NOTEQ', 31, 1), C('SYSMESS', 19)),
      E(C('SYSMESS', 20)),
    ];
  }
  // INVEN: lo que se lleva y, si hay algo puesto, la lista de lo puesto (en
  // DAAD 1 salía cada objeto en su línea, con el mensaje 10 tras los puestos)
  const worn = objs.map((o, i) => (o.wearable ? E(C('WORN', i), C('LISTAT', 253), C('DONE')) : null)).filter(Boolean);
  return [E(C('SYSMESS', 9), C('LISTAT', 254)), ...worn];
}

export function toOp(c) {
  const d = BY_NAME[c.name];
  const args = c.args.slice(0, d.params);
  while (args.length < d.params) args.push(0);
  return c.ind ? { op: d.code, args, ind: true } : { op: d.code, args };
}

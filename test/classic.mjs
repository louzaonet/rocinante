// Importación de juegos clásicos (src/import/classic.js) con un juego de la
// primera versión de DAAD hecho aquí mismo: una base de datos de la versión 1
// escrita a mano, con sus gráficos al final de la memoria, metida en una
// cinta, en un disco de +3 y en un disco con el contenido sin ficheros. Se
// importa, se compila y se juega con el motor JS: el bucle de la versión 1
// (descripción, conexiones, mensajes de "no puedes") tiene que estar en los
// procesos, y los condactos que cambian de una versión a otra, traducidos.
import fs from 'fs';
import { importClassic, importDDBFile } from '../src/import/classic.js';
import { compileProject } from '../src/project/compile.js';
import { buildSDG } from '../src/spectrum/zxexport.js';
import { Engine } from '../src/daad/engine.js';
import { TextIO, EndOfScript } from '../src/daad/io-text.js';

let bad = 0;
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) bad++; };

// ------------------------------------------------- base de datos versión 1
const BASE = 0x8480;
function ddbV1() {
  const out = [];
  const here = () => BASE + out.length;
  const w16 = (v) => out.push(v & 255, v >> 8);
  const hdr = new Array(32).fill(0);
  out.push(...hdr);
  const text = (s) => { const a = here(); for (const ch of s) out.push(ch.charCodeAt(0) ^ 0xff); out.push(0x0a ^ 0xff); return a; };
  // vocabulario: palabra (5, XOR FFh), valor, tipo
  const voc = here();
  const words = [['NORTE', 1, 0], ['SUR', 2, 0], ['ESTE', 3, 0], ['I', 20, 0], ['COGER', 21, 0], ['MIRAR', 22, 0],
    ['TURNO', 23, 0], ['PUNTO', 24, 0], ['PINTA', 25, 0], ['TINTA', 26, 0], ['LINTE', 50, 2], ['PIEDR', 51, 2]];
  for (const [wd, v, ty] of words) { for (const ch of wd.padEnd(5)) out.push(ch.charCodeAt(0) ^ 0xff); out.push(v, ty); }
  out.push(0);
  const ltx = ['Presentación.', 'Estás en la cueva.', 'Estás en el pasillo.'].map(text);
  const otx = ['Una linterna', 'Una piedra'].map(text);
  const mtx = ['¡Bienvenido!'.replace('¡', '!'), 'Pintado.'].map(text);
  const sys = Array.from({ length: 60 }, (_, i) => ({
    0: 'Está oscuro.', 1: 'Puedes ver ', 6: 'No entiendo.', 7: 'No puedes ir por ahí.', 8: 'No puedes hacer eso.',
    9: 'Llevas:', 10: ' (puesto)', 11: 'nada.', 17: 'Has dado ', 18: ' orden', 19: 'es', 20: '.', 21: 'Tienes ', 22: ' puntos.',
    36: 'Coges _.', 46: ', ', 47: ' y ', 48: '.', 53: 'nada.',
  })[i] ?? '').map(text);
  const table = (ptrs) => { const a = here(); for (const p of ptrs) w16(p); return a; };
  const P = { ltx: table(ltx), otx: table(otx), mtx: table(mtx), stx: table(sys) };
  // conexiones
  const con = [[], [[1, 2]], [[2, 1]]].map((l) => { const a = here(); for (const [v, d] of l) out.push(v, d); out.push(0xff); return a; });
  P.con = table(con);
  P.objInit = here(); out.push(1, 2, 0xff);
  P.objNames = here(); out.push(50, 255, 51, 255);
  P.objAttr = here(); out.push(1, 1);
  // procesos: condactos con la numeración de la versión 1
  const V1 = { AT: 0, NOTAT: 1, ZERO: 11, DESC: 19, DONE: 22, ANYKEY: 24, TURNS: 27, SCORE: 28, AUTOG: 31, GOTO: 37,
    MESSAGE: 38, INVEN: 18, PLUS: 49, PICTURE: 84, INK: 66, PROMPT: 86, LET: 51 };
  const proc = (entries) => {
    const bodies = entries.map(([, , ...cs]) => { const a = here(); for (const c of cs) out.push(...c); out.push(0xff); return a; });
    const a = here();
    entries.forEach(([v, n], i) => { out.push(v, n); w16(bodies[i]); });
    out.push(0);
    return a;
  };
  const p0 = proc([
    [20, 255, [V1.INVEN]],
    [21, 255, [V1.AUTOG], [V1.DONE]],
    [22, 255, [V1.DESC]],
    [23, 255, [V1.TURNS], [V1.DONE]],
    [24, 255, [V1.PLUS, 30, 5], [V1.SCORE], [V1.DONE]],
    [25, 255, [V1.PICTURE, 3], [V1.MESSAGE, 1], [V1.DONE]],
    [26, 255, [V1.INK, 1], [V1.DONE]],
  ]);
  const p1 = proc([[255, 255, [V1.AT, 0], [V1.MESSAGE, 0], [V1.ANYKEY], [V1.GOTO, 1], [V1.PROMPT, 2], [V1.DESC]]]);
  const p2 = proc([]);
  P.procs = table([p0, p1, p2]);
  const end = here();
  const h = [1, 0x11, 95, 2, 3, 2, 60, 3];
  const ptrs = [0, P.procs, P.otx, P.ltx, P.mtx, P.stx, P.con, voc, P.objInit, P.objNames, P.objAttr, end];
  for (const p of ptrs) h.push(p & 255, p >> 8);
  out.splice(0, 32, ...h);
  return Uint8Array.from(out);
}
const ddb = ddbV1();

// Gráficos: el dibujo 1 es el de la cueva (llama al 3) y el 3 no es de
// localidad (se pinta con PICTURE); la tabla de colores cambia el 1 y el 7
const sdg = buildSDG([
  { data: [7], location: false, paper: 0, ink: 7, line: 0, col: 0, height: 12, width: 42 },
  { data: [0x18, 10, 10, 1, 20, 0, 3, 3, 7], location: true, paper: 1, ink: 6, line: 0, col: 0, height: 10, width: 42 },
  { data: [7], location: false, paper: 0, ink: 7, line: 0, col: 0, height: 12, width: 42 },
  { data: [1, 0, 30, 7], location: false, paper: 0, ink: 7, line: 0, col: 0, height: 12, width: 42 },
], undefined, 0x8400);
const mem = new Uint8Array(65536);
mem.set(ddb, BASE);
mem.set(sdg, 0x10000 - sdg.length);
mem.set([0, 7, 2, 3, 4, 5, 6, 1], 0xffe5);

// ---------------------------------------------------------- contenedores
const sum = (b) => b.reduce((a, x) => a ^ x, 0);
function tap(start, data) {
  const h = [3, ...'juego     '.split('').map((c) => c.charCodeAt(0)), data.length & 255, data.length >> 8, start & 255, start >> 8, 0x00, 0x80];
  const blk = (flag, d) => { const b = [flag, ...d]; b.push(sum(b)); return [b.length & 255, b.length >> 8, ...b]; };
  return Uint8Array.from([...blk(0, h), ...blk(0xff, data)]);
}
// Disco de +3 (40 pistas de 9 sectores de 512 bytes); files: [{ name, data }]
// en el directorio de +3DOS, o raw: datos tal cual desde la pista 1
function dsk({ files = [], raw = null } = {}) {
  const tracks = Array.from({ length: 40 }, () => new Uint8Array(9 * 512).fill(0xe5));
  tracks[0].set([0, 0, 40, 9, 2, 1, 3, 2, 0x2a, 0x52]);
  const put = (lin, bytes) => { for (let i = 0; i < bytes.length; i++) { const k = lin + i; tracks[1 + Math.floor(k / 4608)][k % 4608] = bytes[i]; } };
  if (raw) put(0, raw);
  else {
    let block = 2;
    const dir = [];
    for (const f of files) {
      const len = f.data.length + 128;
      const hd = new Uint8Array(128);
      hd.set([...'PLUS3DOS'].map((c) => c.charCodeAt(0)), 0);
      hd.set([0x1a, 1, 0, len & 255, (len >> 8) & 255, 0, 0, 3, f.data.length & 255, f.data.length >> 8, f.start & 255, f.start >> 8], 8);
      hd[127] = hd.subarray(0, 127).reduce((a, x) => (a + x) & 255, 0);
      const bytes = new Uint8Array(Math.ceil(len / 1024) * 1024);
      bytes.set(hd); bytes.set(f.data, 128);
      const blocks = [];
      for (let k = 0; k < bytes.length; k += 1024) { put(block * 1024, bytes.subarray(k, k + 1024)); blocks.push(block++); }
      for (let ex = 0; ex * 16 < blocks.length; ex++) {
        const e = new Uint8Array(32).fill(0);
        e.set([...f.name.padEnd(11)].map((c) => c.charCodeAt(0)), 1);
        const bl = blocks.slice(ex * 16, ex * 16 + 16);
        e[12] = ex; e[15] = Math.min(128, Math.ceil((len - ex * 16384) / 128));
        e.set(bl, 16);
        dir.push(e);
      }
    }
    const d = new Uint8Array(2048).fill(0xe5);
    dir.forEach((e, i) => d.set(e, i * 32));
    put(0, d);
  }
  const head = new Uint8Array(256);
  head.set([...'EXTENDED CPC DSK File\r\nDisk-Info\r\n'].map((c) => c.charCodeAt(0)));
  head[0x30] = 40; head[0x31] = 1;
  for (let i = 0; i < 40; i++) head[0x34 + i] = 0x13;
  const parts = [head];
  tracks.forEach((t, n) => {
    const ti = new Uint8Array(256);
    ti.set([...'Track-Info\r\n'].map((c) => c.charCodeAt(0)));
    ti[0x10] = n; ti[0x14] = 2; ti[0x15] = 9; ti[0x16] = 0x52; ti[0x17] = 0xe5;
    for (let s = 0; s < 9; s++) ti.set([n, 0, s + 1, 2, 0, 0, 0, 2], 0x18 + 8 * s);
    parts.push(ti, t);
  });
  const outb = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { outb.set(p, o); o += p.length; }
  return outb;
}

const block = mem.subarray(BASE);
const cases = [
  ['cinta', tap(BASE, block), 'juego.tap'],
  ['disco de +3', dsk({ files: [{ name: 'JUEGO.BIN', start: BASE, data: block }] }), 'juego.dsk'],
  ['disco sin ficheros', dsk({ raw: Uint8Array.from([1, 2, 3, ...block]) }), 'juego.dsk'],
];
let first = null;
for (const [what, bytes, name] of cases) {
  let r;
  try { r = await importClassic(bytes, name); } catch (e) { check(false, `${what}: ${e.message}`); continue; }
  check(r.length === 1, `${what}: una parte`);
  const { project, report } = await r[0].load();
  check(/primera versión/.test(report), `${what}: ${report}`);
  first ??= project;
}

// ------------------------------------------------------------- el juego
const p = first;
check(p.processes[0].id === 'principal' && p.processes.some((x) => x.id === 'turnos' && /SYSMESS 19/.test(x.source)), 'bucle de la versión 1 y TURNS en procesos');
check(/INK 7/.test(p.processes.find((x) => x.id === 'respuestas').source), 'INK pasa por la tabla de colores');
check(p.locations[1].picture && p.pictures.some((x) => x.number === 3 && !x.location) && p.pictures.some((x) => x.location && x.drawstring.join() === '3,3,7'),
  'dibujos: el de la cueva, el que usa y su copia para PICTURE');
const { model, errors } = compileProject(p);
check(!errors.length, 'compila' + (errors.length ? ': ' + errors[0].msg : ''));
const io = new TextIO(['norte', 'este', 'xyzzy', 'sur', 'coger linterna', 'i', 'turno', 'punto', 'pinta', 'mirar']);
try { await new Engine(model, io, { random: () => 50 }).run(); } catch (e) { if (!(e instanceof EndOfScript)) io.out += `{error ${e.message}}`; }
const t = io.out.replace(/\n/g, '');
const has = (s, what) => check(t.includes(s), what);
has('!Bienvenido!{key}Estás en la cueva.', 'presentación y descripción (DESC del proceso 1)');
has('«norte»Estás en el pasillo.', 'las conexiones mueven sin respuesta');
has('«este»No puedes ir por ahí.', 'mensaje 7 con verbo de movimiento');
has('«xyzzy»No entiendo.', 'frase sin sentido: mensaje 6');
has('«coger linterna»Coges la linterna.', 'AUTOG');
has('«i»Llevas:Una linterna«', 'INVEN');
has('«turno»Has dado 6 ordenes.', 'TURNS, con plural');
has('«punto»Tienes 5 puntos.', 'SCORE');
has('«pinta»Pintado.', 'PICTURE de un dibujo que no es de localidad');
has('«mirar»Estás en la cueva.', 'DESC vuelve a describir');
if (bad) console.log(t);

// el .DDB suelto
const r = await importDDBFile(ddb, 'juego.ddb');
check(r.project.locations.length === 3 && /primera versión/.test(r.report), '.DDB de la versión 1');
// cinta con un bloque sin cabecera: formato no soportado
const turbo = Uint8Array.from([4, 0, 0xff, 1, 2, 0xfc]);
try { await importClassic(turbo, 'x.tap'); check(false, 'cinta con cargador propio'); } catch (e) { check(/no soportado/.test(e.message), 'cinta con cargador propio: ' + e.message); }
process.exit(bad ? 1 : 0);

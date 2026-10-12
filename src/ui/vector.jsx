// Editor de dibujos vectoriales (las cadenas de órdenes de DAAD): se pinta
// pinchando en la pantalla y cada clic añade una orden a la lista. El dibujo
// se ve como en el Spectrum, con el mismo código que la versión web.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { store, update, go, undo, redo, allIds, renameId, freeId } from './store.js';
import { Field, LazyInput, validId, ask } from './common.jsx';
import { charsetOf } from './exporter.js';
import { numberPictures } from '../project/compile.js';
import { decode, describe, enc, paint, penAt, offScreen } from '../gfx/vector.js';
import { memToRGBA } from '../gfx/drawstring.js';
import { ZX_PALETTE } from '../web/view.js';
import { charToDaad } from '../daad/charset.js';
import * as PC from '../gfx/pieces.js';
import { t } from '../i18n.js';

const Z = 3;                                      // aumento de la pantalla
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const b64 = (u) => { let s = ''; for (const b of u) s += String.fromCharCode(b); return btoa(s); };

// Tramas para SHADE: cada una es un carácter (8 bytes)
const PATTERNS = [
  [0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55],
  [0x88, 0x00, 0x22, 0x00, 0x88, 0x00, 0x22, 0x00],
  [0xaa, 0x00, 0xaa, 0x00, 0xaa, 0x00, 0xaa, 0x00],
  [0xff, 0x00, 0xff, 0x00, 0xff, 0x00, 0xff, 0x00],
  [0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa],
  [0x11, 0x22, 0x44, 0x88, 0x11, 0x22, 0x44, 0x88],
  [0x88, 0x44, 0x22, 0x11, 0x88, 0x44, 0x22, 0x11],
  [0xff, 0x80, 0x80, 0x80, 0xff, 0x08, 0x08, 0x08],
  [0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd, 0x77, 0xdd],
  [0x80, 0x00, 0x00, 0x00, 0x08, 0x00, 0x00, 0x00],
];

// Lo copiado, compartido entre los dibujos del proyecto
let clipboard = null;

const TOOLS = () => [
  ['select', t('Seleccionar'), t('Elige trazos, colores, letras o subdibujos para moverlos, copiarlos o cambiarlos')],
  ['line', t('Línea'), t('Una línea desde la pluma hasta donde pinches')],
  ['move', t('Mover'), t('Lleva la pluma sin pintar')],
  ['plot', t('Punto'), t('Un punto suelto (y la pluma pasa ahí)')],
  ['fill', t('Rellenar'), t('Rellena la zona cerrada donde pinches')],
  ['shade', t('Trama'), t('Rellena con una trama')],
  ['text', t('Letra'), t('Una letra del juego de caracteres en un cuadro')],
  ['block', t('Color'), t('Arrastra para dar los colores actuales a unos cuadros')],
];
const MODES = () => [[0, t('normal')], [2, t('borrando')], [1, t('invirtiendo')]];

export function VectorEditor({ pic, index }) {
  const p = store.project;
  const charset = charsetOf(p);
  const { slots, picNum } = numberPictures(p);
  const me = picNum.get(pic.id) ?? 0;
  const lib = Array.from({ length: Math.max(slots.length, me + 1) }, (_, n) => (slots[n]?.drawstring ? { data: slots[n].drawstring } : null));
  const d = pic.drawstring || [7];
  lib[me] = { data: d };
  const ops = decode(d);
  const nameOf = (n) => slots[n]?.id ?? String(n);

  const [tool, setTool] = useState('line');
  const [mode, setMode] = useState(0);
  const [cursor, setCursor] = useState(ops.length);   // órdenes antes del punto de inserción
  const [upToCursor, setUpToCursor] = useState(false);
  const [letter, setLetter] = useState('A');
  const [shadeCh, setShadeCh] = useState(null);
  const [sub, setSub] = useState('');
  const [scale, setScale] = useState(0);
  const [hover, setHover] = useState(null);
  const [sel, setSel] = useState([]);              // piezas seleccionadas (herramienta Seleccionar)
  const [rubber, setRubber] = useState(null);       // rectángulo de selección, en pantalla
  const [preview, setPreview] = useState(null);     // { dx, dy, bytes } mientras se arrastra
  const [msg, setMsg] = useState(null);
  const [, setClipTick] = useState(0);
  const drag = useRef(null);
  const screen = useRef(), overlay = useRef();
  const cur = Math.min(cursor, ops.length);
  const insAt = cur < ops.length ? ops[cur].at : d.length - 1;
  const pen = penAt(lib, me, insAt, charset);
  // Al empezar un dibujo la pluma está donde la dejó el anterior: hasta que
  // haya un punto o un "ir a" la primera posición va en coordenadas absolutas
  // (los dibujos que solo se usan dentro de otros sí empiezan donde esté).
  const penKnown = pic.location === false || ops.slice(0, cur).some((o) => o.kind === 'plot' || o.kind === 'move');
  const bad = offScreen(lib, me, charset);
  const badIndex = bad ? ops.findIndex((o) => o.at === bad.at) : -1;

  useEffect(() => { setCursor(decode(pic.drawstring || [7]).length); setSel([]); setMsg(null); setPreview(null); }, [pic.id]);

  // Piezas del dibujo, para seleccionar (solo con la herramienta Seleccionar)
  const ctx = { lib, charset, pic };
  const A = useMemo(() => (tool === 'select' ? PC.analyze(d, ctx) : null), [tool, store.project, pic.id]);
  const S = A ? sel.filter((k) => k < A.pieces.length) : [];
  const selOps = new Set();
  if (A) for (const k of S) for (let i = A.pieces[k].i0; i < A.pieces[k].i1; i++) selOps.add(i);
  const hoverPiece = A && hover && !drag.current ? PC.hit(A, hover.x, 175 - hover.y) : -1;

  // pantalla
  useEffect(() => {
    const l = lib.slice();
    if (preview) l[me] = { data: preview.bytes };
    const { mem } = paint(l, me, pic, { charset, upto: upToCursor && !preview ? insAt : undefined });
    const c = screen.current;
    c.getContext('2d').putImageData(new ImageData(memToRGBA(mem), 256, 192), 0, 0);
  });
  // marcas: ventana del dibujo, pluma, línea que se va a trazar
  useEffect(() => {
    const c = overlay.current, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    const top = (pic.line ?? 0) * 8 * Z, h = (pic.height ?? 12) * 8 * Z;
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fillRect(0, 0, c.width, top); g.fillRect(0, top + h, c.width, c.height - top - h);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.setLineDash([4, 4]); g.strokeRect(0.5, top + 0.5, c.width - 1, h - 1); g.setLineDash([]);
    const px = (x) => x * Z + Z / 2, py = (y) => (175 - y) * Z + Z / 2;
    if (tool === 'select') {
      // las marcas van en negro y blanco a la vez: se ven sobre cualquier color
      const ants = (x, y, w, h, dash, width = 1.5) => {
        g.lineWidth = width + 1.5; g.strokeStyle = 'rgba(0,0,0,.85)'; g.setLineDash([]); g.strokeRect(x, y, w, h);
        g.lineWidth = width; g.strokeStyle = '#fff'; g.setLineDash(dash); g.strokeRect(x, y, w, h);
        g.setLineDash([]);
      };
      const box = (b, dx, dy, dash, m = 3) => {
        if (b) ants((b.x0 + dx) * Z - m + 0.5, (b.y0 - dy) * Z - m + 0.5, (b.x1 - b.x0 + 1) * Z + 2 * m - 1, (b.y1 - b.y0 + 1) * Z + 2 * m - 1, dash);
      };
      const dx = preview?.dx ?? 0, dy = preview?.dy ?? 0;
      // los puntos de lo elegido, teñidos
      if (S.length && !preview) {
        const mine = new Set(S);
        g.fillStyle = 'rgba(255,0,170,.6)';
        for (let i = 0; i < 256 * 176; i++) if (mine.has(A.owner[i])) g.fillRect((i & 255) * Z, (i >> 8) * Z, Z, Z);
      }
      if (hoverPiece >= 0 && !S.includes(hoverPiece)) box(A.pieces[hoverPiece].box, 0, 0, [2, 3]);
      if (S.length <= 8) for (const k of S) box(A.pieces[k].box, dx, dy, [5, 3]);
      if (S.length > 1) box(PC.boxOf(A, S), dx, dy, [], 7);
      if (rubber) {
        g.fillStyle = 'rgba(255,255,255,.15)';
        g.fillRect(rubber.x0 * Z, rubber.y0 * Z, (rubber.x1 - rubber.x0 + 1) * Z, (rubber.y1 - rubber.y0 + 1) * Z);
        ants(rubber.x0 * Z + 0.5, rubber.y0 * Z + 0.5, (rubber.x1 - rubber.x0 + 1) * Z - 1, (rubber.y1 - rubber.y0 + 1) * Z - 1, [4, 4], 1);
      }
      return;
    }
    if (hover && (tool === 'line' || tool === 'move')) {
      g.strokeStyle = tool === 'line' ? '#ff4d4d' : 'rgba(255,77,77,.6)'; g.lineWidth = 1.5;
      if (tool === 'move') g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(px(pen.x), py(pen.y)); g.lineTo(px(hover.x), py(hover.y)); g.stroke(); g.setLineDash([]);
    }
    if (tool === 'block' && drag.current && hover) {
      const [a, b] = [drag.current, hover];
      const c0 = Math.min(a.col, b.col), c1 = Math.max(a.col, b.col), r0 = Math.min(a.row, b.row), r1 = Math.max(a.row, b.row);
      g.strokeStyle = '#ff4d4d'; g.lineWidth = 2; g.strokeRect(c0 * 8 * Z, r0 * 8 * Z, (c1 - c0 + 1) * 8 * Z, (r1 - r0 + 1) * 8 * Z);
    }
    if (tool === 'text' && hover) { g.strokeStyle = '#ff4d4d'; g.lineWidth = 2; g.strokeRect(hover.col * 8 * Z, hover.row * 8 * Z, 8 * Z, 8 * Z); }
    // pluma
    g.strokeStyle = '#ff4d4d'; g.lineWidth = 2;
    g.beginPath(); g.arc(px(pen.x), py(pen.y), 5, 0, Math.PI * 2); g.stroke();
  });

  const setDraw = (bytes, opts) => update((q) => { q.pictures[index].drawstring = bytes; }, opts);
  const insert = (bytes, n = 1) => {
    if (!bytes) return;
    setDraw([...d.slice(0, insAt), ...bytes, ...d.slice(insAt)]);
    setCursor(cur + n);
  };
  const removeOp = (i) => {
    const o = ops[i];
    if (!o) return;
    setDraw([...d.slice(0, o.at), ...d.slice(o.at + o.len)]);
    setCursor(Math.max(0, Math.min(cur, i)));
  };
  const moveOp = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= ops.length) return;
    const a = ops[Math.min(i, j)], b = ops[Math.max(i, j)];
    const A = d.slice(a.at, a.at + a.len), B = d.slice(b.at, b.at + b.len);
    setDraw([...d.slice(0, a.at), ...B, ...A, ...d.slice(b.at + b.len)]);
    setCursor(j + 1);
  };

  const at = (e) => {
    const r = screen.current.getBoundingClientRect();
    const sx = Math.max(0, Math.min(255, Math.floor((e.clientX - r.left) * 256 / r.width)));
    const sy = Math.max(0, Math.min(191, Math.floor((e.clientY - r.top) * 192 / r.height)));
    return { x: sx, y: 175 - sy, inside: sy <= 175, col: sx >> 3, row: sy >> 3 };
  };
  // ------------------------------------------------------------ seleccionar
  const selDown = (e) => {
    e.currentTarget.focus();
    const q = at(e), sx = q.x, sy = 175 - q.y;
    const k = PC.hit(A, sx, sy);
    e.currentTarget.setPointerCapture(e.pointerId);
    // un bloque de color ocupa todo el fondo: arrastrar desde él hace un
    // rectángulo, salvo que ya estuviera elegido; un clic lo elige
    const background = k >= 0 && A.pieces[k].kind === 'block' && !S.includes(k) && !e.shiftKey;
    if (k >= 0 && !background) {
      let ns = S;
      if (e.shiftKey) ns = S.includes(k) ? S.filter((x) => x !== k) : [...S, k];
      else if (!S.includes(k)) ns = [k];
      setSel(ns);
      drag.current = { kind: 'move', q, sel: ns };
    } else {
      if (!e.shiftKey) setSel([]);
      drag.current = { kind: 'rubber', sx, sy, base: e.shiftKey ? S : [], click: background ? k : -1 };
      setRubber({ x0: sx, y0: sy, x1: sx, y1: sy });
    }
  };
  const selMove = (q) => {
    const g = drag.current;
    if (!g) return;
    if (g.kind === 'move') {
      if (!g.sel.length) return;
      const { dx, dy } = PC.clampDelta(A, g.sel, q.x - g.q.x, q.y - g.q.y);
      if (!dx && !dy) { if (preview) setPreview(null); return; }
      if (preview && preview.dx === dx && preview.dy === dy) return;
      setPreview({ dx, dy, bytes: PC.translate(A, g.sel, dx, dy, ctx).bytes });
    } else {
      const sx = q.x, sy = 175 - q.y;
      setRubber({ x0: Math.max(0, Math.min(g.sx, sx)), y0: Math.max(0, Math.min(g.sy, sy)), x1: Math.max(g.sx, sx), y1: Math.min(191, Math.max(g.sy, sy)) });
    }
  };
  const selUp = () => {
    const g = drag.current;
    drag.current = null;
    if (!g) return;
    if (g.kind === 'move' && preview) { setDraw(preview.bytes); setPreview(null); }
    if (g.kind === 'rubber') {
      const r = rubber;
      setRubber(null);
      if (r && (r.x1 - r.x0 > 1 || r.y1 - r.y0 > 1)) setSel([...new Set([...g.base, ...PC.inRect(A, r.x0, r.y0, r.x1, r.y1)])]);
      else if (g.click >= 0) setSel([g.click]);
    }
  };
  // Aplica el resultado de una operación de pieces.js
  const act = (r, opts) => {
    if (!r) return;
    if (r.error) { setMsg(r.error === 'rotate' ? t('Los bloques de color, las letras y los subdibujos no se pueden girar.') : null); return; }
    setDraw(r.bytes, opts);
    setSel(r.sel);
    setMsg(r.warn ? t('Los bloques de color y las letras se quedan en su sitio: no se moverán con el subdibujo.') : null);
  };
  const doCopy = (from = pic.id) => {
    if (!S.length) return;
    clipboard = { ...PC.copy(A, S), from, n: 0 };
    setClipTick((x) => x + 1);
  };
  const doCut = () => { if (!S.length) return; doCopy(null); act(PC.remove(A, S, ctx)); };
  const doPaste = () => {
    if (!clipboard) return;
    // en el mismo dibujo, un poco desplazado para que se vea; en otro, en el mismo sitio
    const off = clipboard.from === pic.id ? 8 * ++clipboard.n : 0;
    act(PC.paste(A, clipboard, off, -off, ctx));
  };
  const doDuplicate = () => { if (S.length) act(PC.paste(A, PC.copy(A, S), 8, -8, ctx)); };
  const doRemove = () => { if (S.length) act(PC.remove(A, S, ctx)); };
  const doFlip = (axis) => { if (S.length) act(PC.flip(A, S, axis, ctx)); };
  const doRotate = () => { if (S.length) act(PC.rotate(A, S, ctx)); };
  const doOrder = (where) => { if (S.length) act(PC.reorder(A, S, where, ctx)); };
  const doSub = () => {
    if (!S.length) return;
    // un número libre que no sea el de ninguna localidad: GOSUB lo lleva dentro
    const used = new Set(picNum.values());
    let n = p.locations.length;
    while (n < 256 && used.has(n)) n++;
    if (n > 255) { setMsg(t('No quedan números de dibujo libres (llegan hasta 255).')); return; }
    const r = PC.toSub(A, S, n, ctx);
    if (r.error) return;
    let id;
    update((q) => {
      id = freeId(`${pic.id}_sub`, allIds(q));
      q.pictures.push({ id, drawstring: r.sub, location: false, number: n, line: pic.line ?? 0, col: 0, height: pic.height ?? 12, width: 42, paper: pic.paper ?? 0, ink: pic.ink ?? 7 });
      q.pictures[index].drawstring = r.bytes;
    });
    setSel(r.sel);
    setMsg(t('Hecho el subdibujo {id} (número {n}).', { id, n }) + (r.warn ? ' ' + t('Los bloques de color y las letras se quedan en su sitio: no se moverán con el subdibujo.') : ''));
  };
  const selKey = (e) => {
    if (tool !== 'select' || !A) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), step = e.shiftKey ? 8 : 1;
    const arrows = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, step], arrowdown: [0, -step] };
    const run = (f) => { e.preventDefault(); f(); };
    if (arrows[k] && !mod) { if (S.length) run(() => act(PC.translate(A, S, ...arrows[k], ctx), { coalesce: true })); return; }
    if (mod && k === 'c') run(() => doCopy());
    else if (mod && k === 'x') run(doCut);
    else if (mod && k === 'v') run(doPaste);
    else if (mod && k === 'd') run(doDuplicate);
    else if (mod && k === 'a') run(() => setSel(A.pieces.map((x, i) => (x.box ? i : -1)).filter((i) => i >= 0)));
    else if (!mod && (k === 'delete' || k === 'backspace')) run(doRemove);
    else if (k === 'escape') run(() => setSel([]));
  };
  const pickOp = (i, e) => {
    setCursor(i + 1);
    if (tool !== 'select' || !A) return;
    const k = A.pieces.findIndex((x) => i >= x.i0 && i < x.i1);
    if (k < 0) return;
    setSel(e.shiftKey ? (S.includes(k) ? S.filter((x) => x !== k) : [...S, k]) : [k]);
  };

  const down = (e) => {
    if (tool === 'select') { selDown(e); return; }
    const q = at(e);
    if (tool === 'block') { drag.current = q; e.currentTarget.setPointerCapture(e.pointerId); return; }
    if (tool === 'text') {
      const ch = letter ? (letter.charCodeAt(0) < 128 ? letter.charCodeAt(0) : charToDaad(letter)) : 32;
      insert(enc.text(ch, q.col, q.row, mode));
      return;
    }
    if (!q.inside) return;
    const dx = q.x - pen.x, dy = q.y - pen.y;
    if (tool === 'plot' || (tool === 'line' && (!penKnown || !(dx || dy)))) insert(enc.plot(q.x, q.y, mode));
    else if (tool === 'line') insert(enc.line(dx, dy, mode));
    else if (tool === 'move') insert(penKnown ? enc.rmove(dx, dy) : enc.move(q.x, q.y));
    else if (tool === 'fill') insert(penKnown ? enc.fill(dx, dy) : [...enc.move(q.x, q.y), ...enc.fill(0, 0)], penKnown ? 1 : 2);
    else if (tool === 'shade') {
      const ch = shadeCh ?? ensurePattern(PATTERNS[0]);
      insert(penKnown ? enc.shade(dx, dy, ch) : [...enc.move(q.x, q.y), ...enc.shade(0, 0, ch)], penKnown ? 1 : 2);
    }
  };
  const up = (e) => {
    if (tool === 'select') { selUp(); return; }
    if (tool !== 'block' || !drag.current) return;
    const a = drag.current, b = at(e);
    drag.current = null;
    const c0 = Math.min(a.col, b.col), c1 = Math.max(a.col, b.col), r0 = Math.min(a.row, b.row), r1 = Math.max(a.row, b.row);
    insert(enc.block(r1 - r0, c1 - c0, c0, r0));
  };

  // Una trama tiene que estar en el juego de caracteres: si no está, va al
  // primer hueco libre entre 164 y 255
  function ensurePattern(g) {
    for (let c = 128; c < 256; c++) if (g.every((v, k) => charset[c * 8 + k] === v)) return c;
    let slot = -1;
    for (let c = 164; c < 256 && slot < 0; c++) if (charset.subarray(c * 8, c * 8 + 8).every((v) => !v)) slot = c;
    if (slot < 0) return 255;
    const cs = charset.slice();
    cs.set(g, slot * 8);
    update((q) => { q.settings = { ...(q.settings || {}), charset: b64(cs) }; });
    return slot;
  }
  const patternChoices = [];
  for (let c = 164; c < 256; c++) if (charset.subarray(c * 8, c * 8 + 8).some((v) => v)) patternChoices.push({ ch: c, g: [...charset.subarray(c * 8, c * 8 + 8)] });
  for (const g of PATTERNS) if (!patternChoices.some((x) => x.g.every((v, k) => v === g[k]))) patternChoices.push({ ch: null, g });

  const others = (p.pictures || []).filter((x) => x.id !== pic.id && x.drawstring);
  const addGosub = () => {
    const target = others.find((x) => x.id === sub) || others[0];
    if (!target) return;
    const n = picNum.get(target.id);
    // el número tiene que quedar fijo: GOSUB lo lleva dentro
    update((q) => {
      const x = q.pictures.find((y) => y.id === target.id);
      if (!Number.isInteger(x.number)) x.number = n;
      const me2 = q.pictures[index];
      me2.drawstring = [...d.slice(0, insAt), ...enc.gosub(n, scale), ...d.slice(insAt)];
    });
    setCursor(cur + 1);
  };

  const toBitmap = async () => {
    if (!await ask(t('¿Convertir {id} en un mapa de bits? Las órdenes del dibujo se pierden.', { id: pic.id }), t('Convertir'))) return;
    const { mem } = paint(lib, me, pic, { charset });
    const top = pic.line ?? 0, rows = Math.min(24 - top, pic.height ?? 12);
    const pixels = new Uint8Array(rows * 8 * 32), attrs = new Uint8Array(rows * 32);
    const rowAddr = (y) => ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2);
    for (let y = 0; y < rows * 8; y++) pixels.set(mem.subarray(rowAddr(top * 8 + y), rowAddr(top * 8 + y) + 32), y * 32);
    attrs.set(mem.subarray(6144 + top * 32, 6144 + (top + rows) * 32));
    // la maestra, para seguir pintando encima en el editor de mapas de bits
    const c = document.createElement('canvas'); c.width = 256 * 4; c.height = rows * 8 * 4;
    const small = document.createElement('canvas'); small.width = 256; small.height = rows * 8;
    small.getContext('2d').putImageData(new ImageData(memToRGBA(mem).slice(top * 8 * 256 * 4, (top + rows) * 8 * 256 * 4), 256, rows * 8), 0, 0);
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(small, 0, 0, c.width, c.height);
    update((q) => {
      const x = q.pictures[index];
      delete x.drawstring;
      x.zx = { cx: 0, cy: top, cw: 32, ch: rows, pixels: b64(pixels), attrs: b64(attrs) };
      x.area = { cx: 0, cy: top, cw: 32, ch: rows };
      x.master = c.toDataURL('image/png');
      x.options = { dither: false, bright: true, contrast: 1 };
    });
  };

  const set = (fn) => update((q) => fn(q.pictures[index]));
  const taken = allIds(p);
  const colourRow = (label, kind, values) => (
    <div class="vec-colours" role="group" aria-label={label}>
      <span class="field-label">{label}</span>
      {values.map((v) => {
        const isSwatch = (kind === 'ink' || kind === 'paper') && v < 8;
        const col = isSwatch ? hex(ZX_PALETTE.normal[v]) : null;
        const name = label + ' ' + (v === 8 ? t('transparente') : v);
        return <button class={'sw' + (isSwatch ? '' : ' sw-text')} title={name} aria-label={name} style={isSwatch ? { background: col } : null}
          onClick={() => insert(enc[kind](v))}>{isSwatch ? '' : v === 8 ? 'T' : v}</button>;
      })}
    </div>
  );

  return (
    <div class="detail pic vec">
      <div class="detail-head">
        <LazyInput class="id-input" value={pic.id} validate={(v) => validId(v, taken, pic.id)}
          onCommit={(v) => { update((q) => renameId(q, pic.id, v)); go('dibujos', { picture: v }); }} />
        <span class="spacer" />
        <button class="btn" onClick={toBitmap}>{t('Convertir en mapa de bits')}</button>
        <button class="btn ghost" onClick={async () => {
          if (!await ask(t('¿Borrar el dibujo {id}?', { id: pic.id }), t('Borrar'))) return;
          update((q) => { q.pictures.splice(index, 1); for (const l of q.locations) if (l.picture === pic.id) delete l.picture; });
          go('dibujos', { picture: undefined });
        }}>{t('Borrar')}</button>
      </div>

      <div class="paint-tools" role="toolbar" aria-label={t('Herramientas de dibujo')}>
        {TOOLS().map(([k, label, hint]) => <button class={'tool' + (tool === k ? ' sel' : '')} title={hint} aria-pressed={tool === k} onClick={() => setTool(k)}>{label}</button>)}
        <span class="sep" />
        <button class="tool" onClick={undo} title="Ctrl+Z">{t('Deshacer')}</button>
        <button class="tool" onClick={redo} title="Ctrl+Y">{t('Rehacer')}</button>
      </div>
      <div class="vec-toolopts">
        {tool === 'select' && <>
          <span class="vec-selbar" role="group" aria-label={t('Selección')}>
            <button class="btn small" disabled={!S.length} title="Ctrl+C" onClick={() => doCopy()}>{t('Copiar')}</button>
            <button class="btn small" disabled={!S.length} title="Ctrl+X" onClick={doCut}>{t('Cortar')}</button>
            <button class="btn small" disabled={!clipboard} title="Ctrl+V" onClick={doPaste}>{t('Pegar')}</button>
            <button class="btn small" disabled={!S.length} title="Ctrl+D" onClick={doDuplicate}>{t('Duplicar')}</button>
            <button class="btn small" disabled={!S.length} title={t('Supr')} onClick={doRemove}>{t('Borrar')}</button>
          </span>
          <span class="vec-selbar" role="group" aria-label={t('Transformar')}>
            <button class="btn small" disabled={!S.length} title={t('Voltear de izquierda a derecha')} aria-label={t('Voltear de izquierda a derecha')} onClick={() => doFlip('h')}>↔</button>
            <button class="btn small" disabled={!S.length} title={t('Voltear de arriba abajo')} aria-label={t('Voltear de arriba abajo')} onClick={() => doFlip('v')}>↕</button>
            <button class="btn small" disabled={!S.length} title={t('Girar 90 grados a la derecha')} onClick={doRotate}>{t('Girar 90°')}</button>
          </span>
          <span class="vec-selbar" role="group" aria-label={t('Orden')}>
            <button class="btn small" disabled={!S.length} title={t('Encima de todo lo demás')} onClick={() => doOrder('front')}>{t('Al frente')}</button>
            <button class="btn small" disabled={!S.length} title={t('Un paso más arriba')} onClick={() => doOrder('up')}>{t('Adelante')}</button>
            <button class="btn small" disabled={!S.length} title={t('Un paso más abajo')} onClick={() => doOrder('down')}>{t('Atrás')}</button>
            <button class="btn small" disabled={!S.length} title={t('Debajo de todo lo demás')} onClick={() => doOrder('back')}>{t('Al fondo')}</button>
          </span>
          <button class="btn small" disabled={!S.length} title={t('Pasa la selección a un dibujo nuevo y deja aquí una llamada (GOSUB)')} onClick={doSub}>{t('Hacer subdibujo')}</button>
          <span class="note">{S.length ? t('Piezas seleccionadas: {n}', { n: S.length }) : t('Pincha en el dibujo o arrastra un rectángulo alrededor de lo que quieras. Mayús+clic añade o quita.')}
            {S.some((k) => !A.pieces[k].movable) ? ' ' + t('Un subdibujo que empieza con su propio punto no se mueve desde aquí.') : ''}</span>
        </>}
        {(tool === 'line' || tool === 'plot' || tool === 'text') && (
          <label class="check">{t('Modo')} <select value={mode} onChange={(e) => setMode(+e.currentTarget.value)}>
            {MODES().map(([v, l]) => <option value={v}>{l}</option>)}</select></label>
        )}
        {tool === 'text' && <label class="check">{t('Letra')} <input class="vec-letter" maxLength={1} value={letter} onInput={(e) => setLetter(e.currentTarget.value)} /></label>}
        {tool === 'shade' && (
          <span class="vec-patterns" role="group" aria-label={t('Trama')}>
            {patternChoices.map((x) => <PatternSwatch g={x.g} sel={x.ch != null && x.ch === shadeCh} onClick={() => setShadeCh(x.ch ?? ensurePattern(x.g))} />)}
          </span>
        )}
        {(tool === 'move' || tool === 'fill') && <span class="note">{tool === 'move' ? t('La pluma va a donde pinches, sin pintar.') : t('Rellena con la tinta actual la zona cerrada donde pinches.')}</span>}
        {(tool === 'line' && !penKnown) && <span class="note">{t('El primer clic pone la pluma; los siguientes trazan las líneas.')}</span>}
        {tool === 'block' && <span class="note">{t('Arrastra sobre los cuadros que quieras pintar con la tinta y el papel actuales.')}</span>}
      </div>

      <div class="vec-body">
        <div class="vec-screen" style={{ aspectRatio: '256 / 192' }}>
          <canvas ref={screen} width={256} height={192} />
          <canvas ref={overlay} width={256 * Z} height={192 * Z} class={'vec-overlay' + (tool === 'select' ? (hoverPiece >= 0 ? ' grab' : ' pick') : '')}
            tabIndex={0} aria-label={t('Pantalla del dibujo')} onKeyDown={selKey}
            onPointerDown={down} onPointerUp={up}
            onPointerMove={(e) => { const q = at(e); setHover(q); if (tool === 'select') selMove(q); }} onPointerLeave={() => { setHover(null); }} />
          {hover && <span class="vec-pos">{hover.inside ? `x ${hover.x}  y ${hover.y}` : ''}{`  ·  ${t('cuadro')} ${hover.col},${hover.row}`}</span>}
        </div>
        <div class="vec-side">
          <div class="vec-list-head">
            <span class="field-label">{t('Órdenes')} <span class="note">{t('{b} bytes', { b: d.length })}</span></span>
            <label class="check"><input type="checkbox" checked={upToCursor} onChange={(e) => setUpToCursor(e.currentTarget.checked)} /> {t('Ver hasta la marcada')}</label>
          </div>
          <ol class="vec-list" tabIndex={0} aria-label={t('Órdenes del dibujo')}
            onKeyDown={(e) => {
              if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeOp(cur - 1); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(Math.max(0, cur - 1)); }
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(Math.min(ops.length, cur + 1)); }
            }}>
            <li class={'vec-start' + (cur === 0 ? ' sel' : '')} onClick={() => setCursor(0)}>{t('(principio)')}</li>
            {ops.map((o, i) => (
              <li class={(i === cur - 1 ? 'sel' : '') + (i === badIndex ? ' warn' : '') + (selOps.has(i) ? ' insel' : '')} onClick={(e) => pickOp(i, e)}>
                {describe(o, nameOf)}
              </li>
            ))}
          </ol>
          <div class="vec-list-tools">
            <button class="btn small" disabled={cur < 1} onClick={() => moveOp(cur - 1, -1)}>{t('Subir')}</button>
            <button class="btn small" disabled={cur < 1 || cur >= ops.length} onClick={() => moveOp(cur - 1, 1)}>{t('Bajar')}</button>
            <button class="btn small" disabled={cur < 1} onClick={() => removeOp(cur - 1)}>{t('Quitar')}</button>
          </div>
          <p class="note">{t('Lo que añadas va detrás de la orden marcada.')}</p>
        </div>
      </div>
      {msg && tool === 'select' && <p class="vec-msg" role="status">{msg}</p>}
      {bad && <p class="vec-warn" role="alert">{t('La orden {n} se sale de la pantalla. En el Spectrum eso es el error B de la ROM: el dibujo se corta ahí y la partida se para.', { n: badIndex + 1 })}</p>}

      <div class="vec-extra">
        {colourRow(t('Tinta'), 'ink', [0, 1, 2, 3, 4, 5, 6, 7, 8])}
        {colourRow(t('Papel'), 'paper', [0, 1, 2, 3, 4, 5, 6, 7, 8])}
        {colourRow(t('Brillo'), 'bright', [0, 1, 8])}
        {colourRow(t('Parpadeo'), 'flash', [0, 1, 8])}
        <div class="vec-colours">
          <span class="field-label">{t('Otro dibujo dentro de este')}</span>
          {others.length ? <>
            <select value={sub || others[0].id} onChange={(e) => setSub(e.currentTarget.value)} aria-label={t('Dibujo')}>
              {others.map((x) => <option value={x.id}>{x.id}</option>)}
            </select>
            <select value={scale} onChange={(e) => setScale(+e.currentTarget.value)} aria-label={t('Escala')}>
              <option value={0}>{t('tamaño real')}</option>
              {[1, 2, 3, 4, 5, 6, 7].map((s) => <option value={s}>{s}/8</option>)}
            </select>
            <button class="btn small" onClick={addGosub}>{t('Añadir')}</button>
          </> : <span class="note">{t('No hay otros dibujos vectoriales.')}</span>}
        </div>
      </div>

      <div class="zx-opts vec-opts">
        <Field label={t('Fila de arriba')} hint={t('La ventana del dibujo, en filas de 8 puntos. DISPLAY la borra con su papel y su tinta.')}>
          <input type="number" min="0" max="23" value={pic.line ?? 0} onChange={(e) => set((x) => { x.line = Math.max(0, Math.min(23, +e.currentTarget.value)); })} />
        </Field>
        <Field label={t('Filas que ocupa')}>
          <input type="number" min="1" max="24" value={pic.height ?? 12} onChange={(e) => set((x) => { x.height = Math.max(1, Math.min(24, +e.currentTarget.value)); })} />
        </Field>
        <Field label={t('Papel y tinta de la ventana')}>
          <span class="vec-pair">
            <select value={pic.paper ?? 0} onChange={(e) => set((x) => { x.paper = +e.currentTarget.value; })} aria-label={t('Papel')}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((v) => <option value={v}>{t('Papel')} {v}</option>)}
            </select>
            <select value={pic.ink ?? 7} onChange={(e) => set((x) => { x.ink = +e.currentTarget.value; })} aria-label={t('Tinta')}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((v) => <option value={v}>{t('Tinta')} {v}</option>)}
            </select>
          </span>
        </Field>
        <span class="note">{t('Es el dibujo número {n}: con ese número se usa dentro de otros (GOSUB).', { n: me })}</span>
        <label class="check"><input type="checkbox" checked={pic.location !== false} onChange={(e) => set((x) => { x.location = e.currentTarget.checked; })} /> {t('Se puede mostrar con PICTURE')}</label>
        <span class="field-hint">{t('Si no, solo sirve dentro de otros dibujos.')}</span>
        <div class="field">
          <span class="field-label">{t('Localidades con este dibujo')}</span>
          {p.locations.map((l) => (
            <label class="check"><input type="checkbox" checked={l.picture === pic.id}
              onChange={(e) => update((q) => { const L = q.locations.find((x) => x.id === l.id); if (e.currentTarget.checked) L.picture = pic.id; else delete L.picture; })} /> {l.id}</label>
          ))}
        </div>
      </div>
    </div>
  );
}

function PatternSwatch({ g, sel, onClick }) {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current.getContext('2d');
    const img = c.createImageData(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const on = g[y & 7] & (0x80 >> (x & 7)), i = (y * 16 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = on ? 20 : 235; img.data[i + 3] = 255;
    }
    c.putImageData(img, 0, 0);
  }, [g.join()]);
  return <button class={'vec-pat' + (sel ? ' sel' : '')} onClick={onClick} aria-pressed={sel} aria-label={t('Trama')}><canvas ref={ref} width={16} height={16} /></button>;
}

// Estado del editor: el proyecto abierto, deshacer/rehacer y guardado
// automático en el navegador (IndexedDB).
import { useEffect, useState } from 'preact/hooks';
import { newProject } from '../project/template.js';
import { compileProject } from '../project/compile.js';
import { getLang } from '../i18n.js';

const listeners = new Set();
export const store = {
  project: null,
  undo: [], redo: [],
  compiled: null,           // { model, errors, warnings }
  view: { panel: 'juego', sel: {} },
  dirtyAt: 0,
};

export function useStore() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const f = () => setTick((t) => t + 1);
    listeners.add(f);
    return () => listeners.delete(f);
  }, []);
  return store;
}
function emit() { for (const f of listeners) f(); }

// Cambios al proyecto: fn recibe una copia y la modifica
let lastSnap = 0;
export function update(fn, { coalesce = false } = {}) {
  const before = JSON.stringify(store.project);
  const p = JSON.parse(before);
  fn(p);
  const now = Date.now();
  if (!(coalesce && now - lastSnap < 1200)) {
    store.undo.push(before);
    if (store.undo.length > 80) store.undo.shift();
    store.redo = [];
  }
  lastSnap = now;
  store.project = p;
  changed();
}
export function setProject(p, { keepHistory = false } = {}) {
  if (!keepHistory) { store.undo = []; store.redo = []; }
  store.project = p;
  store.view = { panel: store.view.panel || 'juego', sel: {} };
  changed();
}
export function undo() {
  if (!store.undo.length) return;
  store.redo.push(JSON.stringify(store.project));
  store.project = JSON.parse(store.undo.pop());
  changed();
}
export function redo() {
  if (!store.redo.length) return;
  store.undo.push(JSON.stringify(store.project));
  store.project = JSON.parse(store.redo.pop());
  changed();
}
export function go(panel, sel = {}) {
  store.view = { panel, sel: { ...store.view.sel, ...sel } };
  emit();
}

let compileTimer = null, saveTimer = null;
function changed() {
  emit();
  clearTimeout(compileTimer);
  compileTimer = setTimeout(recompile, 250);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveLocal(store.project), 800);
}
export function recompile() {
  try {
    store.compiled = compileProject(store.project);
  } catch (e) {
    store.compiled = { model: null, errors: [{ kind: 'interno', msg: e.message }], warnings: [] };
    console.error(e);
  }
  emit();
  return store.compiled;
}

// ------------------------------------------------------- IndexedDB
const DB = 'rocinante', OS = 'proyectos';
const OLD_DB = 'taller';     // nombre anterior del editor: se lee una vez si no hay nada
function db(name = DB) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(OS);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function saveLocal(p) {
  try {
    const d = await db();
    d.transaction(OS, 'readwrite').objectStore(OS).put(JSON.stringify(p), 'actual');
  } catch { /* sin almacenamiento: no pasa nada */ }
}
async function readFrom(name) {
  const d = await db(name);
  return new Promise((res) => {
    const r = d.transaction(OS).objectStore(OS).get('actual');
    r.onsuccess = () => res(r.result ? JSON.parse(r.result) : null);
    r.onerror = () => res(null);
  });
}
export async function loadLocal() {
  try { return (await readFrom(DB)) || (await readFrom(OLD_DB)); } catch { return null; }
}

export async function boot() {
  const p = (await loadLocal()) || newProject(undefined, getLang());
  setProject(p);
  recompile();
}

// Busca un nombre libre a partir de una base
export function freeId(base, taken) {
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}${n++}`;
  return id;
}
export function allIds(p) {
  return new Set([...p.locations.map((x) => x.id), ...p.objects.map((x) => x.id), ...p.messages.map((x) => x.id),
    ...p.processes.map((x) => x.id), ...(p.pictures || []).map((x) => x.id), ...(p.flags || []).map((x) => x.name)]);
}

// Renombra un identificador en todo el proyecto (también en el código)
export function renameId(p, from, to) {
  if (!to || from === to) return;
  const re = new RegExp(`(^|[^A-Za-z0-9_@$])(@?)${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9_])`, 'g');
  for (const pr of p.processes) {
    pr.source = pr.source.split('\n').map((line) => {
      // no tocar comentarios ni textos entre comillas
      let out = '', i = 0, inStr = false;
      for (; i < line.length; i++) {
        if (!inStr && line[i] === ';') break;
        if (line[i] === '"') inStr = !inStr;
      }
      const code = line.slice(0, i), rest = line.slice(i);
      out = code.replace(/"[^"]*"|[^"]+/g, (seg) => (seg.startsWith('"') ? seg : seg.replace(re, (_, a, b) => `${a}${b}${to}`)));
      return out + rest;
    }).join('\n');
  }
  for (const l of p.locations) {
    if (l.id === from) l.id = to;
    for (const e of l.exits || []) if (e.to === from) e.to = to;
    if (l.picture === from) l.picture = to;
  }
  for (const o of p.objects) { if (o.id === from) o.id = to; if (o.loc === from) o.loc = to; }
  for (const m of p.messages) if (m.id === from) m.id = to;
  for (const pr of p.processes) if (pr.id === from) pr.id = to;
  for (const pic of p.pictures || []) if (pic.id === from) pic.id = to;
  for (const f of p.flags || []) if (f.name === from) f.name = to;
}
